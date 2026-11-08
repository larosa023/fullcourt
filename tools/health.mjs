// Health check, every 6 hours on GitHub (.github/workflows/health.yml). Looks at:
//  - data: each data branch's file is fresh (its "updated" time) and looks complete
//  - jobs: the last run of every GitHub Actions workflow didn't fail
//  - ESPN: the feeds the site reads still return what the site expects (the fields it uses are there)
//  - sites: Netlify, Cloudflare Pages and GitHub Pages all serve the current build, and GitHub Pages allows the
//    Windows app to load it (Access-Control-Allow-Origin)
// Writes health.json (published to the health-data branch, shown in Settings → Data status) and keeps one GitHub issue
// up to date: opened when something's wrong (GitHub emails the repo owner), closed when everything's fine again.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const REPO = process.env.GITHUB_REPOSITORY || 'larosa023/fullcourt', TOKEN = process.env.GITHUB_TOKEN, EVENT = process.env.GITHUB_EVENT_NAME || 'manual';
const RAW = `https://raw.githubusercontent.com/${REPO}`, GH = `https://api.github.com/repos/${REPO}`;
const UA = 'Mozilla/5.0 (compatible; fullcourt-health/1.0; +https://github.com/larosa023/fullcourt)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function req(url, opt = {}) {
  let last;
  for (let a = 0; a < 3; a++) {
    try { const r = await fetch(url, { ...opt, headers: { 'user-agent': UA, ...(opt.headers || {}) } }); if (r.status >= 500 || r.status === 429) throw new Error(`HTTP ${r.status}`); return r; }
    catch (e) { last = e; await sleep(2500 * (a + 1)); }
  }
  throw last;
}
const json = async url => { const r = await req(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const ghApi = (path, opt = {}) => req(GH + path, { ...opt, headers: { accept: 'application/vnd.github+json', ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}), ...(opt.headers || {}) } });
const now = Date.now(), M = new Date().getUTCMonth() + 1;
const nbaOn = M >= 10 || M <= 6;
const out = { updated: new Date().toISOString(), ok: true, data: [], jobs: [], espn: [], sites: [] };
const add = (list, name, ok, note = '', extra = {}) => { out[list].push({ name, ok, note, ...extra }); if (!ok) out.ok = false; };
const ago = h => h < 1 ? `${Math.round(h * 60)} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;

// ---------- data branches ----------
const DATA = [
  { name: 'Odds (prop lines)', file: 'odds-data/odds.json', maxH: 30, when: nbaOn, ok: d => Array.isArray(d.events) },
  { name: 'Highlights', file: 'yt-data/highlights.json', maxH: 3, ok: d => d.games && typeof d.games === 'object' },
  { name: 'Salary cap', file: 'cap-data/contracts.json', maxH: 8 * 24, ok: d => Object.keys(d.seasons || d.teams || {}).length > 0 },
  { name: 'History (NBA)', file: 'hist-data/history.json', maxH: 8 * 24 + 6, ok: d => Object.keys(d.legends || {}).length > 50 },
  { name: 'History (WNBA)', file: 'hist-data/history-wnba.json', maxH: 15 * 24, ok: d => Object.keys(d.legends || {}).length > 10 },
  { name: 'Mock Draft', file: 'draft-data/draft.json', maxH: 30, ok: d => (d.nba?.prospects?.length || 0) > 30 && (d.nba?.order?.length || 0) >= 30 },
  { name: 'Nicknames', file: 'nick-data/nicknames.json', maxH: 30, ok: d => Object.keys(d.players || {}).length > 200 },
  { name: 'Coaches', file: 'coach-data/coaches.json', maxH: 8 * 24 + 6, ok: d => Object.keys(d.nba?.teams || {}).length >= 25 },
  { name: 'Playoff odds', file: 'sim-data/sim.json', maxH: 8, ok: d => (d.nba?.teams?.length || 0) === 30 },
];
for (const D of DATA) {
  try {
    const d = await json(`${RAW}/${D.file}?t=${now}`), h = (now - Date.parse(d.updated)) / 3600e3;
    if (!d.updated || isNaN(h)) { add('data', D.name, false, 'no "updated" time in the file'); continue; }
    const shape = D.ok(d), stale = D.when !== false && h > D.maxH;
    add('data', D.name, shape && !stale, !shape ? `updated ${ago(h)} but the file looks incomplete` : stale ? `stale: last updated ${ago(h)} (expected every ${D.maxH < 48 ? D.maxH + ' h' : Math.round(D.maxH / 24) + ' days'})` : `updated ${ago(h)}`, { at: d.updated });
  } catch (e) { add('data', D.name, false, `couldn't read ${D.file}: ${e.message}`); }
}

