/* Replay: every finished game's highlights, newest first.
   One scoreboard per day carries each finished game's ESPN "Game Highlights" video, so the feed costs one small
   request per day. A game's individual top-play clips load from its game data only when you open them.
   Past days are kept for the session (they don't change); today is refetched so new games appear. */

const RP = { days: new Map(), team: '', date: '', cursor: null, back: 0, busy: false, done: false, io: null, focus: null };
const RP_MAX_BACK = 45; // how far back the feed scrolls (days)
const RP_FIRST = 8; // games to show before waiting for a scroll

// YouTube videos matched to games by a GitHub job (tools/yt.mjs, branch yt-data): the NBA's full game highlights,
// and for college (men's and women's) the conferences' full game replays, condensed games and highlights
const RP_YT = 'https://raw.githubusercontent.com/larosa023/fullcourt/yt-data/highlights.json';
let rpYtP = null, rpYtAt = 0;
const rpYt = () => { if (!rpYtP || Date.now() - rpYtAt > 10 * 60e3) { rpYtAt = Date.now(); rpYtP = fetch(`${RP_YT}?t=${Math.floor(Date.now() / 600e3)}`).then(r => (r.ok ? r.json() : { games: {} })).then(j => ({ games: j.games || {}, ncaaw: j.ncaaw || {}, ncaam: j.ncaam || {} })).catch(() => ({ games: {}, ncaaw: {}, ncaam: {} })); } return rpYtP; };
const rpNick = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const rpFull = g => { const Y = RP.yt?.games || {}; return Y[`${g.day}|${rpNick(g.away.name)}|${rpNick(g.home.name)}`] || Y[`${g.day}|${rpNick(g.home.name)}|${rpNick(g.away.name)}`] || null; };
const RP_KIND = { full: 'Full game', cond: 'Condensed', ext: 'Extended', hl: 'Highlights' };
// every YouTube video for a game, best first
const rpVids = g => {
  if (IS_C) { const e = RP.yt?.[LGK]?.[g.id] || {}; return ['full', 'cond', 'ext', 'hl'].filter(k => e[k]?.id).map(k => ({ id: e[k].id, title: `${e[k].title}${e[k].src ? ` (${e[k].src} on YouTube)` : ''}`, label: RP_KIND[k] })); }
  const f = rpFull(g); if (!f) return [];
  return [f.id && { id: f.id, title: f.title, label: 'Full game' }, f.ext && { id: f.ext, title: f.extTitle || 'Extended highlights', label: 'Extended' }].filter(Boolean);
};
const rpChips = g => rpVids(g).map(v => `<button class="chip sm rp-full" data-rpfull="${esc(v.id)}" title="${esc(v.title)}">${PLAY_ICON}${esc(v.label)}</button>`).join('');
const rpHas = g => !!g.hl || rpVids(g).length > 0;
// for a game page: does Replay have a video for this game?
async function rpHasVideo(id) { RP.yt = RP.yt || await rpYt(); return IS_C && !!RP.yt?.[LGK]?.[id]; }
const rpVideo = h => { const s = h?.links?.source || {}; const mp4 = s.HD?.href || s.href || s.full?.href || ''; return mp4 ? { id: String(h.id), title: h.headline || 'Game highlights', dur: h.duration || 0, thumb: h.thumbnail || '', mp4 } : null; };
const rpKey = day => `fc-rp:${LGK}:${day}`;
function rpDay(day) {
  if (RP.days.has(day)) return RP.days.get(day);
  const isPast = day < S.today;
  if (isPast) { try { const c = sessionStorage.getItem(rpKey(day)); if (c) { const v = Promise.resolve(JSON.parse(c)); RP.days.set(day, v); return v; } } catch (e) {} }
  const p = getJSON(`${API}/scoreboard?dates=${day}${SB_QS}`, { retries: 1 }).then(d => {
    const games = (d.events || []).map(e => { const g = parseGame(e); return { id: g.id, date: g.date, day, state: g.state, detail: statusText(g), note: g.note, away: g.away, home: g.home, hl: rpVideo(e.competitions?.[0]?.highlights?.[0]) }; }).filter(g => g.hl || (IS_C && g.state === 'post')); // college: a conference's YouTube video may exist when ESPN has none
    games.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (isPast) { try { sessionStorage.setItem(rpKey(day), JSON.stringify(games)); } catch (e) {} }
    return games;
  }).catch(() => { RP.days.delete(day); return []; });
  RP.days.set(day, p);
  return p;
}
const rpMatch = g => !RP.team || String(g.home.id) === RP.team || String(g.away.id) === RP.team;

