// One-off: what ESPN's odds feed says for a game that's in progress (live lines?) and for one that's final.
import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('probe', { recursive: true });
const out = [], log = (...a) => { const s = a.join(' '); console.log(s); out.push(s); };
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba';
const j = u => fetch(u).then(r => r.ok ? r.json() : { status: r.status });
for (const id of ['401909993', '401909990']) {
  const o = await j(`${CORE}/events/${id}/competitions/${id}/odds?lang=en&region=us`);
  log(`== ${id}: ${o.count ?? 0} providers`);
  for (const it of o.items || []) {
    log(`  ${it.provider?.name} (${it.provider?.id}) details=${it.details} ou=${it.overUnder} spread=${it.spread} keys=${JSON.stringify(Object.keys(it))}`);
    for (const side of ['homeTeamOdds', 'awayTeamOdds']) { const t = it[side] || {}; log(`    ${side}: ml=${t.moneyLine} spreadOdds=${t.spreadOdds} keys=${JSON.stringify(Object.keys(t))} open=${JSON.stringify(t.open)?.slice(0, 220)} close=${JSON.stringify(t.close)?.slice(0, 220)} current=${JSON.stringify(t.current)?.slice(0, 300)}`); }
    for (const k of ['open', 'close', 'current']) if (it[k]) log(`    ${k}: ${JSON.stringify(it[k]).slice(0, 400)}`);
  }
  const ref = o.items?.[0]?.$ref;
  if (ref) { const mv = await j(ref.replace('http:', 'https:').replace(/\?.*$/, '') + '/history/0/movement?limit=30'); log('  movement:', JSON.stringify(mv)?.slice(0, 900)); }
}
writeFileSync('probe/odds.txt', out.join('\n')); writeFileSync('probe/_status.txt', 'odds probe done');
