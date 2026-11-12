// Cloudflare Pages Function: the address Discord sends slash commands to (https://<the Cloudflare site>/api/discord).
// It only checks that the request is really from Discord and hands it to bot/bot.mjs. Nothing runs between commands.
// The pictures in the replies come from the address next door, functions/api/card.js.
import { handle, check } from '../../bot/bot.mjs';
import { appInfo, fromDiscord } from '../../bot/verify.mjs';
import { cacheStore } from '../../bot/store.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function onRequestPost({ request, env, waitUntil }) {
  const body = await request.text();
  if (!(await fromDiscord(request, body, env))) return new Response('invalid request signature', { status: 401 });
  let interaction;
  try { interaction = JSON.parse(body); } catch (e) { return new Response('bad request', { status: 400 }); }
  const site = new URL(request.url).origin;
  return json(await handle(interaction, { site, waitUntil, store: cacheStore(caches.default, site, waitUntil) }));
}

// a plain visit: says whether the bot has its key yet (the setup job waits for this before pointing Discord here)
export async function onRequestGet({ request, env }) {
  const app = await appInfo(env, true), out = { ok: true, service: 'Fullcourt Discord bot', ready: !!app, app: app?.id || null, key: app ? app.key.slice(0, 8) : null, ...(app?.test ? { test: app.test.slice(0, 8) } : {}) };
  if (new URL(request.url).searchParams.has('check')) out.feeds = await check(); // ?check=1: can Cloudflare reach the data
  return json(out);
}