function rpScore(g) {
  const side = s => `<span class="rp-t${s.winner ? ' w' : ''}">${logo(s.abbr, 48)}<b>${esc(s.abbr)}</b><em>${esc(s.score)}</em></span>`;
  return `<div class="rp-score">${side(g.away)}<i>@</i>${side(g.home)}<span class="rp-st">${esc(g.detail)}</span></div>`;
}
function rpCard(g) {
  return `<article class="rp-card${RP.focus === g.id ? ' focus' : ''}" data-rpg="${esc(g.id)}">
    <div class="rp-stage">${g.hl ? `
      <img src="${esc(g.hl.thumb)}" alt="" loading="lazy" decoding="async">
      <button class="rp-play" data-rpplay aria-label="Play ${esc(g.hl.title)}"><span class="clip-btn">${PLAY_ICON}</span></button>
      <span class="rp-dur">${durText(g.hl.dur)}</span>` : (v => `
      <img src="https://i.ytimg.com/vi/${esc(v.id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">
      <button class="rp-play" data-rpfull="${esc(v.id)}" aria-label="Play ${esc(v.title)}"><span class="clip-btn">${PLAY_ICON}</span></button>
      <span class="rp-dur">${esc(v.label)}</span>`)(rpVids(g)[0] || { id: '', title: '', label: '' })}
    </div>
    <div class="rp-body">
      ${rpScore(g)}
      <div class="rp-act">
        ${rpChips(g)}
        <button class="chip sm" data-rpclips aria-expanded="false">Top plays</button>
        <button class="chip sm" data-game="${esc(g.id)}">Box score</button>
        ${g.note ? `<span class="rp-note">${esc(g.note)}</span>` : ''}
      </div>
      <div class="rp-clips" hidden></div>
    </div>
  </article>`;
}
const rpDayHead = day => `<h3 class="rp-day" data-rpday="${day}">${esc(day === S.today ? 'Today' : day === addDays(S.today, -1) ? 'Yesterday' : fmtDay(day, { weekday: 'long', month: 'short', day: 'numeric' }))}</h3>`;

async function renderReplay() {
  const root = $('#rpBody'); if (!root) return;
  if (S.replayFocus) { RP.focus = S.replayFocus.gid; RP.date = S.replayFocus.day; RP.team = ''; S.replayFocus = null; }
  root.innerHTML = `<div class="rp-ctrl">
      <select class="rp-team" data-rpteam aria-label="Filter by team"><option value="">All teams</option></select>
      <label class="rp-date"><span>Date</span><input type="date" data-rpdate max="${S.today.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}" value="${RP.date ? RP.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : ''}"></label>
      ${RP.date || RP.team ? '<button class="link-btn" data-rpclear>Show all, newest first</button>' : ''}
    </div>
    <div class="rp-feed" id="rpFeed"></div>
    <div class="rp-more" id="rpMore"><div class="sk" style="height:230px;border-radius:16px"></div></div>`;
  rpTeams();
  if (!root._wired) { root._wired = true; wireReplay(root); }
  RP.cursor = RP.date || S.today; RP.back = 0; RP.done = false; RP.shown = 0;
  // NBA: don't hold the feed up for it; college waits a little longer, since some games are only in Replay because of it
  if (LGK === 'nba' || IS_C) RP.yt = await Promise.race([rpYt(), sleep(IS_C ? 5000 : 2500).then(() => RP.yt || null)]);
  rpYt().then(y => { if (y === RP.yt) return; RP.yt = y; $$('.rp-card', root).forEach(c => { if (c.querySelector('.rp-act [data-rpfull]')) return; const g = c._g; if (g) $('.rp-act', c).insertAdjacentHTML('afterbegin', rpChips(g)); }); });
  await rpLoadMore(true);
  if (RP.focus) { const c = $(`.rp-card[data-rpg="${RP.focus}"]`, root); if (c) c.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
  // infinite scroll: load older days as the bottom comes into view
  RP.io?.disconnect();
  RP.io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) rpLoadMore(); }, { rootMargin: '600px' });
  const more = $('#rpMore'); if (more) RP.io.observe(more);
}

