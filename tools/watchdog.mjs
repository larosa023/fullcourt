// Watchdog for the data jobs. GitHub sometimes stops handing jobs to one type of machine (on 2026-11-11 every
// "ubuntu-latest" job sat in the queue for 15 minutes and was then failed, while "ubuntu-22.04" machines kept working).
// This runs every 15 minutes on a different machine type from the one the jobs normally use. For each workflow it looks
// at the newest run on main; if that run never got a machine (still queued after 8 minutes, or failed without running
// a single step) it cancels it if needed and starts the workflow again on the machine type this watchdog is running
// on, which is known to work because this is running. A run it can't help with (stuck on its own machine type, or the
// restart was refused) makes it start the health check, which opens the "needs attention" issue.
//
//   DRY=1 node tools/watchdog.mjs            show what it would do, change nothing
//   FIXTURE=file.json node tools/watchdog.mjs   decide from saved runs instead of the live API (for tests)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || 'larosa023/fullcourt';
const ME = process.env.MY_RUNNER || 'ubuntu-22.04';
const DRY = !!process.env.DRY, FIX = process.env.FIXTURE ? JSON.parse(readFileSync(process.env.FIXTURE, 'utf8')) : null;
const QUEUE_MIN = 8, LOOKBACK_MIN = 120;
const SKIP = /\/(watchdog|desktop)\.yml$/; // itself, and the Windows build (a different kind of machine)
const now = FIX?.now ? Date.parse(FIX.now) : Date.now();
const gh = (path, ...args) => JSON.parse(execFileSync('gh', ['api', `repos/${REPO}${path}`, ...args], { encoding: 'utf8', maxBuffer: 64e6 }) || 'null');
const post = (path, fields = {}) => { if (DRY || FIX) return null; const a = ['api', '-X', 'POST', `repos/${REPO}${path}`]; for (const [k, v] of Object.entries(fields)) a.push('-f', `${k}=${v}`); return execFileSync('gh', a, { encoding: 'utf8' }); };
const mins = t => Math.round((now - Date.parse(t)) / 60000);

// a run "never got a machine" when none of its jobs was picked up by a runner or ran a step
export function stuck(run, jobs) {
  const age = mins(run.created_at);
  const idle = j => !j.runner_name && !(j.steps || []).length;
  if (run.status !== 'completed') return age >= QUEUE_MIN && (run.status === 'queued' || run.status === 'pending' || run.status === 'waiting' || run.status === 'requested' || (run.status === 'in_progress' && jobs.length > 0 && jobs.every(j => j.status === 'queued'))) && jobs.every(idle);
  return ['failure', 'cancelled'].includes(run.conclusion) && mins(run.updated_at) <= LOOKBACK_MIN && jobs.length > 0 && jobs.every(idle);
}

const runs = FIX ? FIX.runs : gh('/actions/runs?per_page=80&branch=main').workflow_runs || [];
const newest = new Map(); // workflow file → its newest run on main
for (const r of runs) { if (r.head_branch !== 'main' || SKIP.test(r.path || '')) continue; const p = newest.get(r.path); if (!p || Date.parse(r.created_at) > Date.parse(p.created_at)) newest.set(r.path, r); }
const did = [], cant = [];
for (const [path, r] of newest) {
  if (r.status === 'completed' && r.conclusion === 'success') continue;
  if (r.status === 'completed' && mins(r.updated_at) > LOOKBACK_MIN) continue;
  if (r.status !== 'completed' && mins(r.created_at) < QUEUE_MIN) continue;
  const jobs = FIX ? FIX.jobs?.[r.id] || [] : gh(`/actions/runs/${r.id}/jobs`).jobs || [];
  if (!stuck(r, jobs)) continue;
  const labels = [...new Set(jobs.flatMap(j => j.labels || []))], file = path.split('/').pop(), what = `${r.name} (#${r.run_number}, ${r.event}, ${r.status === 'completed' ? `failed without a machine ${mins(r.updated_at)} min ago` : `queued ${mins(r.created_at)} min`}, asked for ${labels.join('/') || 'unknown'})`;
  if (labels.includes(ME)) { cant.push(`${what}: stuck on ${ME}, the type this watchdog runs on`); continue; }
  try {
    if (r.status !== 'completed') post(`/actions/runs/${r.id}/cancel`);
    post(`/actions/workflows/${file}/dispatches`, { ref: 'main', 'inputs[runner]': ME });
    did.push(`${what} → started again on ${ME}`);
  } catch (e) { cant.push(`${what}: couldn't restart it (${String(e.message).split('\n')[0]})`); }
}
for (const l of did) console.log('restarted:', l);
for (const l of cant) console.log('NOT FIXED:', l);
if (!did.length && !cant.length) console.log(`all quiet: ${newest.size} workflows checked from ${ME}`);
// something this couldn't fix: run the health check now (on this machine type) so the issue is opened within minutes
if (cant.length) { try { post('/actions/workflows/health.yml/dispatches', { ref: 'main', 'inputs[runner]': ME }); console.log('health check started'); } catch (e) { console.log('could not start the health check:', String(e.message).split('\n')[0]); } }
if (FIX) console.log(JSON.stringify({ did, cant }));
