// One-off: exercise the Discord bot on Cloudflare end to end after the image-card rebuild.
//   cards: wait for the new code, then draw a lot of different cards (one after another, then a burst) and note any
//          that fail; Cloudflare's free plan allows ~10 ms of processor time per request and this is the heavy part
//   key:   add a throwaway signing key beside the bot's real one in app.json (the workflow pushes it to discord-data)
//   run:   send signed commands, button presses and menu choices to the live address and fetch each reply's picture
// The private half of the throwaway key never leaves this run; the workflow restores app.json afterwards.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
const SITE = 'https://fullcourt-46z.pages.dev', BOT = SITE + '/api/discord', TMP = process.env.RUNNER_TEMP || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const view = v => [v.k, ...Object.entries(v).filter(([k]) => k !== 'k').map(([k, x]) => `${k}=${x}`)].join('|');
const cardUrl = v => `${SITE}/api/card?v=${encodeURIComponent(view(v))}`;
mkdirSync('probe', { recursive: true });
let shots = 0;
async function grab(label, url, save) {
  const t0 = Date.now(); let rec;
  try { const r = await fetch(url), b = Buffer.from(await r.arrayBuffer()), png = b.subarray(1, 4).toString() === 'PNG'; rec = { label, status: r.status, ms: Date.now() - t0, bytes: b.length, how: r.headers.get('x-card') || '', png, ...(png ? { size: `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` } : { body: b.toString('utf8').replace(/\s+/g, ' ').slice(0, 160) }) }; if (png && save) writeFileSync(`probe/${String(++shots).padStart(2, '0')}_${label.replace(/\W+/g, '_').slice(0, 40)}.png`, b); }
  catch (e) { rec = { label, error: e.message, ms: Date.now() - t0 }; }
  console.log(JSON.stringify(rec)); return rec;
}

