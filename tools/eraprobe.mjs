// One-off: how real push services answer messages signed and encrypted by netlify/push/webpush.mjs (taken from main),
// using made-up device addresses so nothing is delivered; then the deployed alert service, end to end.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createECDH, randomBytes } from 'node:crypto';
import { sendPush, newVapidKeys } from './webpush.mjs';
mkdirSync('probe', { recursive: true });
const out = [], log = (...a) => { const s = a.join(' '); console.log(s); out.push(s); };
const keys = newVapidKeys(), e = createECDH('prime256v1'); e.generateKeys();
const dev = { p256dh: e.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') };
const APPLE = 'https://web.push.apple.com/QGuQyavXutnMPA2uWnfp4KCvxbPRdc3U5Xq3xaUqP0eoiDdqVyU2d0dZUvLz4fzAnZ5sVCaQQ8y5ajPAt7mWq8pFUVbE4K8mEpsKLlgfvvxkqh4GZWXR5TvRwp9EyUpSRVXqUuvq4b5PW5h7dyC8uujgJgCWBSDtNxZKtPCGQm';
const spy = label => async (u, init) => { const r = await fetch(u, init); const t = await r.text(); log(label, new URL(u).host, r.status, t.slice(0, 200).replace(/\s+/g, ' ')); return new Response(t, { status: r.status }); };
for (const endpoint of [APPLE, 'https://fcm.googleapis.com/fcm/send/fake-device-token:APA91bHun4MxP5egoKMwt2KZFBaFUH', 'https://updates.push.services.mozilla.com/wpush/v2/gAAAAABfakefakefake'])
  log(' ->', await sendPush({ endpoint, keys: dev }, { title: 'test' }, { keys, subject: 'https://nbafullcourty.netlify.app', fetchImpl: spy('good signature:') }));
// broken signature (token signed with one key, claims another) and a broken token, to see what a signature problem looks like
await sendPush({ endpoint: APPLE, keys: dev }, { title: 't' }, { keys: { ...keys, publicKey: newVapidKeys().publicKey }, subject: 'https://nbafullcourty.netlify.app', fetchImpl: spy('mismatched key:') });
await fetch(APPLE, { method: 'POST', headers: { TTL: '60', Authorization: 'vapid t=abc.def.ghi, k=' + keys.publicKey, 'Content-Encoding': 'aes128gcm' }, body: 'x' }).then(async r => log('garbage token:', r.status, (await r.text()).slice(0, 160)));
// the deployed service: sign up a made-up Apple device, ask for a test alert, sign off
const API = 'https://nbafullcourty.netlify.app/api/push', post = (w, b) => fetch(`${API}/${w}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }).then(async r => `${r.status} ${await r.text()}`);
log('service key:', (await (await fetch(`${API}/key`)).text()).slice(0, 60));
log('subscribe:', await post('subscribe', { subscription: { endpoint: APPLE, keys: dev }, teams: {}, any: false }));
log('status:', await (await fetch(`${API}/status`)).text());
log('test:', await post('test', { endpoint: APPLE }));
log('status after:', await (await fetch(`${API}/status`)).text());
log('unsubscribe:', await post('unsubscribe', { endpoint: APPLE }));
// the scheduled checker: does it run? (with nobody signed up it records a check every 10 minutes)
for (let n = 0; n < 24; n++) { const s = JSON.parse(await (await fetch(`${API}/status`)).text()); if (s.lastCheck) { log('checker ran at', s.lastCheck, JSON.stringify(s.last || {}), 'sleeping until', s.sleepingUntil); break; } if (n === 23) log('checker has not run yet'); await new Promise(r => setTimeout(r, 30000)); }
writeFileSync('probe/push.txt', out.join('\n'));
writeFileSync('probe/_status.txt', 'push probe done');
