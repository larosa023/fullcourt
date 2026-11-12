// Sets up Fullcourt's Discord bot from GitHub (.github/workflows/discord.yml). The only secret is the bot's token,
// stored as the repo secret DISCORD_TOKEN; everything else is read from Discord with it.
//
//   node tools/discord.mjs app     read the application's id and public key, write pub/app.json (goes to discord-data)
//   node tools/discord.mjs setup   wait for the site's bot address to have that key, point Discord at it, set how the
//                                  app can be installed (servers and personal accounts), and register the slash commands
//
// Without a token it says so and stops quietly, so the job doesn't show as failed before the bot has been created.
import { writeFileSync, mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { COMMANDS } from '../bot/commands.mjs';

const TOKEN = (process.env.DISCORD_TOKEN || '').trim(), MODE = process.argv[2] || 'app';
const BOT_URL = process.env.BOT_URL || 'https://fullcourt-46z.pages.dev/api/discord';
const out = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`); };
const note = t => { console.log(t); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, t + '\n\n'); };
if (!TOKEN) { note('DISCORD_TOKEN isn\'t set yet, so there is nothing to do. Create the bot in Discord\'s developer portal, save its token as the repo secret DISCORD_TOKEN, then run this job again.'); out('ready', 'no'); process.exit(0); }

async function discord(method, path, body) {
  const r = await fetch('https://discord.com/api/v10' + path, { method, headers: { authorization: `Bot ${TOKEN}`, 'content-type': 'application/json', 'user-agent': 'DiscordBot (https://github.com/larosa023/fullcourt, 1.0)' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
  if (!r.ok) { const err = new Error(`Discord ${method} ${path} answered ${r.status}: ${text.slice(0, 400)}`); err.status = r.status; throw err; }
  return j;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (MODE === 'app') {
  let app;
  try { app = await discord('GET', '/applications/@me'); } catch (e) { console.error(e.status === 401 ? 'Discord rejected the token. Reset the bot\'s token in the developer portal and save the new one as DISCORD_TOKEN.' : e.message); process.exit(1); }
  const add = `https://discord.com/oauth2/authorize?client_id=${app.id}`;
  mkdirSync('pub', { recursive: true });
  writeFileSync('pub/app.json', JSON.stringify({ id: app.id, name: app.name, key: app.verify_key, address: BOT_URL, add_to_server: `${add}&scope=applications.commands`, add_to_account: `${add}&integration_type=1&scope=applications.commands`, updated: new Date().toISOString() }, null, 1));
  console.log(`application "${app.name}" (${app.id}), key ${app.verify_key.slice(0, 8)}…`);
  out('ready', 'yes');
} else {
  const app = JSON.parse(readFileSync(existsSync('pub/app.json') ? 'pub/app.json' : 'app.json', 'utf8'));
  // 1. the site has to answer with this key before Discord is pointed at it (Discord tests the address on the spot)
  let seen = null;
  for (let n = 0; n < 48; n++) {
    try { const r = await fetch(BOT_URL, { headers: { accept: 'application/json' } }); seen = r.headers.get('content-type')?.includes('json') ? await r.json() : { status: r.status }; } catch (e) { seen = { error: e.message }; }
    if (seen?.ready && seen.key === app.key.slice(0, 8)) break;
    if (n % 6 === 0) console.log('waiting for the bot\'s address to pick up the key…', JSON.stringify(seen));
    await sleep(10000);
  }
  if (!(seen?.ready && seen.key === app.key.slice(0, 8))) { console.error(`The bot's address (${BOT_URL}) didn't come up with the key: ${JSON.stringify(seen)}. If it answers 404, Cloudflare hasn't deployed the functions folder.`); process.exit(1); }
  console.log('the bot\'s address is live with the right key');
  // 2. point Discord at it, and let it be added to servers and to personal accounts
  const install = { 0: { oauth2_install_params: { scopes: ['applications.commands'], permissions: '0' } }, 1: { oauth2_install_params: { scopes: ['applications.commands'] } } };
  try { await discord('PATCH', '/applications/@me', { interactions_endpoint_url: BOT_URL, integration_types_config: install }); }
  catch (e) { console.log('setting the install options was refused, trying the address alone:', e.message); await discord('PATCH', '/applications/@me', { interactions_endpoint_url: BOT_URL }); }
  console.log('Discord accepted the address (it sent a signed test request and got the right answer)');
  // 3. the commands
  let done;
  try { done = await discord('PUT', `/applications/${app.id}/commands`, COMMANDS); }
  catch (e) { console.log('registering with install contexts was refused, trying without:', e.message); done = await discord('PUT', `/applications/${app.id}/commands`, COMMANDS.map(({ integration_types, contexts, ...c }) => c)); }
  note(`### ${app.name} is set up\n\n${done.length} commands registered: ${done.map(c => '`/' + c.name + '`').join(' ')}\n\n- Add it to a server: ${app.add_to_server}\n- Add it to your own account (use it anywhere): ${app.add_to_account}\n\nNew commands can take a minute to appear; restart Discord if they don't.`);
}
