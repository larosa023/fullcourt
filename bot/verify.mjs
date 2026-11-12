// Proof that a request really came from Discord: every request is signed with the bot's key, and Discord drops a bot
// whose address accepts unsigned ones. The public half of that key isn't a secret. The setup job (tools/discord.mjs)
// reads it from Discord and saves it on the discord-data branch, so nothing has to be typed into Cloudflare; a
// DISCORD_PUBLIC_KEY setting on the Cloudflare project, if there is one, wins.
// app.json may also carry a second key, "test": the end-to-end check adds one for a few minutes so it can send signed
// test commands to the live address, then takes it away. It unlocks nothing Discord's own key doesn't: the same
// read-only commands.
const APP_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/discord-data/app.json';
let APP = null, readAt = 0;

export async function appInfo(env, fresh = false) {
  if (env?.DISCORD_PUBLIC_KEY) return { key: env.DISCORD_PUBLIC_KEY, id: env.DISCORD_APP_ID || null };
  const age = Date.now() - readAt;
  if (APP ? (fresh ? age < 60e3 : age < 600e3) : age < 20e3) return APP; // re-read at most once a minute, even when asked to
  readAt = Date.now();
  try {
    const r = await fetch(`${APP_URL}?t=${Math.floor(Date.now() / 60e3)}`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) { const j = await r.json(); if (/^[0-9a-f]{64}$/i.test(j?.key || '')) APP = { key: j.key, id: j.id || null, test: /^[0-9a-f]{64}$/i.test(j.test || '') ? j.test : null }; }
  } catch (e) {}
  return APP;
}

const bytes = hex => { const b = new Uint8Array(hex.length / 2); for (let i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16); return b; };
export async function signedBy(keyHex, signature, timestamp, body) {
  try {
    if (!/^[0-9a-f]{128}$/i.test(signature || '') || !timestamp) return false;
    const key = await crypto.subtle.importKey('raw', bytes(keyHex), { name: 'Ed25519' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'Ed25519' }, key, bytes(signature), new TextEncoder().encode(timestamp + body));
  } catch (e) { return false; }
}

// true when the request is signed by the bot's key (re-reading the key once if it may have been changed)
export async function fromDiscord(request, body, env) {
  const sig = request.headers.get('x-signature-ed25519'), ts = request.headers.get('x-signature-timestamp');
  const ok = async a => !!a && (await signedBy(a.key, sig, ts, body) || (!!a.test && await signedBy(a.test, sig, ts, body)));
  const app = await appInfo(env);
  if (await ok(app)) return true;
  if (!sig || !ts || env?.DISCORD_PUBLIC_KEY) return false;
  const again = await appInfo(env, true);
  return !!again && (again.key !== app?.key || again.test !== app?.test) && ok(again);
}