if (process.argv[2] === 'cards') {
  // the new code answers /api/card?v=x with "no such card"; the old deployment has no such address
  let live = false; for (let n = 0; n < 40 && !live; n++) { try { const r = await fetch(`${SITE}/api/card?v=x`), t = await r.text(); live = t.includes('no such card'); if (!live && n % 4 === 0) console.log('waiting for the new code…', r.status, t.slice(0, 60)); } catch (e) { console.log('waiting…', e.message); } if (!live) await sleep(10000); }
  const out = { live, feeds: null, cards: [], burst: [], again: [] };
  if (live) {
    try { out.feeds = (await (await fetch(BOT + '?check=1')).json()).feeds; } catch (e) { out.feeds = String(e.message); }
    console.log('feeds', JSON.stringify(out.feeds));
    const day = off => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(Date.now() - 4 * 3600e3 + off * 86400e3)).replace(/-/g, '');
    const sb = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${day(-1)}`)).json(), ids = (sb.events || []).map(e => e.id);
    const list = [[{ k: 'team', lg: 'nba', id: 18 }, 1], [{ k: 'score', lg: 'nba', d: day(0) }, 1], [{ k: 'score', lg: 'nba', d: day(-1) }, 1], [{ k: 'score', lg: 'nba', d: day(-2) }]];
    ids.slice(0, 4).forEach((id, n) => { for (const [tab, side] of [['score'], ['box', 'a'], ['box', 'h'], ['stats'], ['wp']]) list.push([{ k: 'game', lg: 'nba', id, d: day(-1), tab, ...(side ? { side } : {}) }, n === 0]); });
    for (const [id, n] of [[3934672, 1], [5104157, 0], [3975, 0], [3945274, 0], [4065648, 0]]) for (const tab of ['season', 'log', 'career']) list.push([{ k: 'player', lg: 'nba', id, tab }, n]);
    list.push([{ k: 'player', lg: 'wnba', id: 3149391, tab: 'season' }, 1], [{ k: 'compare', lg: 'nba', a: 3975, b: 3934672 }, 1], [{ k: 'compare', lg: 'nba', a: 3945274, b: 5104157 }]);
    for (const id of [13, 2, 25, 9, 24]) list.push([{ k: 'team', lg: 'nba', id }]); list.push([{ k: 'team', lg: 'wnba', id: 9 }]);
    list.push([{ k: 'standings', lg: 'nba', conf: 'both' }, 1], [{ k: 'standings', lg: 'nba', conf: 'east' }, 1], [{ k: 'standings', lg: 'nba', conf: 'west' }], [{ k: 'standings', lg: 'wnba' }]);
    for (const stat of ['avgPoints', 'avgAssists', 'threePointFieldGoalPct', 'avgBlocks']) list.push([{ k: 'leaders', lg: 'nba', stat }, stat === 'avgPoints']);
    list.push([{ k: 'props', id: 4431678, n: 'Tyrese Maxey' }, 1], [{ k: 'props', id: 3136193, n: 'Devin Booker' }], [{ k: 'odds', lg: 'nba', d: day(0) }, 1], [{ k: 'injuries', lg: 'nba', id: 25 }, 1], [{ k: 'injuries', lg: 'nba', id: 13 }], [{ k: 'injuries', lg: 'nba', id: 1 }]);
    for (const [v, save] of list) out.cards.push(await grab(view(v), cardUrl(v), save));
    // ten different cards at once
    const burst = [20, 4, 5, 6, 7, 8, 10, 11, 12, 16].map(id => ({ k: 'team', lg: 'nba', id }));
    out.burst = await Promise.all(burst.map(v => grab('burst ' + view(v), cardUrl(v))));
    // the same list again after a pause (a warmed-up copy, numbers kept from the first pass where they're still fresh)
    await sleep(35000);
    for (const [v] of list.slice(0, 30)) out.again.push(await grab('again ' + view(v), cardUrl(v)));
  }
  const all = [...out.cards, ...out.burst, ...out.again], bad = all.filter(r => !r.png);
  out.summary = { requests: all.length, failed: bad.length, failures: bad.slice(0, 12), slowest: Math.max(0, ...all.map(r => r.ms || 0)), median: all.map(r => r.ms || 0).sort((a, b) => a - b)[all.length >> 1] || 0 };
  console.log('SUMMARY', JSON.stringify(out.summary));
  writeFileSync('probe/cards.json', JSON.stringify(out, null, 1));
} else if (process.argv[2] === 'key') {
  const orig = JSON.parse(readFileSync('orig.json', 'utf8')); if (!/^[0-9a-f]{64}$/i.test(orig.key || '')) throw new Error('app.json has no key: not touching it');
  const { publicKey, privateKey } = generateKeyPairSync('ed25519'), pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  writeFileSync(`${TMP}/priv.pem`, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  mkdirSync('pub', { recursive: true }); writeFileSync('pub/app.json', JSON.stringify({ ...orig, test: pub }));
  console.log('real key', orig.key.slice(0, 8), 'test key', pub.slice(0, 8));
} else {
  const key = JSON.parse(readFileSync('pub/app.json', 'utf8')).test, priv = createPrivateKey(readFileSync(`${TMP}/priv.pem`));
  const out = { seen: null, tests: [] };
  const send = async (label, body, bad) => {
    const ts = String(Math.floor(Date.now() / 1000)), raw = JSON.stringify(body); let sig = sign(null, Buffer.from(ts + raw), priv).toString('hex'); if (bad) sig = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    const t0 = Date.now(); let r, text = '';
    try { r = await fetch(BOT, { method: 'POST', headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts, 'content-type': 'application/json' }, body: raw }); text = await r.text(); } catch (e) { text = 'ERR ' + e.message; }
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    const d = j?.data, e = d?.embeds?.[0];
    const rec = { label, status: r?.status, ms: Date.now() - t0, type: j?.type, onlyYou: !!d?.flags, title: e?.title, text: (e?.description || d?.content || (d?.choices ? d.choices.map(c => c.name).join(' | ') : text)).slice(0, 200), image: e?.image?.url, thumb: e?.thumbnail?.url, buttons: (d?.components || []).map(row => row.components.map(c => (c.type === 3 ? `{${c.options.length} choices}` : c.label)).join(' | ')), size: text.length };
    console.log(JSON.stringify(rec));
    if (rec.image) { rec.img = [await grab(label + ' image', rec.image, true), await grab(label + ' image again', rec.image)].map(x => `${x.status} ${x.bytes}B ${x.ms}ms ${x.how}${x.png ? '' : ' NOT PNG ' + (x.body || x.error)}`); }
    out.tests.push(rec); return d;
  };
  // wait for the address to pick the test key up (it re-reads app.json at most once a minute)
  let ok = false; for (let n = 0; n < 40 && !ok; n++) { const ts = String(Math.floor(Date.now() / 1000)), raw = '{"type":1}', sig = sign(null, Buffer.from(ts + raw), priv).toString('hex'); try { const r = await fetch(BOT, { method: 'POST', headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts, 'content-type': 'application/json' }, body: raw }); ok = r.status === 200; if (!ok && n % 4 === 0) console.log('waiting for the test key…', r.status); } catch (e) {} if (!ok) await sleep(8000); }
  try { out.seen = await (await fetch(BOT)).json(); } catch (e) {} console.log('address', JSON.stringify(out.seen), 'test key accepted', ok, key.slice(0, 8));
  const cmd = (name, o = {}) => ({ type: 2, application_id: '1', token: 'probe', data: { name, options: Object.entries(o).map(([name, value]) => ({ name, value, type: 3 })) } });
  const press = (custom_id, values) => ({ type: 3, application_id: '1', token: 'probe', data: { custom_id, ...(values ? { values } : {}) } });
  if (ok) {
    await send('ping', { type: 1 }); await send('bad signature', { type: 1 }, true);
    const sc = await send('score', cmd('score')); await send('score yesterday', cmd('score', { day: '-1' }));
    const g = await send('game knicks', cmd('game', { team: 'nba:18' }));
    for (const c of (g?.components || []).flatMap(r => r.components).filter(c => c.custom_id)) await send('press ' + c.label, press(c.custom_id));
    const m = (sc?.components || []).flatMap(r => r.components).find(c => c.type === 3); if (m) await send('menu ' + m.options[0].label, press(m.custom_id, [m.options[0].value]));
    await send('game box', cmd('game', { team: 'lakers', show: 'box' }));
    const p = await send('player', cmd('player', { player: 'nba:3934672:Jalen Brunson' }));
    for (const c of (p?.components || []).flatMap(r => r.components).filter(c => c.custom_id)) await send('press ' + c.label, press(c.custom_id));
    await send('player typed', cmd('player', { player: 'wembanyama', show: 'log' })); await send('compare', cmd('compare', { player: 'curry', against: 'giannis' }));
    await send('team', cmd('team', { team: 'celtics' })); await send('standings', cmd('standings')); await send('standings east', cmd('standings', { conference: 'east' })); await send('wnba standings', cmd('standings', { league: 'wnba' }));
    const l = await send('leaders', cmd('leaders')); const lm = (l?.components || []).flatMap(r => r.components).find(c => c.type === 3); if (lm) await send('menu ' + lm.options[2].label, press(lm.custom_id, [lm.options[2].value]));
    await send('props', cmd('props', { player: 'nba:4431678:Tyrese Maxey' })); await send('odds', cmd('odds')); await send('injuries', cmd('injuries', { team: 'okc' })); await send('highlights', cmd('highlights')); await send('help', cmd('help'));
    for (const q of ['did the knicks win last night', 'wemby stats', 'curry vs brunson', 'who leads the league in assists', 'lakers injuries', 'booker props', 'celtics box score', 'east standings', 'what is the meaning of life']) await send('ask: ' + q, cmd('ask', { question: q }));
    await send('old button', press('nonsense|x=1')); await send('unknown player', cmd('player', { player: 'zzzzqq' }));
    await send('suggest player', { type: 4, data: { name: 'compare', options: [{ name: 'against', value: 'tatum', type: 3, focused: true }] } }); await send('suggest ask', { type: 4, data: { name: 'ask', options: [{ name: 'question', value: 'stand', type: 3, focused: true }] } });
  }
  const t = out.tests; out.summary = { accepted: ok, requests: t.length, not200: t.filter(x => x.status !== 200 && x.label !== 'bad signature').map(x => `${x.label}: ${x.status}`), deferred: t.filter(x => x.type === 5 || x.type === 6).map(x => x.label), imagesBad: t.filter(x => x.img?.some(s => !s.startsWith('200'))).map(x => `${x.label}: ${x.img.join(' / ')}`), slowest: Math.max(0, ...t.map(x => x.ms || 0)) };
  console.log('SUMMARY', JSON.stringify(out.summary));
  writeFileSync('probe/bot.json', JSON.stringify(out, null, 1));
  writeFileSync('probe/_status.txt', `bot probe: ${t.length} requests, accepted=${ok}`);
}
