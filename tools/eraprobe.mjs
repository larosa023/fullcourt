// One-off: exercise the Discord bot's address on Cloudflare end to end, before the real bot exists.
//   key: make a throwaway signing key and write its public half as pub/app.json (pushed to discord-data by the workflow)
//   run: wait until the address has picked that key up, send signed test commands, save what came back
// The private half never leaves this run. Afterwards the workflow blanks discord-data again.
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { generateKeyPairSync, createPrivateKey, sign } from 'node:crypto';
const URL_ = 'https://fullcourt-46z.pages.dev/api/discord', TMP = process.env.RUNNER_TEMP || '/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const peek = async () => { try { const r = await fetch(URL_); const t = await r.text(); try { return { status: r.status, ...JSON.parse(t) }; } catch (e) { return { status: r.status, text: t.slice(0, 120) }; } } catch (e) { return { error: e.message }; } };

if (process.argv[2] === 'key') {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
  writeFileSync(`${TMP}/priv.pem`, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  mkdirSync('pub', { recursive: true }); mkdirSync('probe', { recursive: true });
  writeFileSync('pub/app.json', JSON.stringify({ id: null, name: 'test', key: pub, updated: new Date().toISOString() }));
  writeFileSync('probe/before.json', JSON.stringify(await peek()));
  console.log('before:', readFileSync('probe/before.json', 'utf8'), 'test key', pub.slice(0, 8));
} else {
  const key = JSON.parse(readFileSync('pub/app.json', 'utf8')).key, priv = createPrivateKey(readFileSync(`${TMP}/priv.pem`));
  let seen; for (let n = 0; n < 60; n++) { seen = await peek(); if (seen.ready && seen.key === key.slice(0, 8)) break; if (n % 6 === 0) console.log('waiting…', JSON.stringify(seen)); await sleep(10000); }
  // the newest deploy answers ?check=1 with which feeds Cloudflare can reach
  let feeds = null; for (let n = 0; n < 30 && !feeds; n++) { try { feeds = (await (await fetch(URL_ + '?check=1')).json()).feeds || null; } catch (e) {} if (!feeds) await sleep(10000); }
  console.log('feeds', JSON.stringify(feeds));
  const out = { address: seen, feeds, tests: [] };
  const send = async (label, body, bad) => {
    const ts = String(Math.floor(Date.now() / 1000)), raw = JSON.stringify(body); let sig = sign(null, Buffer.from(ts + raw), priv).toString('hex'); if (bad) sig = (sig[0] === '0' ? '1' : '0') + sig.slice(1);
    const t0 = Date.now(); let r, text = '';
    try { r = await fetch(URL_, { method: 'POST', headers: { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts, 'content-type': 'application/json' }, body: raw }); text = await r.text(); } catch (e) { text = 'ERR ' + e.message; }
    let j = null; try { j = JSON.parse(text); } catch (e) {}
    const d = j?.data, e = d?.embeds?.[0];
    const rec = { label, status: r?.status, ms: Date.now() - t0, type: j?.type, onlyYou: !!d?.flags, title: e?.title, text: (e?.description || d?.content || (d?.choices ? d.choices.map(c => c.name).join(' | ') : text)).slice(0, 260), fields: e?.fields?.map(f => `${f.name}: ${f.value.slice(0, 120)}`), size: text.length };
    out.tests.push(rec); console.log(JSON.stringify(rec));
  };
  const cmd = (name, o = {}) => ({ type: 2, application_id: '1', token: 'probe', data: { name, options: Object.entries(o).map(([name, value]) => ({ name, value, type: 3 })) } });
  if (seen.ready && seen.key === key.slice(0, 8)) {
    await send('ping', { type: 1 });
    await send('bad signature', { type: 1 }, true);
    for (let pass = 1; pass <= 2; pass++) {
      await send(`score #${pass}`, cmd('score'));
      await send(`score knicks yesterday #${pass}`, cmd('score', { team: 'nba:18', day: '-1' }));
      await send(`standings #${pass}`, cmd('standings'));
      await send(`player (typed) #${pass}`, cmd('player', { player: 'wembanyama' }));
      await send(`player (picked) #${pass}`, cmd('player', { player: 'nba:3934672:Jalen Brunson' }));
      await send(`team #${pass}`, cmd('team', { team: 'lakers' }));
      await send(`leaders #${pass}`, cmd('leaders', { stat: 'avgPoints' }));
      await send(`props #${pass}`, cmd('props', { player: 'nba:3136193:Devin Booker' }));
      await send(`injuries #${pass}`, cmd('injuries', { team: 'okc' }));
      await send(`highlights #${pass}`, cmd('highlights'));
      await send(`highlights lakers #${pass}`, cmd('highlights', { team: 'lakers' }));
      await send(`wnba standings #${pass}`, cmd('standings', { league: 'wnba' }));
      await send(`suggest player #${pass}`, { type: 4, data: { name: 'player', options: [{ name: 'player', value: 'curry', type: 3, focused: true }] } });
      await send(`suggest team #${pass}`, { type: 4, data: { name: 'team', options: [{ name: 'team', value: 'new', type: 3, focused: true }] } });
    }
  }
  writeFileSync('probe/bot.json', JSON.stringify(out, null, 1));
  writeFileSync('probe/_status.txt', `bot probe: ${out.tests.length} requests, ready=${!!seen.ready}`);
}