async function rpTeams() {
  const sel = $('[data-rpteam]'); if (!sel) return;
  let teams = [];
  if (!IS_C) { await loadStandings().catch(() => null); teams = (S.standings?.confs || []).flatMap(c => c.rows.map(r => S.teams[r.id] || { id: r.id, name: r.name })); }
  if (!teams.length) teams = Object.values(S.teams);
  teams = teams.filter(t => t?.id).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  sel.innerHTML = `<option value="">All teams</option>${teams.map(t => `<option value="${t.id}"${String(t.id) === RP.team ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}`;
}

// add days to the feed until there's enough to fill the screen (or the date filter's single day is in)
async function rpLoadMore(first = false) {
  if (RP.busy || RP.done) return; RP.busy = true;
  const feed = $('#rpFeed'), more = $('#rpMore'); if (!feed) { RP.busy = false; return; }
  const want = RP.shown + (first ? RP_FIRST : 6);
  try {
    while (RP.shown < want && !RP.done) {
      // fetch a few days at a time, newest first
      const days = []; for (let i = 0; i < (RP.team ? 6 : 3) && RP.back <= RP_MAX_BACK; i++) { days.push(addDays(RP.cursor, -RP.back)); RP.back++; if (RP.date) break; }
      if (!days.length) { RP.done = true; break; }
      const lists = await Promise.all(days.map(rpDay));
      if (!feed.isConnected) return;
      days.forEach((day, i) => {
        const games = lists[i].filter(g => rpMatch(g) && rpHas(g)); if (!games.length) return;
        feed.insertAdjacentHTML('beforeend', `${rpDayHead(day)}<div class="rp-grid">${games.map(rpCard).join('')}</div>`);
        games.forEach(g => { const c = feed.querySelector(`.rp-card[data-rpg="${g.id}"]`); if (c) c._g = g; });
        RP.shown += games.length;
      });
      if (RP.date || RP.back > RP_MAX_BACK) RP.done = true;
    }
  } finally { RP.busy = false; }
  if (RP.done && more) more.innerHTML = RP.shown ? `<p class="rp-end">${RP.date ? 'That\'s every game with highlights that day.' : `That's the last ${RP_MAX_BACK} days. Pick a date to go further back.`}</p>` : `<div class="empty"><b>No highlights ${RP.date ? 'for that day' : 'yet'}</b><span>${RP.team ? 'Try another team or date.' : 'Videos appear shortly after each game ends.'}</span></div>`;
}

// play the game's highlights in place: user tap, so sound is on; only one video plays at a time
function rpPlay(card, clip) {
  const stage = $('.rp-stage', card), g = clip || null;
  let v = $('video', stage);
  if (!v) {
    v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.preload = 'auto'; v.disablePictureInPicture = true;
    stage.innerHTML = ''; stage.append(v);
  }
  const src = g?.mp4 || card._hl?.mp4; if (!src) return;
  if (v.src !== src) { v.poster = g?.thumb || card._hl?.thumb || ''; v.src = src; v.muted = true; v.defaultMuted = true; }
  rpStopYt(card);
  v.play().catch(() => {});
}

// put any other card's YouTube player back to its thumbnail (one video at a time)
function rpStopYt(except) {
  $$('.rp-card .rp-stage iframe').forEach(f => { const c = f.closest('.rp-card'); if (c !== except && c._stage) { $('.rp-stage', c).innerHTML = c._stage; $$('[data-rpfull]', c).forEach(b => b.setAttribute('aria-pressed', 'false')); } });
}
function rpPlayFull(card, id) {
  const stage = $('.rp-stage', card);
  $$('#v-replay video').forEach(v => v.pause());
  rpStopYt(card);
  card._stage ||= stage.innerHTML;
  // starts muted (YouTube allows autoplay only when muted); unmute in the player
  stage.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1" title="Game video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe>`;
  $$('[data-rpfull]', card).forEach(b => b.setAttribute('aria-pressed', 'true'));
  if (!$('.rp-yt', card)) $('.rp-act', card).insertAdjacentHTML('beforeend', `<a class="rp-yt" href="https://www.youtube.com/watch?v=${encodeURIComponent(id)}" target="_blank" rel="noopener">YouTube ↗</a>`);
}
function wireReplay(root) {
  root.addEventListener('change', e => {
    const t = e.target.closest('[data-rpteam]'); if (t) { RP.team = t.value; RP.focus = null; renderReplay(); return; }
    const d = e.target.closest('[data-rpdate]'); if (d) { RP.date = d.value ? d.value.replace(/-/g, '') : ''; RP.focus = null; renderReplay(); }
  });
  root.addEventListener('click', async e => {
    if (e.target.closest('[data-rpclear]')) { RP.date = ''; RP.team = ''; RP.focus = null; renderReplay(); return; }
    const card = e.target.closest('.rp-card'); if (!card) return;
    const day = card.closest('.rp-grid')?.previousElementSibling?.dataset.rpday;
    if (!card._hl) { const games = day ? await rpDay(day) : []; card._hl = games.find(x => x.id === card.dataset.rpg)?.hl; }
    const fg = e.target.closest('[data-rpfull]'); if (fg) { rpPlayFull(card, fg.dataset.rpfull); return; }
    if (e.target.closest('[data-rpplay]')) { if (card._stage && $('iframe', card)) { $('.rp-stage', card).innerHTML = card._stage; } rpPlay(card); return; }
    const tp = e.target.closest('[data-rpclips]');
    if (tp) {
      const box = $('.rp-clips', card), open = box.hidden; box.hidden = !open; tp.setAttribute('aria-expanded', open);
      if (open && !box.dataset.done) {
        box.innerHTML = '<div class="sk" style="height:96px;border-radius:12px"></div>';
        const d = await getJSON(`${API}/summary?event=${card.dataset.rpg}`).catch(() => null);
        const clips = d ? clipList(d) : []; card._clips = clips; box.dataset.done = '1';
        box.innerHTML = clips.length ? `<div class="clip-list hs drag-x" data-drag>${clips.map((x, i) => `<button class="clip-t" data-rpclip="${i}"><span class="ct-img">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy" draggable="false">` : ''}<em>${durText(x.dur)}</em></span><span class="ct-txt">${esc(x.title)}</span></button>`).join('')}</div>` : '<p class="rp-end">No individual clips for this game.</p>';
        wireDrag(box);
      }
      return;
    }
    const c = e.target.closest('[data-rpclip]');
    if (c) { const clip = card._clips?.[+c.dataset.rpclip]; $$('.clip-t', card).forEach(b => b.classList.toggle('on', b === c)); rpPlay(card, clip); }
  });
  // one video at a time, and a video scrolled out of view pauses
  root.addEventListener('play', e => { $$('video', root).forEach(v => { if (v !== e.target && !v.paused) v.pause(); }); }, true);
  const vio = new IntersectionObserver(es => es.forEach(x => { if (!x.isIntersecting && x.target.tagName === 'VIDEO' && !x.target.paused) x.target.pause(); }), { threshold: 0.2 });
  new MutationObserver(() => $$('video', root).forEach(v => { if (!v._seen) { v._seen = true; vio.observe(v); } })).observe(root, { childList: true, subtree: true });
}
