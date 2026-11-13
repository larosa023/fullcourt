// Phone alerts, the sending side: Netlify runs this every minute. It reads today's NBA (and WNBA, in season)
// scoreboard, compares each game with a minute ago and sends the alerts that are due (netlify/push/service.mjs).
// Between games it sleeps: a run then only reads one small record and stops.
import { getStore } from '@netlify/blobs';
import { check } from '../push/service.mjs';

export const config = { schedule: '* * * * *' };

export default async () => {
  try {
    const out = await check(getStore({ name: 'push', consistency: 'strong' }));
    if (!out.slept) console.log('push check', JSON.stringify(out));
  } catch (e) { console.log('push check failed', e?.message); }
  return new Response('ok');
};
