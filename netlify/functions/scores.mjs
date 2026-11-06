// GET /api/scores?league=nba|wnba|ncaam|ncaaw[&date=YYYYMMDD][&scope=top25|all][&teams=BOS,NY]
//
// A small, trimmed scoreboard for Mantel's desktop widget (and anything else that wants it).
// Same rules as the site: "today" is New York time and doesn't roll over until 4 AM, so late
// West Coast games stay on the night they were played.
//
// Responses are cached at Netlify's edge (15 s while games are live, longer otherwise), so many
// widgets polling the same league cost one function run per cache window, not one per request.

const LEAGUES = {
  nba: 'nba',
  wnba: 'wnba',
  ncaam: 'mens-college-basketball',
  ncaaw: 'womens-college-basketball',
};
const SITE = 'https://nbafullcourty.netlify.app';
const TZ = 'America/New_York';
const ROLLOVER_HOUR = 4;

export const config = { path: '/api/scores' };

export default async (req) => {
  const url = new URL(req.url);
  const league = (url.searchParams.get('league') || 'nba').toLowerCase();
  if (!LEAGUES[league]) return json({ ok: false, error: 'Unknown league. Use nba, wnba, ncaam or ncaaw.' }, 400, 3600);

  const date = /^\d{8}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : todayET();
  const college = league === 'ncaam' || league === 'ncaaw';
  const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'top25';
  const teams = (url.searchParams.get('teams') || '')
    .split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 30);

  const espn = `https://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUES[league]}/scoreboard` +
    `?dates=${date}${college ? '&groups=50&limit=500' : ''}`;

  let data;
  try {
    data = await getJson(espn);
  } catch (e) {
    console.error('scores: feed failed', espn, e);
    return json({ ok: false, error: "Can't reach the score feed right now.", detail: String(e?.message || e) }, 502, 10);
  }

  let games = (data.events || []).map(e => parseGame(e, league)).filter(Boolean);

  // College slates are huge; by default keep games with a ranked team, unless specific teams were asked for.
  if (teams.length) games = games.filter(g => teams.includes(g.home.abbr) || teams.includes(g.away.abbr));
  else if (college && scope === 'top25') games = games.filter(g => g.home.rank || g.away.rank);

  // Live first, then upcoming by start time, then finals (most recent first).
  const order = { in: 0, pre: 1, post: 2 };
  games.sort((a, b) => order[a.state] - order[b.state] ||
    (a.state === 'post' ? b.start.localeCompare(a.start) : a.start.localeCompare(b.start)));

  const live = games.some(g => g.state === 'in');
  const soon = games.some(g => g.state === 'pre' && Date.parse(g.start) - Date.now() < 30 * 60 * 1000);
  return json({
    ok: true,
    league,
    date,
    updated: new Date().toISOString(),
    live,
    // How often a client should poll, so widgets don't have to guess.
    refresh: live ? 20 : soon ? 60 : 600,
    games,
  }, 200, live ? 15 : soon ? 30 : 300);
};

// Same request a browser makes (the site fetches this feed straight from the page). Retries once.
async function getJson(url) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`feed returned HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

function parseGame(e, league) {
  const c = e.competitions?.[0];
  if (!c) return null;
  const st = c.status || e.status || {};
  const t = st.type || {};
  const side = homeAway => {
    const x = (c.competitors || []).find(k => k.homeAway === homeAway);
    if (!x) return null;
    const rank = x.curatedRank?.current;
    return {
      id: x.team?.id,
      abbr: x.team?.abbreviation || '',
      name: x.team?.shortDisplayName || x.team?.name || '',
      score: x.score != null && t.state !== 'pre' ? Number(x.score) : null,
      record: (x.records || []).find(r => r.type === 'total' || r.name === 'overall')?.summary || '',
      rank: rank && rank <= 25 ? rank : null,
      color: x.team?.color ? `#${x.team.color}` : null,
      logo: x.team?.logo || null,
      winner: !!x.winner,
    };
  };
  const home = side('home'), away = side('away');
  if (!home || !away) return null;

  return {
    id: e.id,
    state: t.state || 'pre',           // pre | in | post
    status: t.shortDetail || '',       // "7:30 PM ET", "Q3 4:12", "Halftime", "Final/OT"
    period: st.period || 0,
    clock: st.displayClock || '',
    start: e.date,
    tv: [...new Set((c.broadcasts || []).flatMap(b => b.names || []))].join(' · '),
    note: c.notes?.[0]?.headline || '',
    home,
    away,
    url: `${SITE}/?league=${league}&game=${e.id}`,
  };
}

function todayET() {
  // Shift back by the rollover so 1 AM ET still counts as "last night".
  const shifted = new Date(Date.now() - ROLLOVER_HOUR * 3600 * 1000);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(shifted);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}${get('month')}${get('day')}`;
}

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      // Browsers and the widget may reuse it briefly; Netlify's edge holds it for everyone.
      'Cache-Control': `public, max-age=${Math.min(maxAge, 15)}`,
      'Netlify-CDN-Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      'Netlify-Vary': 'query',
    },
  });
}