// ---------- workflows ----------
try {
  const wf = (await (await ghApi('/actions/workflows?per_page=100')).json()).workflows || [];
  for (const w of wf) {
    if (/health\.yml$/.test(w.path) || w.state !== 'active' || !existsSync(w.path)) continue; // skip workflows since deleted
    const runs = (await (await ghApi(`/actions/workflows/${w.id}/runs?per_page=5&status=completed`)).json()).workflow_runs || [];
    const r = runs.find(x => !['cancelled', 'skipped'].includes(x.conclusion)); if (!r) continue;
    const ok = r.conclusion === 'success';
    add('jobs', w.name, ok, `${ok ? 'last run passed' : `last run ${r.conclusion}`} ${ago((now - Date.parse(r.updated_at)) / 3600e3)}`, ok ? {} : { url: r.html_url });
  }
} catch (e) { add('jobs', 'GitHub Actions', false, `couldn't list workflow runs: ${e.message}`); }

// ---------- ESPN feeds ----------
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball', STD = 'https://site.api.espn.com/apis/v2/sports/basketball', WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball';
async function espn(name, url, test) {
  try { const d = await json(url), bad = test(d); add('espn', name, !bad, bad || 'ok'); return d; }
  catch (e) { add('espn', name, false, e.message); return null; }
}
const need = (cond, what) => cond ? '' : what;
const season = M >= 8 ? new Date().getUTCFullYear() + 1 : new Date().getUTCFullYear();
const sb = await espn('NBA scoreboard', `${SITE}/nba/scoreboard`, d => need(Array.isArray(d.events), 'no events list') || need(d.events.every(e => e.competitions?.[0]?.competitors?.length === 2 && e.competitions[0].competitors.every(c => c.team?.abbreviation && 'score' in c)), 'games are missing teams or scores'));
const sched = await espn('NBA team schedule', `${SITE}/nba/teams/1/schedule?season=${season}&seasontype=2`, d => need((d.events || []).length > 50, 'fewer than 50 games') || need(d.events.every(e => e.competitions?.[0]?.status?.type?.state), 'games are missing their status'));
const lastGame = (sched?.events || []).filter(e => e.competitions[0].status.type.state === 'post').at(-1)?.id || sb?.events?.find(e => e.status?.type?.state === 'post')?.id;
if (lastGame) await espn('NBA box score (summary)', `${SITE}/nba/summary?event=${lastGame}`, d => need(d.boxscore?.players?.length === 2, 'no player box score') || need(d.boxscore.players.every(t => t.statistics?.[0]?.athletes?.length && t.statistics[0].names?.length), 'box score has no player rows') || need(d.header?.competitions?.[0]?.competitors?.length === 2, 'no game header'));
else if (nbaOn) add('espn', 'NBA box score (summary)', false, 'no finished game found to test with');
await espn('NBA standings', `${STD}/nba/standings?season=${season}`, d => need(d.children?.length === 2, 'not split into two conferences') || need(d.children.every(c => (c.standings?.entries?.length || 0) >= 15), 'conferences have fewer than 15 teams') || need(d.children[0].standings.entries[0].stats?.some(s => s.name === 'wins'), 'no wins column'));
await espn('NBA teams', `${SITE}/nba/teams`, d => need((d.sports?.[0]?.leagues?.[0]?.teams?.length || 0) === 30, 'not 30 teams'));
await espn('NBA roster', `${SITE}/nba/teams/2/roster`, d => need((d.athletes || []).length >= 10 && d.athletes.every(a => a.id && a.displayName), 'roster missing players'));
await espn('NBA player profile', `${WEB}/nba/athletes/1966`, d => need(d.athlete?.displayName, 'no player name'));
await espn('NBA player stats', `${WEB}/nba/athletes/1966/stats`, d => need((d.categories || []).length > 0, 'no stat categories'));
await espn('NBA game log', `${WEB}/nba/athletes/1966/gamelog`, d => need(d.seasonTypes || d.events, 'no games'));
await espn('NBA league leaders (byathlete)', `${WEB}/nba/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=50&sort=offensive.avgPoints:desc`, d => need((d.athletes || []).length > 10 && (d.categories || []).length > 0, 'no players or stat categories'));
await espn('NBA injuries', `${SITE}/nba/injuries`, d => need(Array.isArray(d.injuries), 'no injuries list'));
await espn('NBA transactions', `${SITE}/nba/transactions?limit=20`, d => need(Array.isArray(d.transactions), 'no transactions list'));
await espn('Scores ticker (header)', 'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=nba', d => need(Array.isArray(d.sports), 'no sports list'));
await espn('WNBA scoreboard', `${SITE}/wnba/scoreboard`, d => need(Array.isArray(d.events), 'no events list'));
await espn('WNBA standings', `${STD}/wnba/standings`, d => need((d.children || []).flatMap(c => c.standings?.entries || []).length >= 12, 'fewer than 12 teams'));
await espn('Men\'s college scoreboard', `${SITE}/mens-college-basketball/scoreboard`, d => need(Array.isArray(d.events), 'no events list'));
await espn('Women\'s college scoreboard', `${SITE}/womens-college-basketball/scoreboard`, d => need(Array.isArray(d.events), 'no events list'));
await espn('College rankings', `${SITE}/mens-college-basketball/rankings`, d => need((d.rankings || []).length > 0, 'no polls'));

