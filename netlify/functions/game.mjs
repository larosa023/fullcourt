// GET /api/game?league=nba|wnba|ncaam|ncaaw&id=<ESPN event id>
//
// One game, trimmed for small screens (Mantel's live game view): score and status, the line
// score by period, team stats side by side, each player's box score line, the latest plays and
// the win probability. Cached at Netlify's edge (10 s while live), so many viewers cost one run.

const LEAGUES = {
  nba: 'nba',
  wnba: 'wnba',
  ncaam: 'mens-college-basketball',
  ncaaw: 'womens-college-basketball',
};
const SITE = 'https://nbafullcourty.netlify.app';

export const config = { path: '/api/game' };

// Team stats to compare, in display order: [ESPN stat name, label, kind]
const TEAM_STATS = [
  ['fieldGoalsMade-fieldGoalsAttempted', 'FG', 'made'],
  ['fieldGoalPct', 'FG%', 'pct'],
  ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT', 'made'],
  ['threePointFieldGoalPct', '3P%', 'pct'],
  ['freeThrowsMade-freeThrowsAttempted', 'FT', 'made'],
  ['totalRebounds', 'Rebounds', 'n'],
  ['offensiveRebounds', 'Off. rebounds', 'n'],
  ['assists', 'Assists', 'n'],
  ['turnovers', 'Turnovers', 'n'],
  ['steals', 'Steals', 'n'],
  ['blocks', 'Blocks', 'n'],
  ['pointsInPaint', 'Paint points', 'n'],
  ['fastBreakPoints', 'Fast break', 'n'],
  ['turnoverPoints', 'Points off TOs', 'n'],
  ['largestLead', 'Largest lead', 'n'],
];

export default async (req) => {
  const url = new URL(req.url);
  const league = (url.searchParams.get('league') || 'nba').toLowerCase();
  const id = url.searchParams.get('id') || '';
  if (!LEAGUES[league]) return json({ ok: false, error: 'Unknown league.' }, 400, 3600);
  if (!/^\d{5,12}$/.test(id)) return json({ ok: false, error: 'Missing or bad game id.' }, 400, 3600);

  let d;
  try {
    const r = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/${LEAGUES[league]}/summary?event=${id}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!r.ok) throw new Error(`feed returned HTTP ${r.status}`);
    d = await r.json();
  } catch (e) {
    return json({ ok: false, error: "Can't reach the game feed right now.", detail: String(e?.message || e) }, 502, 10);
  }

  const comp = d.header?.competitions?.[0] || {};
  const st = comp.status || {};
  const t = st.type || {};
  const competitors = comp.competitors || [];
  const side = ha => competitors.find(c => c.homeAway === ha) || {};
  const home = side('home'), away = side('away');

  const team = c => ({
    id: c.team?.id || c.id,
    abbr: c.team?.abbreviation || '',
    name: c.team?.displayName || c.team?.name || '',
    short: c.team?.shortDisplayName || c.team?.name || '',
    logo: c.team?.logos?.[0]?.href || c.team?.logo || null,
    color: c.team?.color ? `#${c.team.color}` : null,
    score: c.score != null && t.state !== 'pre' ? Number(c.score) : null,
    record: (c.record || []).find(r => r.type === 'total')?.summary || c.record?.[0]?.summary || '',
    linescores: (c.linescores || []).map(l => Number(l.displayValue ?? l.value ?? 0)),
    winner: !!c.winner,
  });

  // Team stats, matched by team id so home/away can't get swapped.
  const boxTeams = d.boxscore?.teams || [];
  const statsFor = teamId => {
    const bt = boxTeams.find(x => String(x.team?.id) === String(teamId));
    const map = {};
    for (const s of bt?.statistics || []) map[s.name] = s.displayValue;
    return map;
  };
  const hs = statsFor(home.team?.id || home.id), as = statsFor(away.team?.id || away.id);
  const stats = TEAM_STATS
    .filter(([key]) => hs[key] != null || as[key] != null)
    .map(([key, label, kind]) => ({ label, kind, away: as[key] ?? '–', home: hs[key] ?? '–' }));

  // Player lines: ESPN gives a label list and each player's values in that order.
  const playersFor = teamId => {
    const group = (d.boxscore?.players || []).find(p => String(p.team?.id) === String(teamId));
    const block = group?.statistics?.[0];
    if (!block) return [];
    const labels = (block.labels || block.names || []).map(l => String(l).toUpperCase());
    const at = (vals, label) => { const i = labels.indexOf(label); return i >= 0 ? vals[i] : null; };
    return (block.athletes || [])
      .filter(a => !a.didNotPlay && (a.stats || []).length)
      .map(a => {
        const v = a.stats;
        const min = Number(at(v, 'MIN')) || 0;
        return {
          name: a.athlete?.displayName || '',
          short: a.athlete?.shortName || a.athlete?.displayName || '',
          jersey: a.athlete?.jersey || '',
          pos: a.athlete?.position?.abbreviation || '',
          starter: !!a.starter,
          active: !!a.active,
          min,
          pts: Number(at(v, 'PTS')) || 0,
          reb: Number(at(v, 'REB')) || 0,
          ast: Number(at(v, 'AST')) || 0,
          stl: Number(at(v, 'STL')) || 0,
          blk: Number(at(v, 'BLK')) || 0,
          to: Number(at(v, 'TO')) || 0,
          fg: at(v, 'FG') || '0-0',
          three: at(v, '3PT') || '0-0',
          ft: at(v, 'FT') || '0-0',
          pm: at(v, '+/-') || '',
        };
      })
      .sort((x, y) => (y.starter - x.starter) || (y.min - x.min) || (y.pts - x.pts));
  };

  // Latest plays, newest first.
  const teamAbbr = {};
  for (const c of competitors) teamAbbr[c.team?.id || c.id] = c.team?.abbreviation;
  const plays = (d.plays || []).slice(-15).reverse().map(p => ({
    period: p.period?.number || 0,
    clock: p.clock?.displayValue || '',
    text: p.text || '',
    team: teamAbbr[p.team?.id] || null,
    scoring: !!p.scoringPlay,
    away: p.awayScore ?? null,
    home: p.homeScore ?? null,
  }));

  const wp = d.winprobability?.length ? d.winprobability[d.winprobability.length - 1]?.homeWinPercentage : null;
  const live = t.state === 'in';

  return json({
    ok: true,
    id,
    league,
    state: t.state || 'pre',
    status: t.shortDetail || t.detail || '',
    period: st.period || 0,
    clock: st.displayClock || '',
    start: comp.date || d.header?.competitions?.[0]?.date || null,
    venue: d.gameInfo?.venue?.fullName || '',
    tv: [...new Set((comp.broadcasts || []).map(b => b.media?.shortName).filter(Boolean))].join(' · '),
    away: team(away),
    home: team(home),
    stats,
    players: { away: playersFor(away.team?.id || away.id), home: playersFor(home.team?.id || home.id) },
    plays,
    homeWinPct: typeof wp === 'number' ? Math.round(wp * 1000) / 10 : null,
    updated: new Date().toISOString(),
    refresh: live ? 15 : t.state === 'pre' ? 300 : 0,
    url: `${SITE}/?league=${league}&game=${id}`,
  }, 200, live ? 10 : t.state === 'pre' ? 120 : 600);
};

function json(body, status, maxAge) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': `public, max-age=${Math.min(maxAge, 10)}`,
      'Netlify-CDN-Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`,
      'Netlify-Vary': 'query',
    },
  });
}