// ---------- sites ----------
const core = s => s.match(/assets\/core\.([a-z0-9]+)\.js/)?.[1] || null;
const want = core(readFileSync('index.html', 'utf8'));
const commitAge = await (async () => { try { const c = await (await ghApi('/commits/main')).json(); return (now - Date.parse(c.commit.committer.date)) / 60e3; } catch (e) { return 999; } })();
const SITES = [['Netlify', 'https://nbafullcourty.netlify.app/'], ['Cloudflare Pages', 'https://fullcourt-46z.pages.dev/'], ['GitHub Pages', 'https://larosa023.github.io/fullcourt/']];
for (const [name, url] of SITES) {
  try {
    const r = await req(url + 'index.html?t=' + now, { headers: { origin: 'http://tauri.localhost' }, cache: 'no-store' }), html = await r.text(), got = core(html);
    const fresh = got === want, recent = commitAge < 40 || EVENT === 'push';
    let note = fresh ? 'serving the current build' : recent ? `still deploying the newest build (serving ${got})` : `serving an old build (${got}, newest is ${want})`;
    let ok = r.ok && (fresh || recent);
    if (name === 'GitHub Pages') {
      const acao = r.headers.get('access-control-allow-origin');
      const a = got ? await req(`${url}assets/core.${got}.js`, { method: 'HEAD', headers: { origin: 'http://tauri.localhost' } }) : null;
      const acao2 = a?.headers.get('access-control-allow-origin');
      const cors = acao === '*' && acao2 === '*';
      note += cors ? '; the Windows app can load it (CORS ok)' : `; CORS header missing (page: ${acao || 'none'}, script: ${acao2 || 'none'}), so the Windows app falls back to its built-in copy`;
      ok = ok && cors;
    }
    add('sites', name, ok, r.ok ? note : `HTTP ${r.status}`);
  } catch (e) { add('sites', name, false, e.message); }
}

writeFileSync(process.argv[2] || 'health.json', JSON.stringify(out, null, 1));
const bad = ['data', 'jobs', 'espn', 'sites'].flatMap(k => out[k].filter(x => !x.ok).map(x => ({ ...x, k })));
console.log(out.ok ? 'All good' : `${bad.length} problem(s):`); for (const b of bad) console.log(` - [${b.k}] ${b.name}: ${b.note}`);
for (const k of ['data', 'jobs', 'espn', 'sites']) for (const x of out[k]) if (x.ok) console.log(`   ok [${k}] ${x.name}: ${x.note}`);

// ---------- the GitHub issue ----------
if (!TOKEN) process.exit(0);
const TITLE = 'Fullcourt health check: something needs attention';
const LABEL = { data: 'Data', jobs: 'Background jobs', espn: 'ESPN feeds', sites: 'Websites' };
const open = ((await (await ghApi(`/issues?state=open&per_page=50&creator=${encodeURIComponent('github-actions[bot]')}`)).json()) || []).find(i => i.title === TITLE);
const sig = bad.map(b => `${b.k}:${b.name}`).sort().join('|');
if (bad.length) {
  const body = `@${REPO.split('/')[0]} the health check found ${bad.length} problem${bad.length === 1 ? '' : 's'} (${new Date().toUTCString()}):\n\n` +
    Object.keys(LABEL).filter(k => bad.some(b => b.k === k)).map(k => `**${LABEL[k]}**\n${bad.filter(b => b.k === k).map(b => `- ${b.name}: ${b.note}${b.url ? ` ([run](${b.url}))` : ''}`).join('\n')}`).join('\n\n') +
    `\n\nThis issue updates itself every 6 hours and closes when everything is fine again. Details: [health.json](${RAW}/health-data/health.json) · [the health job](https://github.com/${REPO}/actions/workflows/health.yml)\n\n<!-- sig:${sig} -->`;
  if (!open) await ghApi('/issues', { method: 'POST', body: JSON.stringify({ title: TITLE, body }) });
  else if (!(open.body || '').includes(`<!-- sig:${sig} -->`)) {
    await ghApi(`/issues/${open.number}`, { method: 'PATCH', body: JSON.stringify({ body }) });
    await ghApi(`/issues/${open.number}/comments`, { method: 'POST', body: JSON.stringify({ body: `The problems changed:\n${bad.map(b => `- ${LABEL[b.k]} · ${b.name}: ${b.note}`).join('\n')}` }) });
  }
} else if (open) {
  await ghApi(`/issues/${open.number}/comments`, { method: 'POST', body: JSON.stringify({ body: 'Everything checks out again, closing.' }) });
  await ghApi(`/issues/${open.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: 'completed' }) });
}
