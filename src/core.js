'use strict';

/* ================= Windows app =================
   The same site also ships as a Windows program (desktop/, built on GitHub). Inside it, window.__TAURI__ exists;
   on the website it doesn't, so none of this runs there. In the app: outside links open in the normal browser,
   alerts go to Windows notifications, and a banner offers new versions from GitHub Releases. */
const IS_APP = !!window.__TAURI__;
// the app's mini scoreboard window loads the same page as mini.html: today's scores and tracked bets, compact
const IS_MINI = IS_APP && /\/mini\.html$/.test(location.pathname);
// where this build's files live: the Windows app may run the newest site straight from GitHub Pages (desktop/loader.html)
const ASSET_BASE = window.FC_BASE || document.baseURI;
if (IS_MINI && location.hash !== '#scores') history.replaceState(null, '', '#scores');
if (IS_APP) {
  const T = window.__TAURI__;
  document.documentElement.dataset.app = '1';
  if (IS_MINI) document.documentElement.dataset.mini = '1';
  const ext = u => { try { const x = new URL(u, location.href); return (/^https?:$/.test(x.protocol) && x.host !== location.host) || /^(mailto|tel|sms):$/.test(x.protocol); } catch (e) { return false; } };
  const openOut = u => { try { T.opener.openUrl(String(new URL(u, location.href))); } catch (e) {} };
  document.addEventListener('click', e => { const a = e.target.closest?.('a[href]'); if (a && ext(a.href)) { e.preventDefault(); openOut(a.href); } }, true);
  const wOpen = window.open.bind(window);
  window.open = (u, ...r) => (u && ext(String(u)) ? (openOut(u), null) : wOpen(u, ...r));
  class AppNote {
    static permission = 'granted';
    static requestPermission() { return Promise.resolve('granted'); }
    constructor(title, o = {}) { if (IS_MINI) return; try { T.notification.sendNotification({ title, body: o.body || '' }); } catch (e) {} } // the main window sends alerts; the mini one stays quiet
    close() {}
  }
  window.Notification = AppNote;
}

/* ================= config ================= */
/* League mode: NBA, WNBA, or college (women's / men's). The whole site runs in one league at a time.
   LGK is Fullcourt's short key; LG is ESPN's name for the league (used in every feed URL). */
// ?league=wnba (links from Mantel's scores widget) switches the site to that league and remembers it.
const LGK = (() => {
  const ok = ['nba', 'wnba', 'ncaaw', 'ncaam'];
  try {
    const q = new URLSearchParams(location.search).get('league');
    if (ok.includes(q)) { localStorage.setItem('fc-league', q); return q; }
  } catch (e) {}
  try { const v = localStorage.getItem('fc-league'); return ['wnba', 'ncaaw', 'ncaam'].includes(v) ? v : 'nba'; } catch (e) { return 'nba'; }
})();
const LG = { ncaaw: 'womens-college-basketball', ncaam: 'mens-college-basketball' }[LGK] || LGK;
const IS_W = LGK === 'wnba';               // the WNBA specifically
const IS_C = LGK === 'ncaaw' || LGK === 'ncaam'; // college
const IS_F = IS_W || LGK === 'ncaaw';      // women's game (pronouns, quarters)
const LGN = { nba: 'NBA', wnba: 'WNBA', ncaaw: "Women's college", ncaam: "Men's college" }[LGK];
const LGB = { nba: 'NBA', wnba: 'WNBA', ncaaw: 'NCAAW', ncaam: 'NCAAM' }[LGK]; // short badge
// game rules that change between leagues (quarter length, timeouts, team-foul limits)
const RULES = LGK === 'ncaam'
  ? { per: 1200, ot: 300, toReg: 4, toOT: 1, q4Max: 0, lateMax: 0, lateAt: 0, foulReg: 6, foulOT: 6, halves: true }
  : IS_F
  ? { per: 600, ot: 300, toReg: IS_C ? 4 : 6, toOT: IS_C ? 1 : 3, q4Max: 0, lateMax: 0, lateAt: 0, foulReg: 4, foulOT: 3 }
  : { per: 720, ot: 300, toReg: 7, toOT: 2, q4Max: 4, lateMax: 2, lateAt: 180, foulReg: 4, foulOT: 3 };
const REG_PERIODS = RULES.halves ? 2 : 4;
const SEASON_QS = IS_W || IS_C ? '&seasontype=2' : '';
const lsKey = k => LGK === 'nba' ? k : `${k}-${LGK}`;
const HIS = IS_F ? 'her' : 'his', HE = IS_F ? 'She' : 'He', HES = IS_F ? "she's" : "he's";
// college scoreboards only list featured games unless asked for all of Division I
const SB_QS = IS_C ? '&groups=50&limit=500' : '';
const API = `https://site.api.espn.com/apis/site/v2/sports/basketball/${LG}`;
const API2 = `https://site.api.espn.com/apis/v2/sports/basketball/${LG}`;
const WEB = `https://site.web.api.espn.com/apis/common/v3/sports/basketball/${LG}`;
const CDN = (path, w, h) => `https://a.espncdn.com/combiner/i?img=${path}&w=${w}&h=${h}&scale=crop&cquality=80`;

const TEAM_COLORS = { ATL:'c8102e', BOS:'008348', BKN:'1a1a1a', CHA:'008ca8', CHI:'ce1141', CLE:'860038', DAL:'0064b1', DEN:'0e2240', DET:'1d428a', GS:'1d428a', HOU:'ce1141', IND:'002d62', LAC:'c8102e', LAL:'552583', MEM:'5d76a9', MIA:'98002e', MIL:'00471b', MIN:'266092', NO:'0c2340', NY:'1d428a', OKC:'007ac1', ORL:'0077c0', PHI:'1d428a', PHX:'1d1160', POR:'e03a3e', SAC:'5a2d81', SA:'2a2a2a', TOR:'ce1141', UTAH:'4e2a84', WSH:'e31837' };

const LEADER_CATS = [
  { k: 'Points', u: 'PPG', cat: 'offensive', name: 'avgPoints' },
  ...(IS_C ? [] : [{ k: 'MVP race', award: 'mvp' }]),
  ...(IS_W || IS_C ? [] : [{ k: 'Rookie race', award: 'roy' }, { k: 'DPOY race', award: 'dpoy' }, { k: '6MOY race', award: 'smoy' }]),
  { k: 'Rebounds', u: 'RPG', cat: 'general', name: 'avgRebounds' },
  { k: 'Assists', u: 'APG', cat: 'offensive', name: 'avgAssists' },
  { k: 'Steals', u: 'SPG', cat: 'defensive', name: 'avgSteals' },
  { k: 'Blocks', u: 'BPG', cat: 'defensive', name: 'avgBlocks' },
  { k: '3-pointers', u: '3PM', cat: 'offensive', name: 'avgThreePointFieldGoalsMade' },
  { k: 'FG%', u: 'FG%', cat: 'offensive', name: 'fieldGoalPct', pct: true },
  { k: '3P%', u: '3P%', cat: 'offensive', name: 'threePointFieldGoalPct', pct: true },
  { k: 'FT%', u: 'FT%', cat: 'offensive', name: 'freeThrowPct', pct: true },
  { k: 'Minutes', u: 'MPG', cat: 'general', name: 'avgMinutes' },
  { k: 'Double-doubles', u: 'DD2', cat: 'general', name: 'doubleDouble', total: true },
];

/* ================= state ================= */
const S = {
  view: 'scores',
  today: null,          // YYYYMMDD (ESPN league day)
  date: null,           // selected YYYYMMDD
  games: [],
  prev: {},             // id -> "away-home"
  teams: {},            // id -> meta
  standings: null,
  miniConf: 0, stdConf: 0,
  leadKey: 0, leadCache: {},
  lastUpdate: 0, pollTimer: null, failures: 0,
  players: {},
};

/* ================= utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

async function getJSON(url, { timeout = 12000, retries = 1 } = {}) {
  for (let a = 0; a <= retries; a++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      // the page's first lines may already have started this download (today's scores, standings): use it once
      const early = a === 0 && window.__pf?.[url]; if (early) delete window.__pf[url];
      const r = (early && await early.then(x => x?.ok ? x : null)) || await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // the home-screen app's service worker hands back saved data when there's no signal
      if (r.headers.get('x-fc-cached') === '1') S.cachedUrl = url; else if (S.cachedUrl === url) S.cachedUrl = null;
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      if (a === retries) throw e;
      await sleep(600 * (a + 1));
    }
  }
}

const isDark = () => {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
};
// college logos are filed by team id, not abbreviation, so keep an abbreviation -> id map (saved, so a cold start has it)
const C_IDS = (() => { if (!IS_C) return {}; try { return JSON.parse(localStorage.getItem(lsKey('fc-cids')) || '{}'); } catch (e) { return {}; } })();
let cidsT = 0; const saveCids = () => { clearTimeout(cidsT); cidsT = setTimeout(() => { try { localStorage.setItem(lsKey('fc-cids'), JSON.stringify(C_IDS)); } catch (e) {} }, 1500); };
// logos are fetched at a few fixed sizes (not one per spot on the page), so the browser downloads each team's logo once and reuses it
const imgBucket = n => n <= 96 ? 96 : n <= 240 ? 240 : 500;
const logoSrc = (abbr, sizeIn = 80, dark = isDark()) => {
  const size = imgBucket(sizeIn);
  if (IS_C) { const id = /^\d+$/.test(abbr) ? abbr : C_IDS[abbr]; return id ? CDN(`/i/teamlogos/ncaa/${dark ? '500-dark' : '500'}/${id}.png`, size, size) : CDN('/i/teamlogos/default-team-logo-500.png', size, size); }
  return CDN(`/i/teamlogos/${LG}/${dark && !IS_W ? '500-dark/scoreboard' : '500'}/${String(abbr || '').toLowerCase()}.png`, size, size);
};
// schools without a logo on ESPN (small non-Division I opponents) get a plain team-colored badge with initials
const NOLOGO = "this.onerror=null;this.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 40 40&quot;><circle cx=&quot;20&quot; cy=&quot;20&quot; r=&quot;19&quot; fill=&quot;#888&quot; fill-opacity=&quot;.22&quot;/><text x=&quot;20&quot; y=&quot;25&quot; text-anchor=&quot;middle&quot; font-family=&quot;sans-serif&quot; font-weight=&quot;700&quot; font-size=&quot;13&quot; fill=&quot;#888&quot;>'+(this.dataset.ab||'').slice(0,4)+'</text></svg>')";
const logo = (abbr, size = 80, cls = 'lg') =>
  `<img class="${cls}" data-ab="${esc(abbr)}" data-s="${size}" src="${logoSrc(abbr, size)}" alt="" loading="lazy" draggable="false" onerror="${IS_C ? `this.onerror=function(){${NOLOGO}};this.src='${logoSrc(abbr, size, false)}'` : `this.onerror=null;this.src='${logoSrc(abbr, size, false)}'`}">`;
const headSrc = (id, wIn = 350) => { const w = wIn <= 200 ? 200 : wIn <= 400 ? 400 : 700; return CDN(`/i/headshots/${LG}/players/full/${id}.png`, w, Math.round(w * 254 / 350)); };
const initials = n => String(n || '').split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
const face = (id, name, cls = 'face', w = 160) => id
  ? `<img class="${cls}" src="${headSrc(id, w)}" alt="${esc(name)}" loading="lazy" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls} avatar',textContent:'${esc(initials(name))}'}))">`
  : `<div class="${cls} avatar">${esc(initials(name))}</div>`;

const teamColor = (idOrAbbr) => {
  const t = S.teams[idOrAbbr] || Object.values(S.teams).find(x => x.abbr === idOrAbbr);
  const hex = t?.color || TEAM_COLORS[t?.abbr || idOrAbbr] || '444444';
  return '#' + hex;
};
function regTeam(t, extra = {}) {
  if (!t?.id) return;
  if (IS_C && t.abbreviation && C_IDS[t.abbreviation] !== String(t.id)) { C_IDS[t.abbreviation] = String(t.id); saveCids(); }
  const cur = S.teams[t.id] || {};
  S.teams[t.id] = {
    ...cur,
    id: t.id,
    abbr: t.abbreviation || cur.abbr,
    name: t.displayName || cur.name,
    short: t.shortDisplayName || t.name || cur.short,
    loc: t.location || cur.loc,
    color: t.color || cur.color || TEAM_COLORS[t.abbreviation],
    ...extra,
  };
}

const ymd = d => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const fromYmd = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), 12));
const addDays = (s, n) => { const d = fromYmd(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
const fmtDay = (s, opts) => fromYmd(s).toLocaleDateString('en-US', { timeZone: 'UTC', ...opts }); // s is already an ET calendar date
/* Everything runs on New York time: the NBA's own calendar, and Anthony's (New Jersey). */
const TZ = 'America/New_York';
const ROLLOVER_HOUR = 4; // before 4 AM ET, "today" is still last night's slate so late West Coast games stay put
// game times show in the viewer's own time zone (the device's setting, which follows where they are);
// which day a game belongs to stays on ET, the way the NBA schedules it
const UTZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || TZ; } catch (e) { return TZ; } })();
const TZ_AB = (() => {
  try {
    const n = new Date().toLocaleTimeString('en-US', { timeZone: UTZ, timeZoneName: 'short' }).split(' ').pop();
    return { EST: 'ET', EDT: 'ET', CST: 'CT', CDT: 'CT', MST: 'MT', MDT: 'MT', PST: 'PT', PDT: 'PT', AKST: 'AKT', AKDT: 'AKT', HST: 'HT', HDT: 'HT' }[n] || n;
  } catch (e) { return 'ET'; }
})();
// for viewers far from ET (Europe, Asia...), a night game can land on the next calendar day where they are,
// so add their local date when it differs from the ET date. Anyone whose date matches ET sees no change.
const ymdIn = (d, tz) => d.toLocaleDateString('en-CA', { timeZone: tz });
// DSHIFT: how many calendar days a typical 7 PM ET tip moves for this viewer. 0 for the Americas;
// 1 for Europe/Asia/Australia, where night games land on the next day. The date strip and day titles
// are shown on that local date, so the games sit on the day they actually happen for this viewer.
const DSHIFT = (() => { try { const d = new Date(Date.UTC(2026, 0, 15, 0, 0)); /* 7 PM EST */ return Math.round((Date.parse(ymdIn(d, UTZ)) - Date.parse(ymdIn(d, TZ))) / 864e5); } catch (e) { return 0; } })();
const localToday = () => ymdIn(new Date(), UTZ).replace(/-/g, '');
const fmtTime = (iso, bare) => {
  const d = new Date(iso);
  let s = d.toLocaleTimeString('en-US', { timeZone: UTZ, hour: 'numeric', minute: '2-digit' }) + (bare ? '' : ' ' + TZ_AB);
  const gDay = ymdIn(d, TZ).replace(/-/g, '');
  if (UTZ !== TZ && Math.abs(d - Date.now()) > 90000 && ymdIn(d, UTZ).replace(/-/g, '') !== addDays(gDay, DSHIFT))
    s += bare ? ' ' + d.toLocaleDateString('en-US', { timeZone: UTZ, month: 'numeric', day: 'numeric' }) : ' · ' + d.toLocaleDateString('en-US', { timeZone: UTZ, weekday: 'short', month: 'numeric', day: 'numeric' }).replace(',', '');
  return s;
};
const fmtLocal = (iso, opts) => new Date(iso).toLocaleString('en-US', { timeZone: UTZ, ...opts });
const fmtShortDate = iso => new Date(iso).toLocaleDateString('en-US', { timeZone: UTZ, month: 'short', day: 'numeric' });
const fmtET = (iso, opts) => new Date(iso).toLocaleString('en-US', { timeZone: TZ, ...opts });
function etNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { ymd: `${p.year}${p.month}${p.day}`, hour: +p.hour };
}
// "Today" is the calendar date in ET. The only exception: right after midnight, while last night's games are
// still being played, stay on last night's slate until they finish (lateLive is set by loadScores)
let lateLive = false;
const etToday = () => { const n = etNow(); return n.hour < ROLLOVER_HOUR && lateLive ? addDays(n.ymd, -1) : n.ymd; };

/* Scores page layout: the order of its sections (set in Settings), applied by moving them into place */
const HOME_MAIN = ['bets', 'watch', 'games', 'perf'], HOME_SIDE = ['race', 'picks', 'out'];
const HOME_EL = { bets: '#betBlock', watch: '#watchBlock', games: '#games', perf: '#perfBlock', race: '#racePanel', picks: '#pickPanel', out: '#outPanel' };
function homeOrder() {
  let o = null; try { o = JSON.parse(localStorage.getItem('fc-home') || 'null'); } catch (e) {}
  const fix = (list, def) => { const l = (Array.isArray(list) ? list : []).filter(k => def.includes(k)); return [...new Set([...l, ...def])]; };
  return { main: fix(o?.main, HOME_MAIN), side: fix(o?.side, HOME_SIDE) };
}
function applyHome() {
  const o = homeOrder();
  for (const list of [o.main, o.side]) { const els = list.map(k => $(HOME_EL[k])).filter(Boolean); els.forEach(el => el.parentElement.append(el)); }
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ================= drag-to-scroll with momentum ================= */
function dragScroll(el) {
  if (el._drag) return; el._drag = true;
  let down = false, sx = 0, sl = 0, moved = false, lastX = 0, lastT = 0, v = 0, raf = 0;
  const wrap = el.closest('.hs-wrap');
  // only touch the edge fades when they actually flip; writing them on every scroll event restyles the page
  let fl = -1, fr = -1, max = 0;
  const fades = sized => {
    if (!wrap) return;
    if (sized !== false) max = el.scrollWidth - el.clientWidth;
    const l = el.scrollLeft > 4 ? 1 : 0, r = el.scrollLeft < max - 4 ? 1 : 0;
    if (l !== fl) wrap.style.setProperty('--fl', fl = l);
    if (r !== fr) wrap.style.setProperty('--fr', fr = r);
  };
  el.addEventListener('scroll', () => fades(false), { passive: true });
  el.addEventListener('click', ev => { if (Date.now() - (el._sup || 0) < 250) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  new ResizeObserver(() => fades()).observe(el);
  el._fades = fades;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    cancelAnimationFrame(raf);
    down = true; moved = false; sx = lastX = e.clientX; sl = el.scrollLeft; lastT = performance.now(); v = 0;
  });
  window.addEventListener('pointermove', e => {
    if (!down) return;
    const dx = e.clientX - sx;
    if (!moved && Math.abs(dx) > 5) { moved = true; el.classList.add('dragging'); document.documentElement.classList.add('no-sel'); getSelection()?.removeAllRanges(); }
    if (moved) e.preventDefault();
    if (moved) {
      el.scrollLeft = sl - dx;
      const now = performance.now(), dt = now - lastT;
      if (dt > 0) v = (e.clientX - lastX) / dt;
      lastX = e.clientX; lastT = now;
    }
  });
  document.addEventListener('selectstart', e => { if (down && moved) e.preventDefault(); });
  window.addEventListener('pointerup', () => {
    if (!down) return; down = false;
    if (!moved) return;
    el.classList.remove('dragging'); document.documentElement.classList.remove('no-sel'); getSelection()?.removeAllRanges();
    el._sup = Date.now();
    if (reduced) return;
    let vel = v * 16;
    const step = () => {
      el.scrollLeft -= vel; vel *= 0.92;
      if (Math.abs(vel) > 0.4) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
  el.addEventListener('wheel', e => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && el.scrollWidth > el.clientWidth && el.classList.contains('hs')) {
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1 && e.deltaY > 0;
      if (!atStart && !atEnd && e.shiftKey) { el.scrollLeft += e.deltaY; e.preventDefault(); }
    }
  }, { passive: false });
  requestAnimationFrame(fades);
}
const wireDrag = (root = document) => $$('[data-drag]', root).forEach(dragScroll);

/* ================= theme ================= */
// themes: each is a light or dark base (so everything keyed to dark mode keeps working) plus an optional palette ("skin")
const THEMES = [
  ['system', 'Match device', null, null, ['#E8DFCF', '#0C0E11']],
  ['dark', 'Dark', 'dark', null, ['#0C0E11', '#232831']],
  ['midnight', 'Midnight', 'dark', 'midnight', ['#0A0F1E', '#1E2A4D']],
  ['oled', 'Pure black', 'dark', 'oled', ['#000000', '#1A1A1D']],
  ['hardwood', 'Hardwood', 'dark', 'hardwood', ['#17120D', '#33281D']],
  ['forest', 'Forest', 'dark', 'forest', ['#0B1410', '#1E3127']],
  ['light', 'Paper', 'light', null, ['#E8DFCF', '#F4EDE0']],
  ['clean', 'Clean white', 'light', 'clean', ['#F4F5F7', '#FFFFFF']],
  ['ice', 'Ice', 'light', 'ice', ['#E6EDF5', '#F7FAFD']],
];
const themeId = () => { const r = document.documentElement; return r.dataset.skin || r.dataset.theme || 'system'; };
function applyTheme(id, origin) {
  const t = THEMES.find(x => x[0] === id) || THEMES[0];
  const root = document.documentElement;
  const go = () => {
    if (t[2]) root.dataset.theme = t[2]; else delete root.dataset.theme;
    if (t[3]) root.dataset.skin = t[3]; else delete root.dataset.skin;
    lsSet('fc-theme', t[2]); lsSet('fc-skin', t[3]);
    $$('img.lg').forEach(i => { i.onerror = null; i.src = logoSrc(i.dataset.ab, +i.dataset.s); i.onerror = () => { i.onerror = null; i.src = logoSrc(i.dataset.ab, +i.dataset.s, false); }; });
    const m = $('meta[name="theme-color"]'); if (m) m.content = getComputedStyle(root).getPropertyValue('--bg').trim() || (isDark() ? '#0C0E11' : '#E8DFCF');
  };
  if (!origin || !document.startViewTransition || reduced) return go();
  const r = origin.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const rad = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  document.startViewTransition(go).ready.then(() => document.documentElement.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${rad}px at ${x}px ${y}px)`] }, { duration: 550, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
}
// a small menu under the theme button
function openThemeMenu(btn) {
  const old = $('.theme-menu'); if (old) { old.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
  const cur = themeId();
  const menu = document.createElement('div');
  menu.className = 'theme-menu'; menu.setAttribute('role', 'menu');
  menu.innerHTML = `<div class="tm-h">Theme</div>${THEMES.map(([id, name, mode, , sw]) => `<button role="menuitemradio" aria-checked="${id === cur}" data-themeid="${id}"><i class="tm-sw" style="--a:${sw[0]};--b:${sw[1]}"></i><span>${esc(name)}</span><small>${mode ? (mode === 'dark' ? 'Dark' : 'Light') : 'Auto'}</small><svg class="tm-ck" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>`).join('')}`;
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  menu.style.top = Math.round(r.bottom + 8) + 'px';
  menu.style.right = Math.max(8, Math.round(innerWidth - r.right)) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => menu.classList.add('on'));
  const close = () => { menu.classList.remove('on'); btn.setAttribute('aria-expanded', 'false'); setTimeout(() => menu.remove(), 160); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc_); removeEventListener('resize', close); };
  const outside = e => { if (!menu.contains(e.target) && !btn.contains(e.target)) close(); };
  const esc_ = e => { if (e.key === 'Escape') { close(); btn.focus(); } };
  document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', esc_); addEventListener('resize', close);
  menu.addEventListener('click', e => { const b = e.target.closest('[data-themeid]'); if (!b) return; applyTheme(b.dataset.themeid, btn); $$('[data-themeid]', menu).forEach(x => x.setAttribute('aria-checked', x === b)); setTimeout(close, 180); });
  $('[aria-checked="true"]', menu)?.focus({ preventScroll: true });
}
$('#themeBtn').addEventListener('click', e => openThemeMenu(e.currentTarget));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) $$('img.lg').forEach(i => i.src = logoSrc(i.dataset.ab, +i.dataset.s));
});

/* ================= segmented control knob ================= */
function placeKnob(seg) {
  const k = $('.knob', seg), b = $('[aria-pressed="true"]', seg);
  if (!k || !b) return;
  k.style.width = b.offsetWidth + 'px';
  k.style.transform = `translateX(${b.offsetLeft - 3}px)`;
  k.style.left = '3px';
}

/* ================= routing ================= */
const VIEWS = ['scores', 'standings', 'teams', 'leaders', 'compare', 'bets', 'replay', 'cap', 'history', 'draft'];
// each section keeps its place: coming back to it returns to where you were; tapping the section you're on goes to the top
const viewY = {};
function go(view, push = true) {
  if (!VIEWS.includes(view)) view = 'scores';
  const from = S.view, again = from === view;
  if (from && !again) viewY[from] = window.scrollY;
  S.view = view;
  closeDrawer();
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  $$('#nav [data-view], #navMenu [data-view], #tabbar [data-view], #drawer [data-view]').forEach(b => b.dataset.view === view ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  movePill();
  if (push && location.hash !== '#' + view) { if (S.skipPop) S.pendingHash = view; else history.replaceState(null, '', '#' + view); }
  if (view === 'standings') renderStandings();
  if (view === 'teams') renderTeams();
  if (view === 'leaders') loadLeaders();
  if (view === 'compare') renderCompare();
  if (view === 'bets') renderBetDesk();
  if (view === 'replay') lazy('replay').then(m => m.renderReplay()).catch(() => { $('#rpBody').innerHTML = `<div class="empty"><b>Replay didn't load</b><button class="btn" data-retry="replay">Try again</button></div>`; });
  if (view === 'cap') lazy('cap').then(m => m.renderCap()).catch(() => { $('#capBody').innerHTML = `<div class="empty"><b>Capsheet didn't load</b><button class="btn" data-retry="cap">Try again</button></div>`; });
  if (view === 'draft') lazy('draft').then(m => m.renderDraft()).catch(() => { $('#draftBody').innerHTML = `<div class="empty"><b>The mock draft didn't load</b><button class="btn" data-retry="draft">Try again</button></div>`; });
  if (view === 'history') lazy('history').then(m => m.renderHistory()).catch(() => { $('#histBody').innerHTML = `<div class="empty"><b>History didn't load</b><button class="btn" data-retry="history">Try again</button></div>`; });
  navMenu(false);
  $('#nav [data-navmore]')?.toggleAttribute('aria-current', !navTab(view) && !!$(`#navMenu [data-view="${view}"]`));
  const y = again ? 0 : viewY[view] || 0;
  window.scrollTo({ top: y, behavior: again && window.scrollY > 0 ? 'smooth' : 'instant' });
  // sections that draw a moment later (data or code still loading): try again once they've had time to grow
  let moved = false; const mark = () => { moved = true; };
  if (y > 0) { addEventListener('touchstart', mark, { once: true, passive: true }); addEventListener('wheel', mark, { once: true, passive: true }); addEventListener('keydown', mark, { once: true }); }
  if (y > 0) for (const ms of [120, 450, 1100]) setTimeout(() => { if (!moved && S.view === view && Math.abs(window.scrollY - y) > 40 && document.documentElement.scrollHeight >= y + innerHeight) window.scrollTo({ top: y, behavior: 'instant' }); }, ms);
}
/* ---- phone menu drawer ---- */
const drawerEl = $('#drawer'), drawerScrim = $('#drawerScrim'), menuBtn = $('#menuBtn');
function openDrawer() {
  drawerEl.inert = false;
  drawerEl.style.transform = '';
  drawerEl.classList.add('open'); drawerScrim.classList.add('on');
  menuBtn.setAttribute('aria-expanded', 'true');
  document.documentElement.classList.add('locked');
  setTimeout(() => ($('[aria-current="page"]', drawerEl) || $('[data-view]', drawerEl))?.focus({ preventScroll: true }), 120);
}
function closeDrawer() {
  if (!drawerEl.classList.contains('open')) return;
  drawerEl.classList.remove('open'); drawerScrim.classList.remove('on');
  drawerEl.style.transform = '';
  drawerEl.inert = true;
  menuBtn.setAttribute('aria-expanded', 'false');
  if (!document.querySelector('.sheet.open')) document.documentElement.classList.remove('locked');
}
menuBtn.addEventListener('click', openDrawer);
$('#drawerClose').addEventListener('click', closeDrawer);
drawerScrim.addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
matchMedia('(min-width: 761px)').addEventListener('change', e => { if (e.matches) closeDrawer(); });
document.addEventListener('change', e => { if (e.target.matches?.('[data-cscope]')) { cScope = e.target.value; gamesFilter = 'all'; renderGames(true); } });
// swipe the drawer left to close it
(() => {
  let x0 = null, dx = 0, t0 = 0;
  drawerEl.addEventListener('pointerdown', e => { x0 = e.clientX; dx = 0; t0 = performance.now(); });
  drawerEl.addEventListener('pointermove', e => {
    if (x0 == null) return;
    dx = Math.min(0, e.clientX - x0);
    if (dx < -6) { drawerEl.style.transition = 'none'; drawerEl.style.transform = `translateX(${dx}px)`; }
  });
  const end = () => {
    if (x0 == null) return;
    const v = -dx / Math.max(1, performance.now() - t0);
    x0 = null; drawerEl.style.transition = '';
    if (dx < -80 || v > 0.5) closeDrawer(); else drawerEl.style.transform = '';
  };
  drawerEl.addEventListener('pointerup', end);
  drawerEl.addEventListener('pointercancel', end);
})();

/* More menu in the header (Compare lives there) */
function navMenu(open) {
  const m = $('#navMenu'), b = $('#nav [data-navmore]'); if (!m || !b) return;
  if (open == null) open = m.hidden;
  if (open) { const r = b.getBoundingClientRect(); m.style.left = `${Math.round(Math.min(r.left, innerWidth - 250))}px`; m.style.top = `${Math.round(r.bottom + 8)}px`; }
  m.hidden = !open; b.setAttribute('aria-expanded', open);
  if (open) setTimeout(() => $('button', m)?.focus({ preventScroll: true }), 30);
}
document.addEventListener('click', e => { if (!e.target.closest?.('#navMenu, [data-navmore]')) navMenu(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') navMenu(false); });
addEventListener('resize', () => navMenu(false));
// the header tab for a view, if it's showing at this width (Compare is a tab only on wide screens)
const navTab = view => $$(`#nav > [data-view="${view}"]`).find(b => b.offsetWidth);
addEventListener('resize', () => { movePill(); $('#nav [data-navmore]')?.toggleAttribute('aria-current', !navTab(S.view) && !!$(`#navMenu [data-view="${S.view}"]`)); });
function movePill() {
  const b = navTab(S.view) || ($(`#navMenu [data-view="${S.view}"]`) && $('#nav [data-navmore]')), p = $('#navPill');
  if (!b || !p) return;
  p.style.width = b.offsetWidth + 'px';
  p.style.transform = `translateX(${b.offsetLeft}px)`;
}
window.addEventListener('hashchange', () => go(location.hash.slice(1), false));
window.addEventListener('resize', () => { movePill(); $$('.seg').forEach(placeKnob); });
document.fonts?.ready.then(() => { movePill(); $$('.seg').forEach(placeKnob); });

/* ================= scoreboard ================= */
function parseGame(e) {
  const c = e.competitions[0];
  const st = c.status || e.status;
  const t = st.type;
  const side = x => {
    regTeam(x.team);
    return {
      id: x.team.id, abbr: x.team.abbreviation, name: x.team.shortDisplayName || x.team.name, full: x.team.displayName,
      score: x.score, winner: x.winner,
      rec: (x.records || []).find(r => r.type === 'total' || r.name === 'overall')?.summary || '',
      leaders: x.leaders || [],
      lines: (x.linescores || []).map(l => +(l.value ?? l.displayValue) || 0),
      rank: x.curatedRank?.current <= 25 ? x.curatedRank.current : null, // AP poll (college)
      conf: x.team.conferenceId ? String(x.team.conferenceId) : '',
    };
  };
  const home = side(c.competitors.find(x => x.homeAway === 'home'));
  const away = side(c.competitors.find(x => x.homeAway === 'away'));
  return {
    id: e.id, date: e.date, state: t.state, detail: t.shortDetail, desc: t.description, name: t.name,
    period: st.period, clock: st.displayClock, completed: t.completed, home, away,
    venue: c.venue?.fullName, city: [c.venue?.address?.city, c.venue?.address?.state].filter(Boolean).join(', '),
    tv: [...new Set((c.broadcasts || []).flatMap(b => b.names || []))].join(' · '),
    note: c.notes?.[0]?.headline || '',
    headline: c.headlines?.[0]?.shortLinkText || '',
    odds: parseOdds(c.odds?.[0]),
    hasHl: !!c.highlights?.length,
  };
}

// college: a ranked team losing to an unranked one (or to a team 8+ spots lower). In the NCAA Tournament the ranks are
// seeds, so it's a win by a seed 5+ lines lower (a 12 over a 5).
const isTourney = g => /NCAA (Men's|Women's) Basketball Championship/i.test(g.note || '');
function upsetOf(g) {
  if (!IS_C || g.state !== 'post' || g.home.score == null) return false;
  const hw = +g.home.score > +g.away.score, w = hw ? g.home : g.away, l = hw ? g.away : g.home;
  if (!l.rank) return false;
  if (isTourney(g)) return !!w.rank && w.rank - l.rank >= 5;
  return !w.rank || w.rank - l.rank >= 8;
}
// NBA Cup (2026): groups, so game cards can say which group a Cup game belongs to
const CUP_GROUPS = { 'East A': ['DET', 'TOR', 'ORL', 'MIL', 'BKN'], 'East B': ['NY', 'CLE', 'PHI', 'MIA', 'IND'], 'East C': ['BOS', 'ATL', 'CHA', 'CHI', 'WSH'],
  'West A': ['DEN', 'HOU', 'PHX', 'DAL', 'UTAH'], 'West B': ['OKC', 'MIN', 'LAC', 'NO', 'MEM'], 'West C': ['SA', 'LAL', 'POR', 'GS', 'SAC'] };
const cupGroupOf = abbr => Object.keys(CUP_GROUPS).find(k => CUP_GROUPS[k].includes(abbr)) || '';
const cupTag = g => { if (LGK !== 'nba' || !/NBA Cup/i.test(g.note || '')) return ''; const r = /Quarter/i.test(g.note) ? 'Quarterfinal' : /Semi/i.test(g.note) ? 'Semifinal' : /Championship|Final/i.test(g.note) ? 'Final' : cupGroupOf(g.home.abbr); return `NBA Cup${r ? ' · ' + r : ''}`; };
const isClash = g => !!(g.home.rank && g.away.rank) && !isTourney(g);
function statusText(g) {
  if (g.state === 'pre') {
    if (/postponed|canceled|delayed/i.test(g.desc)) return g.desc;
    return fmtTime(g.date);
  }
  if (g.state === 'post') return g.period > REG_PERIODS ? (g.period === REG_PERIODS + 1 ? 'Final/OT' : `Final/${g.period - REG_PERIODS}OT`) : 'Final';
  if (/halftime/i.test(g.desc)) return 'Halftime';
  const per = perLabel(g.period);
  if (/end of/i.test(g.desc) || g.clock === '0.0') return `End ${per}`;
  return `${per} · ${g.clock}`;
}
function progress(g) {
  if (g.state !== 'in') return 0;
  const [m, s] = String(g.clock || '0:0').split(':').map(Number);
  const rem = (isNaN(s) ? (m || 0) / 60 : m + s / 60);
  const reg = Math.min(g.period, REG_PERIODS), qm = RULES.per / 60;
  const elapsed = (reg - 1) * qm + (g.period <= REG_PERIODS ? qm - rem : qm);
  return Math.max(0, Math.min(1, elapsed / (qm * REG_PERIODS)));
}
function untilText(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return 'Tip-off soon';
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  if (h >= 24) return '';
  return h ? `Tips in ${h}h ${m}m` : `Tips in ${m}m`;
}

/* ---- betting odds (ESPN carries DraftKings lines for upcoming games) ---- */
const fmtOdds = v => {
  if (v == null || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n > 0 ? `+${n}` : String(n);
};
const oddsNum = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function parseOdds(o) {
  if (!o) return null;
  const ml = o.moneyline || {}, ps = o.pointSpread || {}, tot = o.total || {};
  const H = o.homeTeamOdds || {}, A = o.awayTeamOdds || {};
  const spreadNum = oddsNum(o.spread);
  const out = {
    provider: o.provider?.displayName || o.provider?.name || '',
    details: o.details || '',
    ou: o.overUnder ?? null,
    fav: H.favorite ? 'home' : A.favorite ? 'away' : null,
    home: {
      ml: fmtOdds(ml.home?.close?.odds ?? H.moneyLine), mlOpen: fmtOdds(ml.home?.open?.odds),
      spread: ps.home?.close?.line ?? (spreadNum != null ? fmtOdds(spreadNum) : ''), spreadOdds: fmtOdds(ps.home?.close?.odds ?? H.spreadOdds),
      spreadOpen: ps.home?.open?.line || '',
    },
    away: {
      ml: fmtOdds(ml.away?.close?.odds ?? A.moneyLine), mlOpen: fmtOdds(ml.away?.open?.odds),
      spread: ps.away?.close?.line ?? (spreadNum != null ? fmtOdds(-spreadNum) : ''), spreadOdds: fmtOdds(ps.away?.close?.odds ?? A.spreadOdds),
      spreadOpen: ps.away?.open?.line || '',
    },
    over: { line: tot.over?.close?.line || (o.overUnder != null ? `o${o.overUnder}` : ''), odds: fmtOdds(tot.over?.close?.odds ?? o.overOdds), open: tot.over?.open?.line || '' },
    under: { line: tot.under?.close?.line || (o.overUnder != null ? `u${o.overUnder}` : ''), odds: fmtOdds(tot.under?.close?.odds ?? o.underOdds), open: tot.under?.open?.line || '' },
  };
  if (!out.home.ml && !out.away.ml && !out.details && out.ou == null) return null;
  return out;
}
// Arrow shows which way the moneyline moved since open: ▲ = price got longer (less favored), ▼ = shorter (more favored)
function mlMove(cur, open) {
  const c = oddsNum(cur), o = oddsNum(open);
  if (c == null || o == null || c === o) return '';
  const prob = x => x < 0 ? -x / (-x + 100) : 100 / (x + 100);
  return prob(c) > prob(o) ? '<span class="mv dn" aria-label="shortened since open">▼</span>' : '<span class="mv up" aria-label="lengthened since open">▲</span>';
}
function mlChip(odds, side) {
  const x = odds?.[side];
  if (!x?.ml) return '';
  return `<span class="ml${odds.fav === side ? ' fav' : ''}" title="Moneyline${x.mlOpen ? ` · opened ${esc(x.mlOpen)}` : ''}">${esc(x.ml)}${mlMove(x.ml, x.mlOpen)}</span>`;
}
function oddsLine(odds) {
  if (!odds) return '';
  const bits = [];
  const mv = lineMoves(odds);
  if (odds.details) bits.push(`<span>Spread <b>${esc(odds.details)}</b>${mv?.spread?.d ? moveTag(mv.spread.d, `Opened ${mv.spread.open > 0 ? '+' : ''}${mv.spread.open}`) : ''}</span>`);
  if (odds.ou != null) bits.push(`<span>O/U <b>${esc(odds.ou)}</b>${mv?.total?.d ? moveTag(mv.total.d, `Opened ${mv.total.open}`) : ''}</span>`);
  if (odds.provider && !mv?.spread?.d && !mv?.total?.d) bits.push(`<span>${esc(odds.provider)}</span>`);
  return bits.length ? `<div class="odds-line">${bits.join('')}</div>` : '';
}
function liveLine(g) {
  const o = g.odds;
  if (!o || (!o.home.ml && !o.away.ml)) return '';
  return `<div class="odds-line">${g.oddsMoving ? '<span class="ll"><i class="dot on"></i>Live line</span>' : '<span>Line</span>'}<span>${esc(g.away.abbr)} <b>${esc(o.away.ml || '–')}</b></span><span>${esc(g.home.abbr)} <b>${esc(o.home.ml || '–')}</b></span>${o.ou != null ? `<span>O/U <b>${esc(o.ou)}</b></span>` : ''}</div>`;
}
function oddsCard(odds, sides, label = 'Odds', note) {
  if (!odds) return '';
  const cell = (main, sub, open) => main ? `<div class="cell"><b>${esc(main)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}${open && open !== main ? `<small>open ${esc(open)}</small>` : ''}</div>` : '<span style="color:var(--muted)">–</span>';
  const keys = ['away', 'home'];
  return `<div class="card odds-card"><div class="card-h"><h4>${esc(label)}</h4><span class="eyebrow">${esc(odds.provider || '')}</span></div>
    <div class="ls-wrap"><table class="odds-t"><colgroup><col class="c-team"><col><col><col></colgroup><thead><tr><th>Team</th><th>ML</th><th>Spread</th><th>Total</th></tr></thead><tbody>
    ${keys.map((k, i) => {
      const x = odds[k], t = i ? odds.under : odds.over, sd = sides[i];
      return `<tr><td><span class="tcell">${logo(sd.abbr, 44)}${esc(sd.abbr)}${odds.fav === k ? ' <span class="eyebrow">Fav</span>' : ''}</span></td>
        <td>${cell(x.ml, '', x.mlOpen)}</td>
        <td>${cell(x.spread, x.spreadOdds, x.spreadOpen)}</td>
        <td>${cell(t.line, t.odds, t.open)}</td></tr>`;
    }).join('')}
    </tbody></table></div>
    <div class="odds-note">${note || 'Lines can move up to tip-off. Shown for reference only.'}</div></div>`;
}

/* live refreshes swap a lot of markup at once; hold the page's height and scroll spot so nothing jumps */
let holdT = 0;
function holdScroll(el = $('#v-scores')) {
  if (!el) return () => {};
  const y = window.scrollY;
  el.style.minHeight = el.offsetHeight + 'px';
  clearTimeout(holdT); holdT = setTimeout(() => { el.style.minHeight = ''; }, 3000);
  return () => { if (Math.abs(window.scrollY - y) > 1) window.scrollTo({ top: y, behavior: 'instant' }); };
}
let gamesFilter = 'all';
let cScope = null; // college: 'top' | 'all' | a conference id (null = pick automatically)
async function loadScores({ silent = false } = {}) {
  checkRollover();
  const url = `${API}/scoreboard?dates=${S.date}${SB_QS}`;
  if (!silent) renderGamesSkeleton();
  try {
    const d = await getJSON(url);
    S.offline = S.cachedUrl === url;
    const wasIn = new Set((S.games || []).filter(g => g.state === 'in').map(g => g.id));
    S.games = (d.events || []).map(parseGame);
    if (S.games.some(g => g.state === 'post' && wasIn.has(g.id))) S.leadFinalAt = Date.now(); // a game just ended: leaders' season stats move
    if (S.date === S.today) S.liveNow = S.games.some(g => g.state === 'in');
    const cal = d.leagues?.[0]?.calendar;
    if (Array.isArray(cal) && cal.length && typeof cal[0] === 'string') S.calendar = cal.map(x => x.slice(0, 10).replace(/-/g, ''));
    // remember each live game's line the first time we see it, so we can tell if the book is moving it in-game
    S.tipOdds = S.tipOdds || {};
    for (const g of S.games) {
      if (g.state !== 'in' || !g.odds) continue;
      const sig = [g.odds.home.ml, g.odds.away.ml, g.odds.details, g.odds.ou].join('|');
      if (!(g.id in S.tipOdds)) S.tipOdds[g.id] = sig;
      g.oddsMoving = S.tipOdds[g.id] !== sig;
    }
    S.lastUpdate = Date.now(); S.failures = 0;
    const back = silent ? holdScroll() : () => {};
    renderGames(!silent);
    updatePulse();
    refreshTicker();
    refreshSit();
    if (S.games.some(g => g.state === 'pre')) loadPreWP();
    if (S.date === S.today) alertCheck(S.games);
    if (S.date === addDays(etNow().ymd, -1)) { lateLive = S.games.some(g => g.state === 'in'); if (!lateLive && S.date === S.today && checkRollover()) loadScores({ silent: true }); }
    renderWatch(); renderPicks(); renderOut();
    if (lsGet(lsKey('fc-bets'))) renderBets(); else { const bb = $('#betBlock'); if (bb) bb.hidden = true; }
    back(); if (silent) Promise.allSettled([document.fonts?.ready]).then(() => requestAnimationFrame(back));
  } catch (e) {
    S.failures++;
    if (!silent || !S.games.length) renderGamesError();
    updatePulse(true);
  }
  schedulePoll();
}
function schedulePoll() {
  clearTimeout(S.pollTimer);
  const live = S.games.some(g => g.state === 'in');
  const soon = S.games.some(g => g.state === 'pre' && new Date(g.date) - Date.now() < 30 * 60e3);
  const base = live ? 15000 : soon ? 30000 : 90000;
  const ms = Math.min(base * Math.pow(1.6, S.failures), 180000);
  S.pollTimer = setTimeout(() => {
    if (document.hidden) { schedulePoll(); return; }
    loadScores({ silent: true });
  }, ms);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (checkRollover() || Date.now() - S.lastUpdate > 15000) loadScores({ silent: true });
});
// When the day turns over (midnight ET, or once last night's late games end), move "Today" forward. If you were looking at today, follow it.
function checkRollover() {
  const t = etToday();
  if (t === S.today) return false;
  const wasOnToday = !S.date || S.date === S.today;
  S.today = t;
  if (wasOnToday) { S.date = t; S.prev = {}; gamesFilter = 'all'; }
  buildRail();
  return true;
}
let lastLocal = localToday();
setInterval(() => {
  if (document.hidden) return;
  if (checkRollover()) { lastLocal = localToday(); loadScores({ silent: true }); return; }
  if (DSHIFT && localToday() !== lastLocal) { lastLocal = localToday(); buildRail(); renderGames(false); } // viewer's own midnight: move the Today label
}, 60000);

function updatePulse(err) {
  const live = S.games.filter(g => g.state === 'in').length;
  $('#pulseDot').classList.toggle('on', live > 0 && !err);
  $('#liveCount').textContent = err ? 'Offline' : S.offline ? 'Saved' : live ? `${live} live` : 'Live';
  const dl = $('#drawerLive');
  if (dl) { dl.hidden = !live || !!err; dl.textContent = `${live} live`; }
  $('#drawerDot')?.classList.toggle('on', live > 0 && !err);
  const ds = $('#drawerStatus');
  if (ds) ds.textContent = err ? "Can't reach live data right now" : S.offline ? 'No signal: showing your last saved scores' : live ? `${live} game${live > 1 ? 's' : ''} in progress` : 'Live data connected';
  tickPulse();
}
function tickPulse() {
  if (!S.lastUpdate) return;
  const s = Math.round((Date.now() - S.lastUpdate) / 1000);
  const pt = $('#pulseTxt'); pt.textContent = S.offline ? '· no signal, saved scores' : s < 5 ? '· updated just now' : s < 60 ? `· updated ${s}s ago` : `· updated ${Math.floor(s / 60)}m ago`;
  $('#pulse').title = ($('#liveCount').textContent + ' ' + pt.textContent).replace('·', '').replace(/\s+/g, ' ').trim();
}
setInterval(tickPulse, 1000);

function buildRail() {
  const rail = $('#rail');
  const out = [];
  for (let i = -21; i <= 21; i++) {
    const d = addDays(S.today, i), v = addDays(d, DSHIFT), isT = DSHIFT ? v === localToday() : d === S.today; // v: the date shown to this viewer
    out.push(`<button class="day${isT ? ' today' : ''}" data-date="${d}" aria-pressed="${d === S.date}">
      <span class="dw">${isT ? 'Today' : esc(fmtDay(v, { weekday: 'short' }))}</span>
      <span class="dn">${fromYmd(v).getUTCDate()}</span>
      <span class="dm">${esc(fmtDay(v, { month: 'short' }))}</span></button>`);
  }
  rail.innerHTML = out.join('');
  dragScroll(rail);
  centerRail(false);
}
function centerRail(smooth = true) {
  const rail = $('#rail'), b = $(`[data-date="${S.date}"]`, rail);
  if (!b) return;
  rail.scrollTo({ left: b.offsetLeft - rail.clientWidth / 2 + b.offsetWidth / 2, behavior: smooth && !reduced ? 'smooth' : 'auto' });
}
function pickDate(d) {
  if (d === S.date) return;
  cScope = null;
  S.date = d; S.prev = {};
  $$('#rail .day').forEach(b => b.setAttribute('aria-pressed', b.dataset.date === d));
  centerRail();
  gamesFilter = 'all';
  loadScores();
}

function renderGamesSkeleton() {
  $('#games').innerHTML = Array.from({ length: 6 }, () => `<div class="sk" style="height:168px"></div>`).join('');
  $('#perfBlock').hidden = true;
}
function renderGamesError() {
  $('#games').innerHTML = `<div class="empty" style="grid-column:1/-1"><b>Can't reach the score feed</b>Check your connection. Fullcourt will keep retrying on its own.<br><button class="btn" data-retry="scores">Try again now</button></div>`;
}

function leaderLine(g) {
  const pick = side => {
    const cat = side.leaders.find(l => l.name === 'points' || l.name === 'pointsPerGame') || side.leaders[0];
    const L = cat?.leaders?.[0]; if (!L) return null;
    return { v: parseFloat(L.displayValue) || L.value || 0, dv: L.displayValue, a: L.athlete, team: side, cat };
  };
  const a = pick(g.away), h = pick(g.home);
  return [a, h].filter(Boolean).sort((x, y) => y.v - x.v)[0];
}

// Fullcourt's own pregame chances (the Playoff Odds and Bracketology models, built on GitHub): one small file, read at
// most every 30 minutes, then shown on upcoming games as a thin bar
let preWPAt = 0;
function loadPreWP() {
  if (Date.now() - preWPAt < 30 * 60e3) return; preWPAt = Date.now();
  const k = LGK, br = IS_C ? 'march-data' : 'sim-data';
  fetch(`https://raw.githubusercontent.com/larosa023/fullcourt/${br}/wp.json?t=${Math.floor(Date.now() / 1800e3)}`).then(r => r.ok ? r.json() : null).then(d => {
    const m = d?.[k]; if (!m || LGK !== k) return;
    S.wpPre = m;
    if (S.view === 'scores' && S.games.some(g => g.state === 'pre' && m[g.id] != null)) { const back = holdScroll(); renderGames(false); back(); }
  }).catch(() => { preWPAt = 0; });
}
function preWPLine(g) {
  const h = S.wpPre?.[g.id]; if (!Number.isFinite(h)) return '';
  const fav = h >= 0.5 ? g.home : g.away, pc = Math.round(Math.max(h, 1 - h) * 100);
  return `<div class="g-wp pre" title="Fullcourt's projection (team ratings, home court, injuries)"><span class="g-wp-bar" style="--a:${teamColor(g.away.id)};--h:${teamColor(g.home.id)}"><i style="width:${((1 - h) * 100).toFixed(1)}%"></i></span><span class="g-wp-t">${esc(fav.abbr)} ${pc}% · Fullcourt</span></div>`;
}
function gameCard(g, i, animate) {
  const live = g.state === 'in', post = g.state === 'post', pre = g.state === 'pre';
  const row = (s, side) => {
    const cls = post ? (s.winner ? 'win' : 'lose') : '';
    const key = `${g.id}-${s.id}`;
    const changed = S.prev[key] !== undefined && S.prev[key] !== s.score;
    return `<div class="trow ${cls}">
      ${logo(s.abbr, 68)}
      <div class="tname"><b>${s.rank ? `<i class="rk">${s.rank}</i>` : ''}${esc(s.name)}</b>${live && S.sit[g.id]?.teams?.[s.id] ? sitHTML(S.sit[g.id].teams[s.id]) : `<span>${esc(s.rec)}</span>`}</div>
      ${pre ? mlChip(g.odds, side) : `<span class="score${changed ? ' bump' : ''}">${esc(s.score)}</span>`}
    </div>`;
  };
  const L = leaderLine(g);
  let foot = '';
  if (pre) {
    const until = untilText(g.date);
    foot = `<div class="g-foot"><span class="tip">${esc(fmtTime(g.date))}</span><span class="lead">${esc(until || g.venue || '')}</span></div>`;
  } else if (L) {
    foot = `<div class="g-foot">${face(L.a?.id, L.a?.displayName, 'mini-face', 80)}<span class="lead"><b>${esc(L.a?.shortName || L.a?.displayName)}</b> ${esc(L.dv)} ${L.cat?.name === 'points' ? 'pts' : esc(L.cat?.abbreviation || '')} · ${esc(L.team.abbr)}</span></div>`;
    if (post && g.hasHl) foot = foot.replace('</div>', `<span class="g-hl" title="Highlights available: open the game">${PLAY_ICON}<em class="g-lbl">Highlights</em></span></div>`);
    if (!IS_C || live) foot = foot.replace(/<\/div>$/, `<span class="g-court" data-court="${g.id}" role="button" tabindex="0" title="Watch on the 2D court" aria-label="Court view">${COURT_ICON}<em class="g-lbl">Court</em></span></div>`);
  }
  return `<button class="game${live ? ' live' : ''}${isFavGame(g) ? ' fav' : ''}${animate ? ' enter' : ''}" style="--i:${i}" data-game="${g.id}" aria-label="${esc(g.away.full)} at ${esc(g.home.full)}, ${esc(statusText(g))}">
    <div class="g-top">
      <span class="status${live ? ' live' : ''}">${live ? '<span class="dot on"></span>' : ''}${esc(pre ? fmtShortDate(g.date) : statusText(g))}${live ? toPill(S.sit[g.id], id => id === g.home.id ? g.home.abbr : g.away.abbr) : ''}</span>
      ${isFavGame(g) ? '<span class="fav-tag">★ Your team</span>' : upsetOf(g) ? `<span class="g-tag up">Upset</span>` : IS_C && isClash(g) ? `<span class="g-tag">Top 25 clash</span>` : cupTag(g) ? `<span class="g-tag cup">${esc(cupTag(g))}</span>` : `<span class="tv">${esc(g.note || g.tv)}</span>`}
    </div>
    ${row(g.away, 'away')}${row(g.home, 'home')}
    ${pre ? oddsLine(g.odds) + preWPLine(g) : live ? liveLine(g) : ''}
    ${live && Number.isFinite(S.wpLive?.[g.id]) ? (() => { const h = S.wpLive[g.id], fav = h >= 0.5 ? g.home : g.away, pc = Math.round(Math.max(h, 1 - h) * 100); return `<div class="g-wp" title="Win probability (ESPN)"><span class="g-wp-bar" style="--a:${teamColor(g.away.id)};--h:${teamColor(g.home.id)}"><i style="width:${((1 - h) * 100).toFixed(1)}%"></i></span><span class="g-wp-t">${esc(fav.abbr)} ${pc}% to win</span></div>`; })() : ''}
    ${foot}
    ${live ? `<span class="prog" style="width:${(progress(g) * 100).toFixed(1)}%"></span>` : ''}
  </button>`;
}

function renderGames(animate) {
  const d = addDays(S.date, DSHIFT), lt = DSHIFT ? localToday() : S.today;
  const rel = d === lt ? 'Today' : d === addDays(lt, -1) ? 'Yesterday' : d === addDays(lt, 1) ? 'Tomorrow' : '';
  $('#dayTitle').textContent = rel || fmtDay(d, { weekday: 'long' });
  $('#dayEyebrow').textContent = fmtDay(d, { weekday: rel ? 'long' : undefined, month: 'long', day: 'numeric', year: 'numeric' });

  // college: a day can have 150 games, so start on the ones with a ranked team (or yours); All and each conference are a pick away
  let base = S.games, scopeHTML = '';
  if (IS_C && S.games.length) {
    const top = S.games.filter(g => g.home.rank || g.away.rank || isFavGame(g));
    const clash = S.games.filter(isClash);
    const scope = cScope ?? (top.length ? 'top' : 'all');
    const confN = new Map(); S.games.forEach(g => new Set([g.home.conf, g.away.conf].filter(Boolean)).forEach(c => confN.set(c, (confN.get(c) || 0) + 1)));
    const confs = (S.standings?.confs || []).filter(c => confN.has(c.id));
    base = scope === 'top' ? top : scope === 'clash' ? clash : scope === 'all' ? S.games : S.games.filter(g => g.home.conf === scope || g.away.conf === scope);
    scopeHTML = `<select class="count cs-scope" data-cscope aria-label="Which games"><option value="top"${scope === 'top' ? ' selected' : ''}>Top 25 · ${top.length}</option>${clash.length || scope === 'clash' ? `<option value="clash"${scope === 'clash' ? ' selected' : ''}>Top 25 clashes · ${clash.length}</option>` : ''}<option value="all"${scope === 'all' ? ' selected' : ''}>All games · ${S.games.length}</option>${confs.map(c => `<option value="${c.id}"${scope === c.id ? ' selected' : ''}>${esc(c.short)} · ${confN.get(c.id)}</option>`).join('')}</select>`;
  }
  const live = base.filter(g => g.state === 'in'), pre = base.filter(g => g.state === 'pre'), post = base.filter(g => g.state === 'post');
  const cnt = [['all', `${base.length} games`], ['in', `${live.length} live`], ['post', `${post.length} final`], ['pre', `${pre.length} upcoming`]]
    .filter(([k], i) => i === 0 || (k === 'in' ? live.length : k === 'post' ? post.length : pre.length));
  $('#counts').innerHTML = scopeHTML + (base.length ? cnt : []).map(([k, t]) => `<button class="count${gamesFilter === k ? ' filter-on' : ''}" data-filter="${k}">${k === 'in' ? '<span class="dot on"></span>' : ''}${t}</button>`).join('');

  let list = [...live, ...pre, ...post];
  if (favId) list.sort((a, b) => isFavGame(b) - isFavGame(a));
  if (gamesFilter !== 'all') list = list.filter(g => g.state === gamesFilter);
  if (IS_C && S.games.length && !base.length) {
    $('#games').innerHTML = `<div class="empty" style="grid-column:1/-1"><b>No ${cScope === 'clash' ? 'ranked-vs-ranked' : cScope === 'top' || cScope == null ? 'Top 25' : 'conference'} games on this date</b>${S.games.length} other game${S.games.length === 1 ? ' is' : 's are'} on the slate.<div class="btn-row" style="justify-content:center;margin-top:12px"><button class="btn ghost" data-cscopeall>Show all games</button></div></div>`;
  } else if (!S.games.length) {
    const cal = S.calendar || [];
    const next = cal.find(x => x > d), prev = [...cal].reverse().find(x => x < d);
    const btn = (x, label) => `<button class="btn ghost" data-date="${x}">${label}</button>`;
    $('#games').innerHTML = `<div class="empty" style="grid-column:1/-1"><b>No ${IS_C ? LGN.toLowerCase() + ' basketball' : LGN} games on this date</b>${next ? 'Pick another day, or jump to the nearest games.' : prev ? `No more ${IS_C ? LGN.toLowerCase() + ' basketball' : LGN} games are scheduled this season.` : 'Pick another day on the rail above.'}
      ${prev || next ? `<div class="btn-row" style="justify-content:center;margin-top:12px">${prev ? btn(prev, '← ' + fmtDay(prev, { month: 'short', day: 'numeric' })) : ''}${next ? btn(next, fmtDay(next, { weekday: 'short', month: 'short', day: 'numeric' }) + ' →') : ''}</div>` : ''}</div>`;
  } else {
    $('#games').innerHTML = list.map((g, i) => gameCard(g, i, animate)).join('');
  }
  S.games.forEach(g => { S.prev[`${g.id}-${g.home.id}`] = g.home.score; S.prev[`${g.id}-${g.away.id}`] = g.away.score; });
  renderPerformers(animate);
}

function renderPerformers(animate) {
  const items = [];
  const anyPlayed = S.games.some(g => g.state !== 'pre');
  for (const g of S.games) {
    if (anyPlayed && g.state === 'pre') continue;
    for (const side of [g.away, g.home]) {
      const cat = side.leaders.find(l => l.name === 'points' || l.name === 'pointsPerGame');
      const L = cat?.leaders?.[0];
      if (!L?.athlete) continue;
      const opp = side === g.away ? g.home : g.away;
      items.push({ v: parseFloat(L.displayValue) || 0, dv: L.displayValue, a: L.athlete, side, opp, g });
      const reb = side.leaders.find(l => /rebound/i.test(l.name))?.leaders?.[0];
      const ast = side.leaders.find(l => /assist/i.test(l.name))?.leaders?.[0];
      items.at(-1).extra = [reb?.athlete?.id === L.athlete.id ? `${reb.displayValue} reb` : '', ast?.athlete?.id === L.athlete.id ? `${ast.displayValue} ast` : ''].filter(Boolean).join(' · ');
    }
  }
  items.sort((a, b) => b.v - a.v);
  const blk = $('#perfBlock');
  if (!items.length) { blk.hidden = true; return; }
  blk.hidden = false;
  $('#perfTitle').textContent = anyPlayed ? 'Top scorers' : 'Players to watch';
  $('#perf').innerHTML = items.map((p, i) => {
    rememberPlayer(p.a, p.side.id);
    return `<button class="pcard${animate ? ' enter' : ''}" style="--i:${i};--tc:${teamColor(p.side.id)}" data-player="${p.a.id}">
      <div class="ph">${face(p.a.id, p.a.displayName, 'face', 350)}${logo(p.side.abbr, 44)}<span class="pv">${esc(p.dv)}<small>${anyPlayed ? 'PTS' : 'PPG'}</small></span></div>
      <div class="pi"><b>${esc(p.a.displayName)}</b><span>${esc(p.side.abbr)} ${p.side === p.g.home ? 'vs' : '@'} ${esc(p.opp.abbr)}</span><span class="ex">${esc(p.extra || (p.side.rec ? `${p.side.rec} record` : ''))}&nbsp;</span></div>
    </button>`;
  }).join('');
  dragScroll($('#perf'));
}

function rememberPlayer(a, teamId, extra = {}) {
  if (!a?.id) return;
  S.players[a.id] = { ...(S.players[a.id] || {}), id: a.id, name: a.displayName || a.fullName, short: a.shortName, jersey: a.jersey, pos: a.position?.abbreviation, teamId: teamId || a.team?.id || S.players[a.id]?.teamId, ...extra };
}

/* ================= standings ================= */
let stdPromise = null;
function loadStandings(force) {
  if (stdPromise && !force) return stdPromise;
  stdPromise = getJSON(`${API2}/standings`).then(d => {
    if (IS_C) return collegeStandings(d);
    const confs = (d.children || []).map(ch => ({
      name: ch.name, short: /east/i.test(ch.name) ? 'East' : 'West',
      rows: (ch.standings?.entries || []).map(en => {
        const stat = n => en.stats.find(x => x.name === n) || en.stats.find(x => x.type === n);
        const dv = n => stat(n)?.displayValue ?? '–';
        const t = en.team;
        regTeam(t, { conf: /east/i.test(ch.name) ? 0 : 1 });
        return {
          id: t.id, abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, loc: t.location,
          w: stat('wins')?.value ?? 0, l: stat('losses')?.value ?? 0, pct: dv('winPercent'), gb: dv('gamesBehind'),
          seed: stat('playoffSeed')?.value ?? 99, strk: dv('streak'), home: dv('home'), road: dv('road'),
          l10: dv('lasttengames'), ppg: dv('avgPointsFor'), opp: dv('avgPointsAgainst'),
          diff: stat('differential')?.value ?? 0, diffD: dv('differential'), conf: /east/i.test(ch.name) ? 0 : 1,
        };
      }).sort((a, b) => a.seed - b.seed),
    }));
    confs.sort((a, b) => (a.short === 'East' ? -1 : 1));
    S.standings = { confs, season: d.seasons?.find(s => s.year === d.season?.year)?.displayName || d.season?.displayName || '' };
    renderMini();
    renderFavLink();
    if (S.view === 'standings') renderStandings();
    if (S.view === 'teams') renderTeams();
    return S.standings;
  }).catch(e => { stdPromise = null; throw e; });
  return stdPromise;
}
setInterval(() => { if (!document.hidden) loadStandings(true).catch(() => {}); }, 5 * 60e3);
// college: 32 conferences instead of East/West. Power conferences first, then A to Z.
const POWER = ['SEC', 'ACC', 'Big Ten', 'Big 12', 'Big East'];
function collegeStandings(d) {
  const confs = (d.children || []).map(ch => {
    const short = ch.shortName || ch.abbreviation || ch.name;
    const rows = (ch.standings?.entries || []).map(en => {
      const st = n => en.stats.find(x => x.type === n), dv = n => st(n)?.displayValue ?? '–', num = n => +(st(n)?.value ?? 0);
      const t = en.team;
      regTeam(t, { confId: String(ch.id), confShort: short });
      const [w, l] = (dv('total') || '0-0').split('-').map(Number);
      return {
        id: t.id, abbr: t.abbreviation, name: t.displayName, short: t.shortDisplayName || t.name, loc: t.location,
        w: w || 0, l: l || 0, pct: dv('winpercent'), conf: dv('vsconf'), confPct: num('vsconf_winpercent'), cw: num('vsconf_wins'), cl: num('vsconf_losses'),
        home: dv('home'), road: dv('road'), vsAP: dv('vsaprankedteams'), strk: dv('streak'),
        ppg: dv('avgpointsfor'), opp: dv('avgpointsagainst'), diff: num('pointdifferential'), diffD: dv('pointdifferential'), seed: 0, gb: '',
      };
    }).sort((a, b) => b.confPct - a.confPct || b.cw - a.cw || a.cl - b.cl || (parseFloat(b.pct) || 0) - (parseFloat(a.pct) || 0) || b.w - a.w || a.loc.localeCompare(b.loc));
    rows.forEach((r, i) => { r.seed = i + 1; });
    return { id: String(ch.id), name: ch.name.replace(/ Conference$/, ''), short, rows };
  }).filter(c => c.rows.length);
  const pi = c => { const i = POWER.indexOf(c.short); return i < 0 ? 99 : i; };
  confs.sort((a, b) => pi(a) - pi(b) || a.short.localeCompare(b.short));
  S.standings = { confs, season: d.season?.displayName || '' };
  lazy('college').then(m => { m.renderMini(); if (S.view === 'standings') m.renderStandings(); if (S.view === 'teams') renderTeams(); }).catch(() => {});
  renderFavLink();
  return S.standings;
}

function renderMini() {
  if (IS_C) { lazy('college').then(m => m.renderMini()).catch(() => {}); return; }
  const box = $('#miniStd');
  if (!S.standings) { box.innerHTML = Array.from({ length: 8 }, () => `<div class="sk" style="height:30px;margin:4px 0;border-radius:8px"></div>`).join(''); return; }
  const rows = S.standings.confs[S.miniConf]?.rows || [];
  box.innerHTML = rows.slice(0, 10).map((r, i) => `
    ${i === 6 && !IS_W ? '<div class="cutline" title="Play-In"></div>' : ''}
    <button class="mini-row${r.id === favId ? ' fav-row' : ''}" data-team="${r.id}"><span class="sd">${r.seed}</span>${logo(r.abbr, 48)}<span class="nm">${esc(r.short)}</span><span class="rc">${r.w}-${r.l}</span><span class="gb">${esc(r.gb)}</span></button>`).join('');
}

function renderStandings() {
  if (IS_C) { lazy('college').then(m => m.renderStandings()).catch(() => {}); return; }
  const wrap = $('#stdWrap');
  if (!S.standings) {
    wrap.innerHTML = `<div style="padding:14px;display:grid;gap:8px">${Array.from({ length: 10 }, () => '<div class="sk" style="height:34px;border-radius:8px"></div>').join('')}</div>`;
    loadStandings().catch(() => { wrap.innerHTML = `<div class="empty" style="border:0"><b>Standings didn't load</b>The feed may be busy.<br><button class="btn" data-retry="standings">Try again</button></div>`; });
    return;
  }
  // WNBA offseason: ESPN already calls it next year's season while the table still holds this year's final records
  const yr = new Date().getFullYear(), wOff = IS_W && +S.standings.season > yr;
  $('#stdSeason').textContent = wOff ? `${yr} season · final` : `${S.standings.season || 'Current'} season`;
  $('#v-standings .legend').hidden = S.stdConf >= 3;
  if (IS_W) $('#stdLegend').innerHTML = '<span><i class="zone po"></i>Playoff spot (top 8 in the league)</span><span>Tap a team for roster and schedule</span>';
  if (S.stdConf === 5) { lazy('sim').then(m => m.renderOdds(wrap)).catch(() => { wrap.innerHTML = '<div class="empty" style="border:0"><b>Playoff odds didn\'t load</b><button class="btn" data-retry="standings">Try again</button></div>'; }); return; }
  if (S.stdConf !== 4 && !wrap.classList.contains('tbl-wrap')) { wrap.classList.add('tbl-wrap', 'drag-x'); wrap.dataset.drag = ''; }
  if (S.stdConf === 4) { if (!wrap.querySelector('.cup')) wrap.innerHTML = '<div class="sk" style="height:420px"></div>'; lazy('cup').then(m => m.renderCup(wrap)).catch(() => { wrap.innerHTML = '<div class="empty" style="border:0"><b>The NBA Cup didn\'t load</b><button class="btn" data-retry="standings">Try again</button></div>'; }); return; }
  if (S.stdConf === 3) { wrap.innerHTML = '<div class="sk" style="height:420px"></div>'; lazy('playoff').then(m => { if (S.stdConf === 3) { wrap.innerHTML = m.playoffBracket(); dragScroll(wrap); } }).catch(() => { wrap.innerHTML = '<div class="empty"><b>Couldn\'t load the bracket</b>Check your connection.</div>'; }); return; }
  let rows, league = S.stdConf === 2;
  if (league) {
    rows = S.standings.confs.flatMap(c => c.rows).sort((a, b) => (parseFloat(b.pct) || 0) - (parseFloat(a.pct) || 0) || b.w - a.w);
  } else rows = S.standings.confs[S.stdConf]?.rows || [];
  const maxDiff = Math.max(1, ...rows.map(r => Math.abs(r.diff)));
  wrap.innerHTML = `<table class="std">
    <thead><tr><th>${league ? '#' : 'Seed'} · Team</th><th>W</th><th>L</th><th>PCT</th><th>GB</th><th>Home</th><th>Away</th><th>L10</th><th>Strk</th><th>PPG</th><th>OPP</th><th>Diff</th></tr></thead>
    <tbody>${rows.map((r, i) => {
      const seed = league ? i + 1 : r.seed;
      const zone = IS_W ? (r.seed <= 8 ? 'po' : '') : league ? '' : seed <= 6 ? 'po' : seed <= 10 ? 'pi' : '';
      const cut = IS_W || league ? '' : seed === 6 ? 'cut' : seed === 10 ? 'cut-pi' : '';
      const sw = /^W/.test(r.strk) ? 'strk-w' : /^L/.test(r.strk) ? 'strk-l' : '';
      const w = Math.round(Math.abs(r.diff) / maxDiff * 54);
      return `<tr class="${cut}${r.id === favId ? ' fav-row' : ''}" data-team="${r.id}" style="--i:${i}">
        <td><div class="team-cell"><i class="zone ${zone}"></i><span class="seed">${seed}</span>${logo(r.abbr, 56)}<b>${esc(r.name)}</b><span class="ab">${esc(r.abbr)}</span>${league ? `<span class="eyebrow">${r.conf ? 'W' : 'E'}</span>` : ''}</div></td>
        <td>${r.w}</td><td>${r.l}</td><td>${esc(r.pct)}</td><td>${esc(r.gb)}</td><td>${esc(r.home)}</td><td>${esc(r.road)}</td><td>${esc(r.l10)}</td>
        <td class="${sw}">${esc(r.strk)}</td><td>${esc(r.ppg)}</td><td>${esc(r.opp)}</td>
        <td><span class="diffbar"><i data-w="${w}" style="background:${r.diff >= 0 ? 'var(--win)' : 'var(--loss)'}"></i><span class="${r.diff >= 0 ? 'strk-w' : 'strk-l'}">${r.diff > 0 && !String(r.diffD).startsWith('+') ? '+' : ''}${esc(r.diffD)}</span></span></td>
      </tr>`;
    }).join('')}</tbody></table>`;
  dragScroll(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.diffbar i', wrap).forEach(i => i.style.width = i.dataset.w + 'px')));
}

/* ================= teams ================= */
function renderTeams() {
  if (IS_C) { lazy('college').then(m => m.renderTeams()).catch(() => {}); return; }
  const body = $('#teamsBody');
  requestAnimationFrame(() => placeKnob($('#teamsSeg')));
  if (S.teamsMode === 'ranks') { renderRankings(); return; }
  if (S.teamsMode === 'moves') { renderMoves(); return; }
  if (!S.standings) {
    body.innerHTML = `<div class="team-grid">${Array.from({ length: 12 }, () => '<div class="sk" style="height:132px"></div>').join('')}</div>`;
    loadStandings().catch(() => { body.innerHTML = `<div class="empty"><b>Teams didn't load</b><button class="btn" data-retry="teams">Try again</button></div>`; });
    return;
  }
  $('#teamsCount').textContent = `${S.standings.confs.reduce((n, c) => n + c.rows.length, 0)} ${LGN} teams`;
  body.innerHTML = S.standings.confs.map(c => {
    const rows = [...c.rows].sort((a, b) => a.loc.localeCompare(b.loc));
    return `<div class="conf-h"><h2 class="h-display">${esc(c.name)}</h2><span class="eyebrow">${rows.length} teams</span></div>
    <div class="team-grid">${rows.map((r, i) => `
      <button class="ttile enter" style="--i:${i};--tc:${teamColor(r.id)}" data-team="${r.id}">
        ${logo(r.abbr, 240, 'lg bg-logo')}
        ${logo(r.abbr, 88)}
        ${r.id === favId ? '<span class="tile-star" title="Your team">★</span>' : ''}<div><span>${esc(r.loc)}</span><b>${esc(r.short)}</b><span class="num">${r.w}-${r.l} · ${ordinal(r.seed)} ${c.short} · ${esc(r.strk)}</span></div>
      </button>`).join('')}</div>`;
  }).join('');
}
const ordinal = n => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

/* ================= leaders ================= */
// every team's colours in one small request, so bars and accents can use them
let teamColorsP = null;
function ensureTeamColors() {
  if (!teamColorsP) teamColorsP = getJSON(`${API}/teams${IS_C ? '?groups=50&limit=500' : ''}`).then(d => {
    (d.sports?.[0]?.leagues?.[0]?.teams || []).forEach(x => { const t = x.team || x; if (t?.id) regTeam(t, { alt: t.alternateColor || '' }); });
  }).catch(() => { teamColorsP = null; });
  return teamColorsP;
}
// a team colour that stays readable on both themes: --bl for light, --bd for dark
function barVars(teamIdOrAbbr) {
  const hex = teamColor(teamIdOrAbbr).replace('#', '');
  const n = parseInt(hex, 16); if (!Number.isFinite(n)) return '';
  const rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const mix = (c, t, k) => c.map(v => Math.round(v + (t - v) * k));
  let d = rgb, l = rgb;
  for (let k = 0.15; lum(d) < 0.32 && k <= 0.75; k += 0.1) d = mix(rgb, 255, k);
  for (let k = 0.15; lum(l) > 0.62 && k <= 0.75; k += 0.1) l = mix(rgb, 0, k);
  const css = c => `rgb(${c.join(' ')})`;
  return `--bl:${css(l)};--bd:${css(d)}`;
}
function renderLeadChips() {
  $('#leadAdv').innerHTML = advBtn();
  $('#leadChips').innerHTML = leadCats().map((c, i) => `<button class="chip" data-lead="${i}" aria-pressed="${i === S.leadKey}">${esc(c.k)}</button>`).join('');
  dragScroll($('#leadChips'));
}
// advanced leader boards are worked out from the full player table
const ADV_LEADER_CATS = [
  { k: 'True shooting', u: 'TS%', adv: 'ts' }, { k: 'Effective FG', u: 'eFG%', adv: 'efg' }, { k: 'Points per 36', u: 'PTS/36', adv: 'p36' },
  { k: 'Assist/turnover', u: 'AST/TO', adv: 'ato' }, { k: 'Stocks', u: 'STL+BLK', adv: 'stocks' }, { k: 'Free throw rate', u: 'FTA/FGA', adv: 'ftr' }, { k: '3-point rate', u: '3PA/FGA', adv: 'tpr' },
];
const leadCats = () => advOn ? ADV_LEADER_CATS : LEADER_CATS;
document.addEventListener('fcadv', () => { S.leadKey = 0; renderLeadChips(); if (S.view === 'leaders') loadLeaders(); });
/* Leaders refresh: every minute while games are live, every 10 minutes otherwise, and right after a game ends.
   ESPN's season numbers count finished games, so the board moves when a game goes final. */
const leadTTL = () => (S.liveNow ? 60e3 : 10 * 60e3);
const leadStale = e => !e || Date.now() - e.t > leadTTL() || e.t < (S.leadFinalAt || 0);
async function loadLeaders(opts = {}) {
  const c = leadCats()[S.leadKey];
  const silent = !!opts.silent;
  if (c.adv) { if (silent && !leadStale(S.lt)) return; const y = scrollY; if (silent) { try { await leagueTable(); } catch (e) { return; } } await renderAdvLeader(c, silent); if (silent) window.scrollTo(0, y); leadStamp(); return; }
  if (c.award) {
    const k = 'award-' + c.award; if (silent && !leadStale(S.leadCache[k])) return;
    const y = scrollY;
    if (S.leadCache[k] && leadStale(S.leadCache[k])) { if (!silent) delete S.leadCache[k]; else { try { const m = await lazy('awards'); S.leadCache[k] = { t: Date.now(), d: await m.awardRace(c.award) }; } catch (e) { return; } } }
    await renderAward(c); if (silent) window.scrollTo(0, y); leadStamp(); return;
  }
  const body = $('#leadBody');
  const key = c.cat + '.' + c.name;
  const ent = S.leadCache[key];
  if (silent && !leadStale(ent)) return;
  if (leadStale(ent)) {
    if (!ent) body.innerHTML = `<div class="lead-grid"><div class="sk" style="height:420px;border-radius:20px"></div><div class="sk" style="height:520px"></div></div>`;
    try {
      const d = await getJSON(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=15&sort=${key}:desc${SEASON_QS}`);
      const sig = x => JSON.stringify((x?.athletes || []).map(a => [a.athlete?.id, a.categories?.map(k => k.values)]));
      const same = ent && sig(ent.d) === sig(d);
      S.leadCache[key] = { t: Date.now(), d };
      if (silent && same) { leadStamp(); return; } // nothing moved: just the "updated" time
    } catch (e) {
      if (ent) { leadStamp(); return; } // keep what's on screen
      body.innerHTML = `<div class="empty"><b>Leaders didn't load</b>The stats feed may be busy.<br><button class="btn" data-retry="leaders">Try again</button></div>`;
      return;
    }
  }
  const keepY = silent ? scrollY : null;
  await ensureTeamColors();
  if (leadCats()[S.leadKey] !== c) return;
  const d = S.leadCache[key].d;
  const idx = (d.categories || []).find(x => x.name === c.cat)?.names?.indexOf(c.name) ?? -1;
  const gpIdx = (d.categories || []).find(x => x.name === 'general')?.names?.indexOf('gamesPlayed') ?? -1;
  const rows = (d.athletes || []).map(a => {
    const cat = a.categories?.find(x => x.name === c.cat);
    const gen = a.categories?.find(x => x.name === 'general');
    const v = cat?.values?.[idx];
    rememberPlayer(a.athlete, a.athlete.teamId);
    return { a: a.athlete, v: Number(v) || 0, gp: gen?.values?.[gpIdx] };
  });
  if (!rows.length) { body.innerHTML = `<div class="empty"><b>No qualified leaders yet</b>Check back after a few more games.</div>`; return; }
  const fmt = v => c.total ? String(Math.round(v)) : c.pct ? v.toFixed(1) : v.toFixed(1);
  const top = rows[0], max = Math.max(...rows.map(r => r.v)) || 1;
  const team = a => ({ id: a.teamId, abbr: a.teamShortName || a.teams?.[0]?.abbreviation || '' });
  body.innerHTML = `<div class="lead-grid">
    <button class="hero-card enter" style="--tc:${teamColor(team(top.a).id)}" data-player="${top.a.id}">
      <span class="rk">No. 1 · ${esc(c.k.toUpperCase())}</span>
      ${face(top.a.id, top.a.displayName, 'face', 700)}
      <div class="big num">${fmt(top.v)}<small>${esc(c.u)}</small></div>
      <div class="who">${esc(top.a.displayName)}</div>
      <div class="meta">${esc(top.a.teams?.[0]?.displayName || top.a.teamName || '')} · ${esc(top.a.position?.abbreviation || '')}${top.gp ? ` · ${top.gp} GP` : ''}</div>
    </button>
    <div class="lrows">${rows.map((r, i) => `
      <button class="lrow enter" style="--i:${i}" data-player="${r.a.id}">
        <span class="rk">${i + 1}</span>${face(r.a.id, r.a.displayName, 'face', 120)}
        <span class="nm"><b>${esc(r.a.displayName)}</b><span>${logo(team(r.a).abbr, 32)}${esc(team(r.a).abbr)} · ${esc(r.a.position?.abbreviation || '')}${r.gp ? ` · ${r.gp} GP` : ''}</span></span>
        <span class="bar"><i data-w="${(r.v / max * 100).toFixed(1)}" style="${barVars(team(r.a).id || team(r.a).abbr)}"></i></span>
        <span class="v">${fmt(r.v)}</span>
      </button>`).join('')}</div>
  </div>`;
  requestAnimationFrame(() => requestAnimationFrame(() => $$('.lrow .bar i', body).forEach(i => i.style.width = i.dataset.w + '%')));
  leadStamp();
  if (keepY != null) window.scrollTo(0, keepY);
}
// "Updated 2 min ago" under the title
function leadStamp() {
  const el = $('#leadUpd'); if (!el) return;
  const c = leadCats()[S.leadKey], e = c.adv ? S.lt : S.leadCache[c.award ? 'award-' + c.award : c.cat + '.' + c.name];
  if (!e?.t) { el.textContent = ''; return; }
  const m = Math.round((Date.now() - e.t) / 60e3);
  el.innerHTML = `<i class="dot${S.liveNow ? ' on' : ''}"></i>Updated ${m < 1 ? 'just now' : `${m} min ago`} · ${S.liveNow ? 'checks every minute while games are live' : 'checks every 10 minutes'} and right after each game ends`;
}
// while Leaders is open: refresh when stale (silently, keeping your place), and keep the "updated" time current
setInterval(() => { if (S.view !== 'leaders' || document.hidden || IS_C) return; loadLeaders({ silent: true }).catch(() => {}); leadStamp(); }, 30e3);
document.addEventListener('visibilitychange', () => { if (document.hidden || S.view !== 'leaders' || IS_C) return; leadStamp(); loadLeaders({ silent: true }).catch(() => {}); });


/* ================= timeouts, team fouls, bonus (worked out from the play-by-play) ================= */
// NBA: 7 timeouts; at most 4 in the 4th and 2 after its 3:00 mark; 2 per overtime. WNBA: 5 + 1 Reset; 2 + 1 Reset per overtime.
// Team fouls: free throws start once a team passes 4 in a quarter (3 in overtime), or on its 2nd foul in a period's last 2:00.
function situation(d) {
  const comp = d?.header?.competitions?.[0], st = comp?.status;
  if (!comp || st?.type?.state !== 'in') return null;
  const per = st.period || 1, clk = clockSecs(st.displayClock);
  const ids = comp.competitors.map(c => c.team.id);
  const T = {}; ids.forEach(id => { T[id] = { used: 0, usedPer: 0, usedLate: 0, fouls: 0, foulsL2: 0 }; });
  const plays = d.plays || [];
  let lastTO = -1;
  plays.forEach((p, i) => {
    const t = p.type?.text || '', tid = p.team?.id, pp = p.period?.number || 1, c = clockSecs(p.clock?.displayValue);
    const teamTO = /timeout/i.test(t) && !/official/i.test(t);
    const lostChallenge = /coach'?s challenge/i.test(t) && /(supported|stands|upheld|unsuccessful)/i.test(t);
    if ((teamTO || lostChallenge) && tid && T[tid]) {
      if (pp > REG_PERIODS ? pp === per : per <= REG_PERIODS) T[tid].used++;
      if (pp === per) { T[tid].usedPer++; if (RULES.lateAt && pp === 4 && c <= RULES.lateAt) T[tid].usedLate++; }
    }
    if (/timeout/i.test(t) && pp === per) lastTO = i;
    if (pp === per && tid && T[tid] && /foul/i.test(t) && !/offensive|technical|turnover|double/i.test(t)) { T[tid].fouls++; if (c <= 120) T[tid].foulsL2++; }
  });
  const reg = per <= 4, limit = reg ? RULES.foulReg : RULES.foulOT;
  const teams = {};
  ids.forEach((id, k) => {
    const me = T[id], opp = T[ids[1 - k]];
    let rem = (reg ? RULES.toReg : RULES.toOT) - me.used;
    if (per === 4 && RULES.q4Max) rem = Math.min(rem, RULES.q4Max - me.usedPer);
    if (per === 4 && RULES.lateAt && clk <= RULES.lateAt) rem = Math.min(rem, RULES.lateMax - me.usedLate);
    teams[id] = { rem: Math.max(0, rem), max: reg ? RULES.toReg : RULES.toOT, fouls: me.fouls, bonus: opp.fouls >= limit || (clk <= 120 && opp.foulsL2 >= 1) };
  });
  let inTO = null;
  if (lastTO >= 0) {
    const p = plays[lastTO];
    const quiet = plays.slice(lastTO + 1).every(q => /substitution|timeout|challenge|review|enters the game/i.test((q.type?.text || '') + ' ' + (q.text || '')));
    if (quiet && clockSecs(p.clock?.displayValue) === clk && clk > 0) inTO = { team: p.team?.id || null, official: /official/i.test(p.type?.text || '') };
  }
  return { teams, inTO, per };
}
function sitHTML(ts, label = true) {
  if (!ts) return '';
  const dots = Array.from({ length: ts.max }, (_, i) => `<i class="${i < ts.rem ? '' : 'u'}"></i>`).join('');
  return `<span class="sit" title="${ts.rem} timeout${ts.rem === 1 ? '' : 's'} left · ${ts.fouls} team foul${ts.fouls === 1 ? '' : 's'} this period">${label ? `<span class="tol">TO</span>` : ''}<span class="tos">${dots}</span>${ts.bonus ? '<em class="bonus">Bonus</em>' : ''}</span>`;
}
function toPill(sit, abbrOf) {
  if (!sit?.inTO) return '';
  const who = sit.inTO.official ? 'Official' : sit.inTO.team ? abbrOf(sit.inTO.team) : '';
  return `<span class="to-pill">Timeout${who ? ' · ' + esc(who) : ''}</span>`;
}
S.sit = {}; S.sitAt = {};
async function refreshSit() {
  if (S.view !== 'scores' || document.hidden) return;
  const live = S.games.filter(g => g.state === 'in' && Date.now() - (S.sitAt[g.id] || 0) > 25000);
  if (!live.length) return;
  const res = await Promise.all(live.map(g => summaryCached(g.id, 15000).then(d => [g.id, situation(d), d.winprobability?.at(-1)?.homeWinPercentage]).catch(() => null)));
  let changed = false;
  S.wpLive = S.wpLive || {};
  res.forEach(r => { if (!r) return; S.sit[r[0]] = r[1]; S.sitAt[r[0]] = Date.now(); if (Number.isFinite(r[2])) S.wpLive[r[0]] = r[2]; changed = true; });
  if (changed && S.view === 'scores') { const back = holdScroll(); renderGames(false); back(); }
}

/* ================= flyout stack ================= */
const stack = [];
const ICON = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M15 5l-7 7 7 7"/></svg>',
  expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>',
  shrink: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 11h-6V5M5 13h6v6M13 11l7-7M11 13l-7 7"/></svg>',
};
// Full-screen flyouts: the choice is remembered for next time
let fullPref = false;
try { fullPref = localStorage.getItem('fc-full') === '1'; } catch (e) {}
function setFull(el, on) {
  el.classList.toggle('full', on);
  const b = $('[data-expand]', el);
  if (b) { b.innerHTML = on ? ICON.shrink : ICON.expand; b.setAttribute('aria-pressed', on); b.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen'); b.title = on ? 'Exit full screen' : 'Full screen'; }
}
function toggleFull(el) {
  fullPref = !el.classList.contains('full');
  try { localStorage.setItem('fc-full', fullPref ? '1' : '0'); } catch (e) {}
  setFull(el, fullPref);
}
// while a panel is open, the page behind it is out of reach (keyboard and screen readers stay in the panel);
// closing the last one puts focus back where it was
let sheetFrom = null;
function bgInert(on) { for (const el of [$('.mast'), $('main'), $('#tabbar')]) if (el) el.inert = on; }
let sheetN = 0;
function openSheet(title) {
  closeDrawer();
  if (!stack.length) { sheetFrom = document.activeElement; bgInert(true); }
  const el = document.createElement('section'), tid = `sheetT${++sheetN}`;
  el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', tid);
  el.innerHTML = `<div class="sheet-grip" aria-hidden="true"><span></span></div>
    <header class="sheet-bar"><button class="icon-btn" data-close aria-label="${stack.length ? 'Back' : 'Close'}">${stack.length ? ICON.back : ICON.close}</button><div class="sheet-title" id="${tid}">${esc(title)}</div><button class="icon-btn expand-btn" data-expand aria-pressed="false" aria-label="Full screen" title="Full screen">${ICON.expand}</button></header>
    <div class="sheet-body"><div class="sk" style="height:200px;border-radius:18px"></div><div class="sk" style="height:120px"></div><div class="sk" style="height:300px"></div></div>`;
  setFull(el, fullPref);
  $('#layer').append(el);
  stack.forEach(s => s.el.classList.add('behind'));
  const sheet = { el, body: $('.sheet-body', el), timers: [], alive: true };
  stack.push(sheet);
  // each open panel is a step in browser history, so Back (mouse button, keyboard, swipe) closes it
  try { history.pushState({ fc: 1, depth: stack.length }, '', location.href); S.hd = (S.hd || 0) + 1; } catch (e) {}
  $('#scrim').classList.add('on');
  document.documentElement.classList.add('locked');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  setTimeout(() => $('[data-close]', el)?.focus({ preventScroll: true }), 60);
  swipeToClose(el, sheet);
  return sheet;
}
function popSheet() {
  const s = stack.pop(); if (!s) return;
  s.alive = false; s.timers.forEach(clearTimeout);
  s.el.style.transform = ''; s.el.classList.remove('open');
  setTimeout(() => s.el.remove(), 520);
  stack.at(-1)?.el.classList.remove('behind');
  if (!stack.length) {
    $('#scrim').classList.remove('on'); document.documentElement.classList.remove('locked'); bgInert(false);
    const f = sheetFrom; sheetFrom = null; if (f?.isConnected && !$('.pop:not([hidden])')) try { f.focus({ preventScroll: true }); } catch (e) {}
  }
}
// close panels now, and quietly rewind the history steps they added
function closeSheets(n) {
  n = Math.min(n, stack.length); if (!n) return;
  for (let i = 0; i < n; i++) popSheet();
  const k = Math.min(n, S.hd || 0);
  if (k) { S.hd -= k; S.skipPop = (S.skipPop || 0) + 1; try { history.go(-k); } catch (e) { S.skipPop--; } }
}
function closeTop() { closeSheets(1); }
function closeAll() { closeSheets(stack.length); }
window.addEventListener('popstate', e => {
  if (S.skipPop) { S.skipPop--; applyPendingHash(); return; }
  // the browser's Back (or Forward) button: match the open panels to the history step we landed on
  const target = e.state?.fc ? e.state.depth : 0;
  S.hd = target;
  while (stack.length > target) popSheet();
  applyPendingHash();
});
function applyPendingHash() {
  if (S.pendingHash && !S.skipPop) { try { history.replaceState(null, '', '#' + S.pendingHash); } catch (e) {} S.pendingHash = null; }
}
$('#scrim').addEventListener('click', closeAll);
document.addEventListener('keydown', e => {
  if (!stack.length) return;
  if (e.key === 'Escape') closeTop();
  else if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) toggleFull(stack.at(-1).el);
});
function setTitle(sheet, t) { $('.sheet-title', sheet.el).textContent = t; }

function swipeToClose(el, sheet) {
  let y0 = null, dy = 0, t0 = 0;
  const start = e => {
    if (innerWidth > 760) return;
    if (e.target.closest('button') && !e.target.closest('.sheet-grip')) return;
    y0 = e.clientY; dy = 0; t0 = performance.now();
    el.style.transition = 'none';
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); el.style.transform = `translateY(${dy}px)`; };
  const end = () => {
    if (y0 == null) return;
    const v = dy / Math.max(1, performance.now() - t0);
    y0 = null; el.style.transition = '';
    if (dy > 130 || v > 0.6) { if (stack.at(-1) === sheet) closeTop(); }
    else el.style.transform = '';
  };
  [$('.sheet-grip', el), $('.sheet-bar', el)].forEach(h => {
    h.addEventListener('pointerdown', start);
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  });
}

/* ================= game flyout ================= */
async function openGame(id, opts = {}) {
  const sheet = openSheet('Game');
  // opened from a bet leg: start on that player's team in the box score, scroll to his row and keep it highlighted
  const focusPid = opts.focus ? String(opts.focus) : null; let focusDone = false;
  let tab = opts.tab || 'box', boxSide = 1, lastPlayId = null, first = true, clipCard = null, cur = null;
  const shotF = { team: 'all', pid: '' };
  const plF = { kind: 'all', team: 'all', per: 'all', n: 120 };
  addShareBtn(sheet, () => cur ? shareGame(cur.d, cur.sides) : null);
  addIsleBtn(sheet, id);
  const load = async () => {
    if (!sheet.alive) return;
    let d;
    try { d = await getJSON(`${API}/summary?event=${id}`); }
    catch (e) {
      if (first) sheet.body.innerHTML = `<div class="empty"><b>Game details didn't load</b><button class="btn" data-close-retry>Close</button></div>`;
      sheet.timers.push(setTimeout(load, 20000));
      return;
    }
    if (!sheet.alive) return;
    const comp = d.header?.competitions?.[0];
    if (!comp) return;
    const st = comp.status?.type || {};
    const sides = ['away', 'home'].map(ha => {
      const c = comp.competitors.find(x => x.homeAway === ha);
      regTeam(c.team);
      return { ha, id: c.team.id, abbr: c.team.abbreviation, name: c.team.displayName, short: c.team.name || c.team.shortDisplayName, score: c.score ?? '', winner: c.winner, rec: c.record?.find(r => r.type === 'total')?.summary || c.record?.[0]?.summary || '', lines: (c.linescores || []).map(l => l.displayValue ?? l.value) };
    });
    const g = { state: st.state, desc: st.description, period: comp.status?.period, clock: comp.status?.displayClock, date: comp.date };
    setTitle(sheet, `${sides[0].abbr} @ ${sides[1].abbr}`);

    const live = g.state === 'in', pre = g.state === 'pre';
    const sit = live ? situation(d) : null;
    if (sit) { S.sit[id] = sit; S.sitAt[id] = Date.now(); }
    const sitOf = s => sit?.teams?.[s.id] ? `<span class="gh-sit">${sitHTML(sit.teams[s.id])}</span>` : '';
    const prevScroll = sheet.body.scrollTop;
    const header = `
      <div class="gh${first ? ' enter' : ''}">
        <div class="gh-band"><i style="background:${teamColor(sides[0].id)}"></i><i style="background:${teamColor(sides[1].id)}"></i></div>
        <div class="gh-main">
          <button class="gh-team" data-team="${sides[0].id}">${logo(sides[0].abbr, 120)}<b>${esc(sides[0].short)}</b><span>${esc(sides[0].rec)} · Away</span>${sitOf(sides[0])}</button>
          <div class="gh-score">${pre ? `<span class="tip" style="font-size:26px;white-space:nowrap">${esc(fmtTime(g.date))}</span>` : `<span class="score" style="${!sides[0].winner && g.state === 'post' ? 'color:var(--muted)' : ''}">${esc(sides[0].score)}</span><span class="sep"></span><span class="score" style="${!sides[1].winner && g.state === 'post' ? 'color:var(--muted)' : ''}">${esc(sides[1].score)}</span>`}</div>
          <button class="gh-team" data-team="${sides[1].id}">${logo(sides[1].abbr, 120)}<b>${esc(sides[1].short)}</b><span>${esc(sides[1].rec)} · Home</span>${sitOf(sides[1])}</button>
        </div>
        <div class="gh-status"><span class="status${live ? ' live' : ''}">${live ? '<span class="dot on"></span>' : ''}${esc(pre ? fmtLocal(g.date, { weekday: 'long', month: 'short', day: 'numeric' }) : statusText(g))}${toPill(sit, tid => sides.find(x => x.id === tid)?.abbr || '')}</span>
        <span>${esc([d.gameInfo?.venue?.fullName, d.gameInfo?.venue?.address?.city].filter(Boolean).join(', '))}${d.gameInfo?.attendance ? ` · ${Number(d.gameInfo.attendance).toLocaleString()} fans` : ''}</span>
        ${g.state === 'post' && (d.videos || []).length ? `<button class="gh-hl" data-replay="${esc(id)}|${etYmd(comp.date)}">${PLAY_ICON}Highlights in Replay</button>` : ''}</div>
      </div>`;

    let side = header, main = '';
    if (!pre && sides[0].lines.length) {
      const n = Math.max(sides[0].lines.length, REG_PERIODS);
      const ph = Array.from({ length: n }, (_, i) => i < REG_PERIODS ? i + 1 : i === REG_PERIODS ? 'OT' : `${i - REG_PERIODS + 1}OT`);
      side += `<div class="card"><div class="ls-wrap"><table class="ls"><thead><tr><th>Team</th>${ph.map(p => `<th>${p}</th>`).join('')}<th>T</th></tr></thead><tbody>
        ${sides.map(s => `<tr><td><span class="tcell">${logo(s.abbr, 40)}${esc(s.abbr)}</span></td>${ph.map((_, i) => `<td>${esc(s.lines[i] ?? '–')}</td>`).join('')}<td>${esc(s.score)}</td></tr>`).join('')}
      </tbody></table></div></div>`;
    }
    cur = { d, sides };
    side += wpChart(d, sides);
    if (g.state !== 'post') side += watchCard(d, sides);
    if (!pre) side += flowCard(d, sides) + officialsCard(d);
    const clips = pre ? [] : clipList(d);

    if (pre) {
      side += preSide(d, sides) + lineMoveCard(gameOdds(d), sides);
      main += preGame(d, sides, g);
    } else {
      main += recapHTML(d, sides) + notableCard(d) + clipsCard(clips);
      if (live) side += oddsCard(gameOdds(d, id), sides, 'Line', `Updated ${esc(fmtTime(new Date().toISOString()))}. Shows in-game prices when the sportsbook posts them.`);
      main += `<div class="card"><div class="tabs hs" role="tablist" data-drag>
        ${[['box', 'Box score'], ['court', 'Court'], ['shots', 'Shot chart'], ['team', 'Team stats'], ['plays', 'Play-by-play'], ['lead', 'Leaders']].map(([k, t]) => `<button role="tab" data-gtab="${k}" aria-selected="${tab === k}">${t}</button>`).join('')}
      </div><div class="pane" id="gpane"></div></div>`;
    }
    sheet.body.innerHTML = `<div class="g-layout"><div class="g-side">${side}</div><div class="g-main">${main}</div></div>`;
    clipCard = wireClips(sheet.body, clips, clipCard);
    sheet.body.scrollTop = prevScroll;
    wireDrag(sheet.body);
    requestAnimationFrame(() => requestAnimationFrame(() => $$('.g-side [data-w], .g-main > .card [data-w]', sheet.body).forEach(i => { if (!i.closest('#gpane')) i.style.width = i.dataset.w + '%'; })));

    const renderPane = () => {
      const pane = $('#gpane', sheet.body); if (!pane) return;
      if (tab === 'box' && focusPid && !focusDone) { const T = (d.boxscore?.players || []).find(t => (t.statistics?.[0]?.athletes || []).some(a => String(a.athlete?.id) === focusPid)); const i = T ? sides.findIndex(s => String(s.id) === String(T.team?.id)) : -1; if (i >= 0) boxSide = i; }
      if (tab === 'box') pane.innerHTML = boxScore(d, sides, boxSide);
      if (tab === 'box' && focusPid) { const row = $(`tr[data-player="${focusPid}"]`, pane); if (row) { row.classList.add('focus'); if (!focusDone) { focusDone = true; requestAnimationFrame(() => row.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' })); } } }
      if (tab === 'shots') pane.innerHTML = shotChart(d, sides, shotF);
      if (tab === 'court') { if (!pane.firstChild) pane.innerHTML = '<div class="sk" style="height:420px;border-radius:12px"></div>'; lazy('chalk').then(m => { if (pane.isConnected && tab === 'court') m.drawChalk(pane, d, sides, id, live); }).catch(() => { pane.innerHTML = '<div class="empty" style="border:0"><b>The court didn\'t load</b></div>'; }); }
      if (tab === 'team') pane.innerHTML = teamCompare(d, sides);
      if (tab === 'plays') pane.innerHTML = playsList(d, sides, lastPlayId, plF);
      if (tab === 'lead') pane.innerHTML = gameLeaders(d);
      wireDrag(pane);
      requestAnimationFrame(() => requestAnimationFrame(() => $$('[data-w]', pane).forEach(i => i.style.width = i.dataset.w + '%')));
      $$('.seg', pane).forEach(placeKnob);
    };
    sheet.body.onclick = e => {
      const cp = e.target.closest('[data-clipplay]');
      if (cp) { const card = cp.closest('.clips'); playClip(card, +$('.clip-v', card).dataset.i || 0); return; }
      const ct = e.target.closest('[data-clip]');
      if (ct) { playClip(ct.closest('.clips'), +ct.dataset.clip); return; }
      const pf = e.target.closest('[data-pk],[data-pt],[data-pp],[data-pmore]');
      if (pf) {
        if (pf.dataset.pk) plF.kind = pf.dataset.pk;
        if (pf.dataset.pt) plF.team = pf.dataset.pt;
        if (pf.dataset.pp) plF.per = pf.dataset.pp;
        if ('pmore' in pf.dataset) plF.n += 200; else plF.n = 120;
        const keepX = $('.pl-row.hs', sheet.body)?.scrollLeft || 0;
        renderPane();
        const r = $('.pl-row.hs', sheet.body); if (r) r.scrollLeft = keepX;
        return;
      }
      const t = e.target.closest('[data-gtab]');
      if (t) { tab = t.dataset.gtab; $$('[data-gtab]', sheet.body).forEach(b => b.setAttribute('aria-selected', b === t)); const pn = $('#gpane', sheet.body); pn.classList.remove('anim'); void pn.offsetWidth; pn.classList.add('anim'); renderPane(); return; }
      const b = e.target.closest('[data-bside]');
      if (b) { boxSide = +b.dataset.bside; renderPane(); }
      const sh = e.target.closest('[data-shteam]');
      if (sh) { shotF.team = sh.dataset.shteam; shotF.pid = ''; renderPane(); }
      if (e.target.closest('[data-close-retry]')) closeTop();
    };
    sheet.body.onchange = e => { const sel = e.target.closest('[data-shplayer]'); if (sel) { shotF.pid = sel.value; renderPane(); } };
    renderPane();
    sheet.body.scrollTop = prevScroll;
    if (!sheet._adv) { sheet._adv = true; const onAdv = () => { if (!sheet.alive) { document.removeEventListener('fcadv', onAdv); return; } if (tab === 'box' || tab === 'team') sheet._render?.(); }; document.addEventListener('fcadv', onAdv); }
    sheet._render = renderPane;
    const plays = d.plays || [];
    lastPlayId = plays.at(-1)?.id || lastPlayId;
    first = false;
    if (live) sheet.timers.push(setTimeout(load, 15000));
    else if (pre && new Date(g.date) - Date.now() < 60 * 60e3) sheet.timers.push(setTimeout(load, 60000));
  };
  load();
}

function boxScore(d, sides, bi) {
  const teams = d.boxscore?.players || [];
  if (!teams.length) return `<div class="empty" style="border:0"><b>No box score yet</b>Stats appear once the game tips off.</div>`;
  const side = sides[bi];
  const T = teams.find(t => t.team?.id === side.id) || teams[bi];
  const st0 = T.statistics?.[0];
  if (!st0) return '';
  const st = advOn ? { ...st0, ...advBox(st0, st0.labels || st0.names) } : st0;
  const labels = st.labels || st.names;
  const ptsIdx = labels.indexOf('PTS');
  const shotIdx = new Set(['FG', '3PT', 'FT'].map(l => labels.indexOf(l)).filter(i => i >= 0));
  // "12-21" -> 12/21 with 57.1% underneath
  const shot = v => {
    const m = /^(\d+)-(\d+)$/.exec(String(v).trim());
    if (!m) return esc(v);
    const made = +m[1], att = +m[2];
    return `<span class="shot"><b>${made}/${att}</b><small>${att ? (made / att * 100).toFixed(1) + '%' : '–'}</small></span>`;
  };
  const cellOf = (v, i) => shotIdx.has(i) ? shot(v) : esc(v);
  // Column order: shooting splits (FG, 3PT, FT) move to sit right after BLK
  const order = (() => {
    const rest = labels.map((_, i) => i).filter(i => !shotIdx.has(i));
    const shots = [...shotIdx].sort((a, b) => a - b);
    const at = rest.indexOf(labels.indexOf('BLK'));
    return at < 0 ? [...rest, ...shots] : [...rest.slice(0, at + 1), ...shots, ...rest.slice(at + 1)];
  })();
  const cols = arr => order.map(i => [arr[i], i]);
  const ath = st.athletes || [];
  const injured = injuriesFor(d, side.id).map(normInjury);
  const injById = new Map(injured.filter(n => n.id).map(n => [n.id, n]));
  const row = a => {
    rememberPlayer(a.athlete, side.id);
    const dnp = a.didNotPlay || !a.stats?.length;
    const inj = dnp && injById.get(a.athlete.id);
    if (inj) return `<tr class="dnp inj-row" data-player="${a.athlete.id}" style="cursor:pointer">
      <td><span class="pl">${face(a.athlete.id, a.athlete.displayName, '', 80)}<b>${esc(a.athlete.shortName || a.athlete.displayName)}</b>${a.athlete.jersey ? `<span class="jno">#${esc(a.athlete.jersey)}</span>` : ''}<span>${esc(a.athlete.position?.abbreviation || '')}</span></span><div class="inj-line inj-red">${injuryText(inj)}</div></td>
      <td colspan="${labels.length}"></td></tr>`;
    return `<tr class="${dnp ? 'dnp' : ''}" data-player="${a.athlete.id}" style="cursor:pointer">
      <td><span class="pl">${face(a.athlete.id, a.athlete.displayName, '', 80)}<b>${esc(a.athlete.shortName || a.athlete.displayName)}</b>${a.athlete.jersey ? `<span class="jno">#${esc(a.athlete.jersey)}</span>` : ''}<span>${esc(a.athlete.position?.abbreviation || '')}</span>${dnp || !d.header?.id ? '' : `<button class="pl-sh" data-pgshare="${esc(d.header.id)}:${esc(a.athlete.id)}" title="Share ${esc(a.athlete.shortName || a.athlete.displayName)}'s stat line as an image" aria-label="Share stat line">${SHARE_ICON}</button>`}</span></td>
      ${dnp ? `<td colspan="${labels.length}" style="text-align:left">${esc((a.reason || 'DNP').toLowerCase().replace(/^\w/, c => c.toUpperCase()))}</td>` : cols(a.stats).map(([v, i]) => `<td class="${i === ptsIdx ? 'pts' : ''}${shotIdx.has(i) ? ' sc' : ''}">${cellOf(v, i)}</td>`).join('')}
    </tr>`;
  };
  // Live games: who's on the floor right now first (ESPN flags the current five as "active"), then the bench by minutes.
  // Before and after games: the usual starters / bench.
  const live = d.header?.competitions?.[0]?.status?.type?.state === 'in';
  const onCourt = live ? ath.filter(a => a.active && !a.didNotPlay && a.stats?.length) : [];
  const minsOf = a => parseFloat(a.stats?.[labels.indexOf('MIN')]) || 0;
  const played = a => !(a.didNotPlay || !a.stats?.length);
  let groups;
  if (live && onCourt.length >= 1 && onCourt.length <= 5) {
    const rest = ath.filter(a => !onCourt.includes(a));
    groups = [
      ['<span class="dot on"></span> On the court', onCourt, 'oncourt'],
      ['Bench', [...rest.filter(played).sort((x, y) => minsOf(y) - minsOf(x)), ...rest.filter(a => !played(a))], ''],
    ];
  } else {
    groups = [['Starters', ath.filter(a => a.starter), ''], ['Bench', ath.filter(a => !a.starter), '']];
  }
  // injured players who didn't play get their own section instead of sitting in the bench list
  const isInj = a => (a.didNotPlay || !a.stats?.length) && injById.has(a.athlete.id);
  const boxInj = ath.filter(isInj);
  groups = groups.map(([t, list, c]) => [t, list.filter(a => !isInj(a)), c]).filter(([, list]) => list.length);
  const inBox = new Set(ath.map(a => a.athlete.id));
  const extraInj = injured.filter(n => !n.id || !inBox.has(n.id));
  const injRows = boxInj.length || extraInj.length ? `<tr class="sub inj-h"><td colspan="${labels.length + 1}">Injured</td></tr>` + boxInj.map(row).join('') + extraInj.map(n => `<tr class="dnp inj-row" ${n.id ? `data-player="${n.id}" style="cursor:pointer"` : ''}>
      <td><span class="pl">${face(n.id, n.name, '', 80)}<b>${esc(n.short || n.name)}</b>${n.jersey ? `<span class="jno">#${esc(n.jersey)}</span>` : ''}<span>${esc(n.pos)}</span></span><div class="inj-line inj-red">${injuryText(n)}</div></td>
      <td colspan="${labels.length}"></td></tr>`).join('') : '';
  return `<div class="card-h"><div class="seg"><span class="knob"></span>${sides.map((s, i) => `<button data-bside="${i}" aria-pressed="${i === bi}">${esc(s.abbr)}</button>`).join('')}</div>${advBtn()}</div>${advOn ? `<p class="adv-note">${ADV_HELP}</p>` : ''}
  <div class="box-wrap drag-x" data-drag><table class="box${advOn ? ' adv' : ''}">
    <thead><tr><th>Player</th>${cols(labels).map(([l, i]) => `<th class="${shotIdx.has(i) ? 'sc' : ''}">${esc(l)}</th>`).join('')}</tr></thead>
    <tbody>
      ${groups.map(([title, list, cls]) => `<tr class="sub ${cls}"><td colspan="${labels.length + 1}">${title}</td></tr>${list.map(a => cls ? row(a).replace('<tr class="', '<tr class="on-court ') : row(a)).join('')}`).join('')}
      ${st.totals?.length ? `<tr class="tot"><td>Team</td>${cols(st.totals).map(([v, i]) => `<td class="${shotIdx.has(i) ? 'sc' : ''}">${cellOf(v, i)}</td>`).join('')}</tr>` : ''}
      ${injRows}
    </tbody></table></div>`;
}

function teamCompare(d, sides) {
  const bt = d.boxscore?.teams || [];
  if (bt.length < 2) return `<div class="empty" style="border:0"><b>No team stats yet</b></div>`;
  const A = bt.find(t => t.team?.id === sides[0].id) || bt[0], H = bt.find(t => t.team?.id === sides[1].id) || bt[1];
  const want = ['FG%', '3P%', 'FT%', 'Rebounds', 'Offensive Rebounds', 'Assists', 'Steals', 'Blocks', 'Turnovers', 'Points in Paint', 'Fast Break Points', 'Largest Lead', 'Lead Changes', 'Fouls'];
  const get = (T, lab) => T.statistics?.find(s => s.label === lab || s.abbreviation === lab || s.name === lab);
  const labs = want.filter(l => get(A, l) && get(H, l));
  const ac = teamColor(sides[0].id), hc = teamColor(sides[1].id);
  const inverse = l => /turnover|foul/i.test(l);
  const ad = advOn ? advTeams(d, sides) : null;
  const ADV_T = [['ortg', 'Offensive rating', 1], ['drtg', 'Defensive rating', -1], ['net', 'Net rating', 1], ['pace', `Pace (possessions per ${GAME_MIN})`, 0], ['ts', 'True shooting %', 1], ['efg', 'Effective FG %', 1], ['tov', 'Turnover %', -1], ['orb', 'Offensive rebound %', 1], ['ftr', 'Free throw rate', 1]];
  const advRows = ad ? ADV_T.map(([k, l, dir]) => {
    const av = ad[0][k], hv = ad[1][k], m = Math.max(Math.abs(av), Math.abs(hv)) || 1;
    const aw = dir > 0 ? av > hv : dir < 0 ? av < hv : false, hw = dir > 0 ? hv > av : dir < 0 ? hv < av : false;
    return `<div class="cmp-row"><span class="l" style="${aw || !dir ? '' : 'color:var(--muted)'}">${advNum(av)}</span>
      <div class="mid"><span>${esc(l)}</span><div class="cmp-bars"><div><i data-w="${Math.abs(av) / m * 100}" style="background:${ac}"></i></div><div><i data-w="${Math.abs(hv) / m * 100}" style="background:${hc}"></i></div></div></div>
      <span class="r" style="${hw || !dir ? '' : 'color:var(--muted)'}">${advNum(hv)}</span></div>`;
  }).join('') : '';
  return `<div class="card-h" style="justify-content:flex-end">${advBtn()}</div><div class="cmp">
    <div class="cmp-row"><span class="l">${esc(sides[0].abbr)}</span><span></span><span class="r">${esc(sides[1].abbr)}</span></div>
    ${ad ? `<div class="cmp-sec">Advanced · per 100 possessions</div>${advRows}<div class="cmp-sec">Box score</div>` : ''}
    ${labs.map(l => {
      const a = get(A, l).displayValue, h = get(H, l).displayValue;
      const av = parseFloat(a) || 0, hv = parseFloat(h) || 0, m = Math.max(av, hv) || 1;
      const aw = inverse(l) ? av < hv : av > hv, hw = inverse(l) ? hv < av : hv > av;
      return `<div class="cmp-row"><span class="l" style="${aw ? '' : 'color:var(--muted)'}">${esc(a)}</span>
        <div class="mid"><span>${esc(l)}</span><div class="cmp-bars"><div><i data-w="${av / m * 100}" style="background:${ac}"></i></div><div><i data-w="${hv / m * 100}" style="background:${hc}"></i></div></div></div>
        <span class="r" style="${hw ? '' : 'color:var(--muted)'}">${esc(h)}</span></div>`;
    }).join('')}
  </div>`;
}

function gameLeaders(d) {
  const L = d.leaders || [];
  if (!L.length) return `<div class="empty" style="border:0"><b>No leaders yet</b></div>`;
  return L.map(t => `<div style="margin-bottom:14px"><div class="eyebrow" style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${logo(t.team?.abbreviation, 32)}${esc(t.team?.displayName || '')}</div>
    <div class="tleaders">${(t.leaders || []).slice(0, 4).map(c => {
      const x = c.leaders?.[0]; if (!x?.athlete) return '';
      rememberPlayer(x.athlete, t.team?.id);
      return `<button class="tl" data-player="${x.athlete.id}">${face(x.athlete.id, x.athlete.displayName, 'f', 120)}<div><b>${esc(x.athlete.displayName)}</b><span>${esc(c.displayName)} · <strong style="color:var(--ink)">${esc(x.displayValue)}</strong></span></div></button>`;
    }).join('')}</div></div>`).join('');
}

// Prefer the summary's pickcenter; fall back to the line we already have from the scoreboard
function gameOdds(d, id) {
  const pc = (d.pickcenter || []).slice().sort((a, b) => (a.provider?.priority ?? 9) - (b.provider?.priority ?? 9))[0];
  return parseOdds(pc) || S.games.find(x => x.id === (id || d.header?.id))?.odds || null;
}
function preGame(d, sides, g) {
  const tv = [...new Set((d.broadcasts || []).flatMap(b => [b.media?.shortName || b.station || '']).filter(Boolean))].join(' · ');
  const ss = d.seasonseries?.[0]?.summary;
  let html = `<div class="card"><div class="card-h"><h4>Game info</h4></div><div class="facts">
    <div class="fact"><span>Tip-off</span><b>${esc(fmtLocal(g.date, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ' + TZ_AB)}</b></div>
    ${d.gameInfo?.venue?.fullName ? `<div class="fact"><span>Arena</span><b>${esc(d.gameInfo.venue.fullName)}</b></div>` : ''}
    ${ss ? `<div class="fact"><span>Season series</span><b>${esc(ss)}</b></div>` : ''}
    ${d.gameInfo?.officials?.length ? `<div class="fact"><span>Officials</span><b>${esc(d.gameInfo.officials.map(o => o.displayName || o.fullName).join(', '))}</b></div>` : ''}
  </div></div>`;
  html += oddsCard(gameOdds(d), sides);
  html += statEdges(d, sides);
  if (d.leaders?.length) html += `<div class="card"><div class="card-h"><h4>Season leaders</h4></div>${gameLeaders(d)}</div>`;
  const inj = (d.injuries || []).flatMap(t => (t.injuries || []).map(i => ({ t: t.team, n: normInjury(i) })));
  if (inj.length) html += `<div class="card"><div class="card-h"><h4>Injury report</h4><span class="eyebrow">${plural(inj.length, 'player')}</span></div>${inj.map(({ t, n }) => `
    <button class="inj" ${n.id ? `data-player="${n.id}"` : ''}>${logo(t?.abbreviation, 32)}<b style="flex:1;min-width:0;text-align:left">${esc(n.name)}</b><span class="inj-red">${injuryText(n)}</span></button>`).join('')}</div>`;
  return html;
}


/* ================= injuries ================= */
const capFirst = v => { const t = String(v || '').trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
const unspecified = v => !v || /not specified|unknown|^other$/i.test(String(v));
// one injury entry -> { id, name, pos, status, what: "Left knee injury", detail, ret, note }
function normInjury(i) {
  const a = i.athlete || {}, d = i.details || {};
  let part = !unspecified(d.type) ? d.type : !unspecified(d.location) ? d.location : '';
  if (!part) { const m = String(i.shortComment || i.longComment || '').match(/\(([^)]{2,30})\)/); if (m && !/\d/.test(m[1])) part = m[1]; }
  const side = !unspecified(d.side) ? String(d.side).toLowerCase() : '';
  const nonInjury = /illness|sick|rest|personal|suspen|conditioning|g league|two-way|coach|not injury|load management|birth|family|concussion protocol/i.test(String(part));
  const what = !part ? 'Injury' : nonInjury ? capFirst(String(part).toLowerCase()) : capFirst(`${side ? side + ' ' : ''}${String(part).toLowerCase()} injury`);
  const detail = !unspecified(d.detail) ? String(d.detail).toLowerCase() : '';
  const status = capFirst(i.status || i.type?.description || d.fantasyStatus?.description || 'Out');
  const id = a.id || String(a.links?.[0]?.href || '').match(/\/id\/(\d+)/)?.[1] || String(a.headshot?.href || '').match(/\/(\d+)\.png/)?.[1] || '';
  return { id, jersey: a.jersey || '', name: a.displayName || a.fullName || '', short: a.shortName || a.displayName || '', pos: a.position?.abbreviation || '', status, what, detail, ret: d.returnDate || '', note: i.shortComment || i.longComment || '', date: i.date || '' };
}
const injuryText = n => `<b>${esc(n.status)}</b> · ${esc(n.what)}${n.detail && !n.what.toLowerCase().includes(n.detail) ? ` (${esc(n.detail)})` : ''}`;
const injuriesFor = (d, teamId) => ((d?.injuries || []).find(t => t.team?.id === teamId || t.id === teamId)?.injuries || []);
let injAllPromise = null, injAllAt = 0;
function leagueInjuries() {
  if (!injAllPromise || Date.now() - injAllAt > 5 * 60e3) {
    injAllAt = Date.now();
    injAllPromise = getJSON(`${API}/injuries`, { retries: 0, timeout: 10000 }).catch(() => null);
  }
  return injAllPromise;
}
// team injury report: league feed -> team's next (or last) game feed -> roster flags
async function teamInjuries(id, name, evs, athletes) {
  const all = await leagueInjuries();
  const entry = (all?.injuries || all?.teams || []).find(e => e.id === id || e.team?.id === id || e.displayName === name || e.team?.displayName === name);
  if (entry) return { list: (entry.injuries || []).map(normInjury), src: 'league' };
  if (Array.isArray(all?.injuries) && all.injuries.length) return { list: [], src: 'league' }; // team isn't on the league report: nobody hurt
  const g = evs.find(e => e.state !== 'post') || evs.filter(e => e.state === 'post').at(-1);
  if (g) {
    try { const d = await getJSON(`${API}/summary?event=${g.id}`); const l = injuriesFor(d, id); if (l.length || d.injuries) return { list: l.map(normInjury), src: 'game' }; } catch (e) {}
  }
  return { list: athletes.filter(a => a.injuries?.length).map(a => normInjury({ ...a.injuries[0], athlete: a })), src: 'roster' };
}
function irCardHTML(list) {
  const order = s => /^out/i.test(s) ? 0 : /doubt/i.test(s) ? 1 : /question/i.test(s) ? 2 : /day/i.test(s) ? 3 : 4;
  const rows = [...list].sort((a, b) => order(a.status) - order(b.status) || a.name.localeCompare(b.name));
  return `<div class="card-h"><h4>Injury report</h4><span class="eyebrow">${rows.length ? plural(rows.length, 'player') : 'All clear'}</span></div>
    ${rows.length ? rows.map(n => `<button class="ir-row" ${n.id ? `data-player="${n.id}"` : ''}>
        ${face(n.id, n.name, 'ir-face', 120)}
        <span class="nm"><b>${esc(n.name)}</b><small>${esc([n.pos, n.ret ? 'Est. return ' + (/^\d{4}-\d{2}-\d{2}$/.test(n.ret) ? fmtDay(n.ret.replace(/-/g, ''), { month: 'short', day: 'numeric' }) : fmtShortDate(n.ret)) : ''].filter(Boolean).join(' · '))}</small></span>
        <span class="inj-red ir-st">${injuryText(n)}</span>
        ${n.note ? `<span class="ir-note">${esc(n.note.length > 180 ? n.note.slice(0, 177) + '…' : n.note)}</span>` : ''}
      </button>`).join('') : '<p class="ir-clear">No injuries reported. Everyone is available.</p>'}`;
}

/* ================= team flyout ================= */
async function openTeam(id) {
  const meta = S.teams[id] || {};
  const sheet = openSheet(meta.name || 'Team');
  let roster, sched;
  try {
    [roster, sched] = await Promise.all([
      getJSON(`${API}/teams/${id}/roster`),
      getJSON(`${API}/teams/${id}/schedule`).catch(() => null),
      loadStandings().catch(() => null),
    ]);
  } catch (e) {
    if (sheet.alive) sheet.body.innerHTML = `<div class="empty"><b>Team details didn't load</b>Close this panel and try again in a moment.</div>`;
    return;
  }
  if (!sheet.alive) return;
  const t = roster.team || {};
  regTeam({ ...t, shortDisplayName: t.name });
  const tm = S.teams[id];
  setTitle(sheet, tm.name);
  const row = S.standings?.confs.flatMap(c => c.rows).find(r => r.id === id);
  const tc = teamColor(id);

  const evs = (sched?.events || []).map(e => {
    const c = e.competitions?.[0]; if (!c) return null;
    const me = c.competitors.find(x => x.team?.id === id), op = c.competitors.find(x => x.team?.id !== id);
    if (!me || !op) return null;
    const sc = x => x.score?.displayValue ?? x.score ?? '';
    return { id: e.id, date: e.date, state: c.status?.type?.state, home: me.homeAway === 'home', op: op.team, win: me.winner, my: sc(me), their: sc(op) };
  }).filter(Boolean);
  const nextIdx = evs.findIndex(e => e.state !== 'post');
  const startIdx = Math.max(0, (nextIdx < 0 ? evs.length : nextIdx) - 6);
  const strip = evs.slice(startIdx, startIdx + 16);

  const athletes = roster.athletes || [];
  athletes.forEach(a => rememberPlayer(a, id, { bio: a }));

  sheet.body.innerHTML = `
    <div class="th-band enter" style="--tc:${tc}">
      ${favBtnHTML(id)}
      ${logo(tm.abbr, 380, 'lg big')}
      ${logo(tm.abbr, 108, 'lg small')}
      <p>${esc(t.standingSummary || (row ? (IS_C ? `${S.teams[id]?.confShort || ''}` : `${ordinal(row.seed)} in the ${row.conf ? 'West' : 'East'}`) : ''))}</p>
      <h2 class="h-display">${esc(tm.name)}</h2>
      <p>${esc(t.recordSummary || (row ? `${row.w}-${row.l}` : ''))}${roster.coach?.[0] ? ` · Head coach ${IS_C ? `${esc(roster.coach[0].firstName)} ${esc(roster.coach[0].lastName)}` : `<button class="th-coach" data-coach="${esc(tm.abbr)}" data-coachteam="${esc(id)}" title="Coach and front office">${esc(roster.coach[0].firstName)} ${esc(roster.coach[0].lastName)}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg></button>`}` : ''}</p>
    </div>
    ${row ? `<div class="statline">
      ${(IS_C
        ? [['Record', `${row.w}-${row.l}`], [S.teams[id]?.confShort || 'Conf', row.conf], ['AP rank', S.apRank?.get(String(id)) ? '#' + S.apRank.get(String(id)) : 'NR'], ['PPG', row.ppg], ['Opp PPG', row.opp], ['Diff', (row.diff > 0 && !String(row.diffD).startsWith('+') ? '+' : '') + row.diffD], ['Home', row.home], ['Away', row.road], ['vs AP', row.vsAP], ['Streak', row.strk]]
        : [['Record', `${row.w}-${row.l}`], ['Seed', ordinal(row.seed)], ['GB', row.gb], ['PPG', row.ppg], ['Opp PPG', row.opp], ['Diff', (row.diff > 0 && !String(row.diffD).startsWith('+') ? '+' : '') + row.diffD], ['Home', row.home], ['Away', row.road], ['Last 10', row.l10], ['Streak', row.strk]])
        .map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}
    </div>` : ''}
    ${!IS_C && row ? `<div class="th-odds" id="tho-${id}" hidden></div>` : ''}
    <div class="card ir-card" id="ir-${id}"><div class="card-h"><h4>Injury report</h4></div><div class="sk" style="height:56px;border-radius:10px"></div></div>
    ${strip.length ? `<div><div class="card-h"><h4 class="h-display" style="font-size:18px;margin:0">Schedule</h4><span class="eyebrow">Drag for more</span></div>
      <div class="hs-wrap"><div class="hs sched drag-x" data-drag>
      ${strip.map((e, i) => `<button class="sg${startIdx + i === nextIdx ? ' next' : ''}" data-game="${e.id}">
        <span class="d">${esc(fmtShortDate(e.date))}${startIdx + i === nextIdx ? ' · Next' : ''}</span>
        <span class="o">${e.home ? 'vs' : '@'} ${logo(e.op.abbreviation, 44)} ${esc(e.op.abbreviation)}</span>
        <span class="r">${e.state === 'post' ? `<span class="${e.win ? 'W' : 'L'}">${e.win ? 'W' : 'L'}</span> ${esc(e.my)}-${esc(e.their)}` : e.state === 'in' ? '<span style="color:var(--live);font-weight:700">Live now</span>' : esc(fmtTime(e.date))}</span>
      </button>`).join('')}
      </div></div></div>` : ''}
    <div class="tx-wrap" id="tx-${id}"><div class="sk" style="height:260px"></div></div>
    ${evs.length ? `<div class="card cal" id="cal-${id}"></div>` : ''}
    <div>
      <div class="card-h"><h4 class="h-display" style="font-size:18px;margin:0">Roster</h4><span class="eyebrow">${athletes.length} players</span></div>
      <div class="roster">${athletes.map((a, i) => `
        <button class="rp enter" style="--i:${i};--tc:${tc}" data-player="${a.id}">
          <div class="ph"><span class="jn">${esc(a.jersey ?? '')}</span>${a.headshot?.href ? face(a.id, a.displayName, '', 350) : `<div class="avatar" style="position:absolute;inset:0;font-size:34px">${esc(initials(a.displayName))}</div>`}
          ${a.injuries?.length ? `<span class="badge">${esc(a.injuries[0].status || 'Injured')}</span>` : ''}</div>
          <div class="in"><b>${esc(a.displayName)}</b><span>${esc(a.position?.abbreviation || '')}${a.displayHeight ? ' · ' + esc(a.displayHeight) : ''}${a.age ? ' · ' + a.age + ' yrs' : ''}</span></div>
        </button>`).join('')}</div>
    </div>`;
  wireDrag(sheet.body);
  teamInjuries(id, tm.name, evs, athletes).then(({ list }) => {
    const box = sheet.alive && $(`#ir-${id}`, sheet.body);
    if (box) box.innerHTML = irCardHTML(list);
  }).catch(() => { const box = $(`#ir-${id}`, sheet.body); if (box) box.innerHTML = '<div class="card-h"><h4>Injury report</h4></div><p class="ir-clear">The injury report is unavailable right now.</p>'; });
  const s = $('.sg.next', sheet.body);
  if (s) { const r = s.parentElement; r.scrollLeft = s.offsetLeft - 12; }
  const txBox = $(`#tx-${id}`, sheet.body);
  if (txBox) fillTeamExtras(id, evs, txBox);
  // playoff odds from the season simulator, linking to the team's odds page
  const thoBox = $(`#tho-${id}`, sheet.body);
  if (thoBox) lazy('sim').then(m => m.teamOddsStrip(tm.abbr)).then(html => { if (html && sheet.alive) { thoBox.innerHTML = html; thoBox.hidden = false; } }).catch(() => {});
  const calBox = $(`#cal-${id}`, sheet.body);
  if (calBox) {
    const info = calInfo(evs);
    const months = [...new Set(info.map(e => e.ymd.slice(0, 6)))];
    const nx = info.find(e => e.state !== 'post') || info.at(-1);
    let ym = months.includes(S.today.slice(0, 6)) ? S.today.slice(0, 6) : nx.ymd.slice(0, 6);
    const draw = () => { calBox.innerHTML = calHTML(info, ym); };
    draw();
    calBox.addEventListener('click', e => {
      const b = e.target.closest('[data-calm]'); if (!b) return;
      const i = months.indexOf(ym) + +b.dataset.calm;
      if (months[i]) { ym = months[i]; draw(); }
    });
  }
}

/* ================= player flyout ================= */
async function openPlayer(id) {
  const p = S.players[id] || { id };
  const sheet = openSheet(p.name || 'Player');
  const [ov, bioRes] = await Promise.all([
    getJSON(`${WEB}/athletes/${id}/overview`).catch(() => null),
    getJSON(`${WEB}/athletes/${id}`).catch(() => null),
  ]);
  if (!sheet.alive) return;
  const bio = bioRes?.athlete || p.bio || {};
  const name = bio.displayName || p.name || 'Player';
  const teamId = bio.team?.id || p.teamId;
  if (bio.team) regTeam(bio.team);
  const tm = S.teams[teamId] || {};
  const tc = teamColor(teamId || tm.abbr);
  setTitle(sheet, name);

  const st = ov?.statistics;
  const labels = st?.labels || [];
  const reg = st?.splits?.find(s => /regular/i.test(s.displayName)) || st?.splits?.[0];
  const pick = l => { const i = labels.indexOf(l); return i >= 0 && reg ? reg.stats[i] : '–'; };
  const facts = [
    ['Height', bio.displayHeight], ['Weight', bio.displayWeight], ['Age', bio.age],
    ['Experience', bio.displayExperience || (bio.experience?.years != null ? (bio.experience.years ? `${bio.experience.years} yrs` : 'Rookie') : null)],
    ['College', bio.college?.name], ['Born', bio.displayBirthPlace || [bio.birthPlace?.city, bio.birthPlace?.state || bio.birthPlace?.country].filter(Boolean).join(', ')],
    ['Draft', bio.displayDraft],
  ].filter(([, v]) => v);

  const log = ov?.gameLog;
  const sAvg = reg ? { pts: parseFloat(pick('PTS')), reb: parseFloat(pick('REB')), ast: parseFloat(pick('AST')) } : null;
  if (sAvg) Object.keys(sAvg).forEach(k => { if (!Number.isFinite(sAvg[k])) delete sAvg[k]; });
  let glog = '';
  const glEvents = log?.statistics?.[0]?.events;
  if (glEvents?.length) {
    const gl = log.statistics[0];
    const lab = gl.labels || gl.names || [];
    glog = `<div class="card"><div class="card-h"><h4>Recent games</h4><span class="eyebrow">Tap for box score</span></div><div class="box-wrap drag-x" data-drag><table class="split-tbl">
      <thead><tr><th>Game</th>${lab.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead>
      <tbody>${glEvents.slice(0, 5).map(ev => {
        const meta = log.events?.[ev.eventId] || {};
        return `<tr data-game="${esc(ev.eventId)}" style="cursor:pointer"><td>${meta.gameDate ? esc(fmtShortDate(meta.gameDate)) + ' ' : ''}${esc(meta.atVs || '')} ${esc(meta.opponent?.abbreviation || '')} ${meta.gameResult ? `<span class="${meta.gameResult === 'W' ? 'strk-w' : 'strk-l'}">${esc(meta.gameResult)} ${esc(meta.score || '')}</span>` : ''}</td>${(ev.stats || []).map(v => `<td>${esc(v)}</td>`).join('')}</tr>`;
      }).join('')}</tbody></table></div></div>`;
  }

  sheet.body.innerHTML = `
    <div class="pl-hero enter" style="--tc:${tc}">
      ${watchBtnHTML(id, true)}
      <span class="jn">${esc(bio.jersey || p.jersey || '')}</span>
      ${face(id, name, 'face', 700)}
      <div class="txt">
        <div class="pl-who">
        <h2 class="h-display">${esc(bio.firstName || name.split(' ')[0])}<br>${esc(bio.lastName || name.split(' ').slice(1).join(' '))}</h2>
        <p class="pl-nick" hidden></p>
        <p>${tm.abbr ? logo(tm.abbr, 44) : ''}${esc(tm.name || '')}${bio.jersey || p.jersey ? ` · #${esc(bio.jersey || p.jersey)}` : ''}${bio.position?.displayName || bio.position?.abbreviation || p.pos ? ` · ${esc(bio.position?.displayName || bio.position?.abbreviation || p.pos)}` : ''}</p>
        </div>
        ${facts.length ? `<dl class="pl-facts">${facts.map(([k, v]) => `<div${/College|Born|Draft/.test(k) ? ' class="w"' : ''}><dt>${esc(k)}</dt><dd title="${esc(v)}">${esc(v)}</dd></div>`).join('')}</dl>` : ''}
      </div>
    </div>
    ${reg ? `<div class="big3">${[['PTS', 'PTS'], ['REB', 'REB'], ['AST', 'AST']].map(([k, l]) => `<div><span>${l}<em> · ${esc(reg.displayName.replace('Regular Season', 'Season'))}</em></span><b>${esc(pick(k))}</b></div>`).join('')}</div>` : ''}
    ${st?.splits?.length ? `<div class="card"><div class="card-h"><h4>Averages</h4><span class="eyebrow">Per game</span></div><div class="box-wrap drag-x" data-drag><table class="split-tbl">
      <thead><tr><th></th>${labels.map(l => `<th>${esc(l)}</th>`).join('')}</tr></thead>
      <tbody>${st.splits.map(s => `<tr><td><b>${esc(s.displayName)}</b></td>${s.stats.map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div></div>` : `<div class="empty"><b>No stats yet this season</b></div>`}
    <div class="pl-trends" id="plTrend-${id}"><div class="sk" style="height:250px"></div></div>
    ${glog}
    <section class="card career" data-fill="log">
      <button class="career-h" data-careertoggle aria-expanded="true" title="Minimize"><span><b>Season game log</b><small>Every game this season</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="career-b"><div class="career-in"></div></div>
    </section>
    <section class="card career" data-fill="career" data-career="${id}">
      <button class="career-h" data-careertoggle aria-expanded="true" title="Minimize"><span><b>Career stats</b><small>Season by season</small></span><svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg></button>
      <div class="career-b"><div class="career-in"></div></div>
    </section>
    <div class="splits-slot"></div>
    <div class="btn-row">${teamId ? `<button class="btn" data-team="${teamId}">View ${esc(tm.short || 'team')} roster</button>` : ''}<button class="btn ghost" data-cmpwith="${id}">Compare with another player</button></div>`;
  loadNicks().then(N => { const x = N.by[id], el = $('.pl-nick', sheet.body); if (x && el) { el.innerHTML = nickLine(x.nick, 3); el.hidden = false; } });
  wireDrag(sheet.body);
  S.watchInfo = S.watchInfo || {};
  S.watchInfo[id] = { id, name, short: p.short || (bio.shortName) || name, teamId, abbr: tm.abbr || '', pts: reg ? pick('PTS') : '', reb: reg ? pick('REB') : '', ast: reg ? pick('AST') : '' };
  const tb = $(`#plTrend-${id}`, sheet.body);
  if (tb) playerTrends(id, tb, sAvg);
  // game log + career start open (and load right away); tap the header to minimize
  $$('.career', sheet.body).forEach(car => {
    const tg = $('[data-careertoggle]', car);
    const set = open => {
      car.classList.toggle('open', open); tg.setAttribute('aria-expanded', open);
      if (open && !car._loaded) { car._loaded = true; $('.career-in', car).innerHTML = '<div class="sk" style="height:220px"></div>'; (car.dataset.fill === 'log' ? fillLog : fillCareer)(car, id); }
    };
    tg.addEventListener('click', () => set(!car.classList.contains('open')));
    set(true);
  });
  // every other card gets a minimize button too (cards that fill in later included)
  addMinimize(sheet.body);
  new MutationObserver(() => addMinimize(sheet.body)).observe(sheet.body, { childList: true, subtree: true });
  if (reg) addShareBtn(sheet, () => sharePlayer({
    id, name, first: bio.firstName || name.split(' ')[0], last: bio.lastName || name.split(' ').slice(1).join(' '),
    jersey: bio.jersey || p.jersey, pos: bio.position?.abbreviation || p.pos, abbr: tm.abbr, teamId,
    season: reg.displayName.replace('Regular Season', 'Season'),
    stats: [['PTS', pick('PTS')], ['REB', pick('REB')], ['AST', pick('AST')], ['FG%', pick('FG%')], ['3P%', pick('3P%')]],
  }));
}

/* =====================================================================
   UPGRADES: favorite team, ticker, multi-view, shot chart, game flow,
   search, shortcuts, compare, playoff picture
   ===================================================================== */
const SEARCH_API = 'https://site.web.api.espn.com/apis/common/v3/search';
const isTyping = () => { const a = document.activeElement; return !!a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable); };
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const unlockIfIdle = () => {
  if (!document.querySelector('.sheet.open') && !$('#drawer')?.classList.contains('open') && $('#searchPop')?.hidden !== false && $('#helpPop')?.hidden !== false)
    document.documentElement.classList.remove('locked');
};
const teamByName = name => name ? Object.values(S.teams).find(t => t.name === name) : null;

/* ---------------- favorite team ---------------- */
let favId = lsGet(lsKey('fc-fav'));
const isFavGame = g => !!favId && (g.home.id === favId || g.away.id === favId);
function favBtnHTML(id) {
  const on = favId === id;
  return `<div class="fav-wrap" data-favwrap="${id}">${on ? alertBtnHTML() : ''}<button class="fav-btn${on ? ' on' : ''}" data-fav="${id}" aria-pressed="${on}">${on ? '★ Your team' : '☆ Make this my team'}</button></div>`;
}
function renderFavLink() {
  const t = favId && S.teams[favId];
  document.documentElement.classList.toggle('has-fav', !!favId);
  for (const el of [$('#favLink'), $('#drawerFav')]) {
    if (!el) continue;
    el.hidden = !t;
    if (!t) continue;
    el.dataset.team = favId;
    el.title = `Open ${t.name}`;
    el.innerHTML = el.id === 'favLink'
      ? `<span class="star">★</span>${logo(t.abbr, 40)}<span class="lbl">${esc(t.abbr)}</span>`
      : `<span class="star">★</span>${logo(t.abbr, 48)}<span>${esc(t.short || t.name)}</span>`;
  }
  isleSync();
}
function setFav(id) {
  favId = favId === id ? null : id;
  lsSet(lsKey('fc-fav'), favId);
  $$('[data-favwrap]').forEach(b => { b.outerHTML = favBtnHTML(b.dataset.favwrap); });
  renderFavLink();
  renderGames(false); renderTicker(); renderMini();
  if (S.view === 'standings') renderStandings();
  if (S.view === 'teams') renderTeams();
  toast(favId ? `${S.teams[favId]?.short || 'Team'} pinned as your team` : 'Favorite team removed');
}

/* ---------------- Isle ----------------
   Isle (github.com/larosa023/Isle) is a Dynamic Island for Windows. Fullcourt tells it your team and the games you
   send with "Show on Isle", through Isle's API on this PC (127.0.0.1:47820), and Isle shows them live at the top of
   the screen. On by default in the Windows app; on the website it's opt-in (Settings → Isle), because browsers ask
   before a website talks to apps on your PC. Nothing is sent anywhere else. */
var ISLE_API = 'http://127.0.0.1:47820', isleLast = '', isleSet = null;
function isleOn() { const v = lsGet('fc-isle'); return !IS_MINI && (v === '1' || (IS_APP && v !== '0')); }
function isleTracked() {
  if (!isleSet) { try { isleSet = new Set(JSON.parse(lsGet('fc-isle-track') || '[]')); } catch (e) { isleSet = new Set(); } }
  return isleSet;
}
function isleCall(path, body) {
  const opts = body === undefined ? { targetAddressSpace: 'loopback' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), targetAddressSpace: 'loopback' };
  return fetch(ISLE_API + path, opts).then(r => r.ok ? r.json() : null).catch(() => null);
}
// Your team for the current league. Only sends when it changed (or when forced from Settings).
function isleSync(force) {
  if (!isleOn()) return Promise.resolve(null);
  const t = favId && S.teams[favId];
  if (favId && !t) return Promise.resolve(null); // teams still loading; renderFavLink runs again when they arrive
  const body = { league: LGK, favorite: t ? { id: favId, abbr: t.abbr, name: t.short || t.name } : null, origin: IS_APP ? 'Fullcourt app' : location.host };
  const key = JSON.stringify(body);
  if (!force && key === isleLast) return Promise.resolve(null);
  isleLast = key;
  return isleCall('/v1/fullcourt/sync', body);
}
async function isleTrack(id, on) {
  const r = await isleCall('/v1/fullcourt/track', { league: LGK, game: String(id), on });
  if (!r) { toast("Couldn't reach Isle. Is it running on this PC?"); return false; }
  const set = isleTracked(), k = LGK + ':' + id;
  if (on) set.add(k); else set.delete(k);
  lsSet('fc-isle-track', set.size ? JSON.stringify([...set].slice(-40)) : null);
  toast(!on ? 'Stopped tracking on Isle' : r.sportsOn === false ? 'Sent to Isle, but live sports are turned off in Isle' : 'Tracking this game on Isle');
  return true;
}
const ISLE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3.5" width="14" height="6" rx="3"/><path d="M4 14h16M7 18h10"/></svg>';
// The "Show on Isle" button in a game's top bar (only when Isle is turned on).
function addIsleBtn(sheet, id) {
  if (!isleOn()) return;
  const bar = $('.sheet-bar', sheet.el); if (!bar || $('[data-isle]', bar)) return;
  const k = LGK + ':' + id, b = document.createElement('button');
  b.className = 'icon-btn isle-btn'; b.dataset.isle = ''; b.innerHTML = ISLE_ICON;
  const paint = () => { const on = isleTracked().has(k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.title = on ? 'Stop tracking on Isle' : 'Show on Isle'; b.setAttribute('aria-label', b.title); };
  paint();
  b.addEventListener('click', async e => {
    e.stopPropagation(); if (b.dataset.busy) return; b.dataset.busy = '1';
    try { if (await isleTrack(id, !isleTracked().has(k))) paint(); } finally { delete b.dataset.busy; }
  });
  bar.insertBefore(b, $('[data-share]', bar) || $('[data-expand]', bar));
  // Isle forgets games once they end; match what it actually tracks
  isleCall('/v1/fullcourt/track').then(list => {
    if (!Array.isArray(list)) return;
    const live = new Set(list.map(t => t.league + ':' + t.game)), set = isleTracked();
    for (const x of [...set]) if (!live.has(x)) set.delete(x);
    for (const x of live) set.add(x);
    lsSet('fc-isle-track', set.size ? JSON.stringify([...set]) : null);
    paint();
  });
}

/* ---------------- score ticker (desktop) ---------------- */
function refreshTicker() {
  if (innerWidth <= 760) return;
  if (S.date === S.today) { S.tickerGames = S.games; renderTicker(); return; }
  getJSON(`${API}/scoreboard?dates=${S.today}${SB_QS}`, { retries: 0 })
    .then(d => { S.tickerGames = (d.events || []).map(parseGame); renderTicker(); })
    .catch(() => {});
}
function tickerItem(g) {
  const live = g.state === 'in', pre = g.state === 'pre';
  const side = s => `<span class="tk-t${g.state === 'post' && !s.winner ? ' lose' : ''}">${logo(s.abbr, 32)}${esc(s.abbr)}${pre ? '' : `<b>${esc(s.score)}</b>`}</span>`;
  return `<button class="tk${live ? ' live' : ''}${isFavGame(g) ? ' fav' : ''}" data-game="${g.id}">
    <span class="tk-st">${live ? '<i class="dot on"></i>' : ''}${esc(pre ? fmtTime(g.date) : statusText(g))}${upsetOf(g) ? ' <em class="tk-up">Upset</em>' : ''}</span>${side(g.away)}${side(g.home)}</button>`;
}
function renderTicker() {
  const bar = $('#ticker'), tr = $('#tickerTrack');
  if (!bar || !tr) return;
  const games = S.tickerGames || [];
  if (!games.length) { bar.hidden = true; return; }
  bar.hidden = false;
  const rank = g => (isFavGame(g) ? 0 : 1) * 10 + (g.state === 'in' ? 0 : g.state === 'pre' ? 1 : 2);
  let list = [...games].sort((a, b) => rank(a) - rank(b) || new Date(a.date) - new Date(b.date));
  if (IS_C) { const top = list.filter(g => g.home.rank || g.away.rank || isFavGame(g)); list = (top.length ? top : list).slice(0, 30); }
  const keep = tr.scrollLeft;
  tr.innerHTML = `<span class="tk-group" id="tkA"><span class="tk-day">${S.date === S.today ? 'Tonight' : 'Today'}</span>${list.map(tickerItem).join('')}</span>`;
  const a = $('#tkA');
  if (a.offsetWidth > tr.clientWidth) {
    tr.insertAdjacentHTML('beforeend', `<span class="tk-group" aria-hidden="true" inert>${a.innerHTML}</span>`);
    tr.dataset.loop = '1';
  } else tr.dataset.loop = '';
  tr.scrollLeft = keep;
  dragScroll(tr);
  tr._fades?.(); tr._half = 0; // contents changed: re-measure on the next frame
}
(() => {
  const tr = $('#tickerTrack'); if (!tr) return;
  let hover = false, pos = 0;
  tr.addEventListener('pointerenter', () => hover = true);
  tr.addEventListener('pointerleave', () => hover = false);
  tr.addEventListener('focusin', () => hover = true);
  tr.addEventListener('focusout', () => hover = false);
  // the loop width is measured once per content change (not every frame: a per-frame measure forces a full
  // page layout, which made big pages like the Bet desk stutter), and the loop sleeps when the ticker is off screen
  let onScreen = true, wide = innerWidth > 760, last = 0;
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }).observe(tr);
  addEventListener('resize', () => { wide = innerWidth > 760; tr._half = 0; }, { passive: true });
  const step = t => {
    if (onScreen && wide && !hover && !reduced && !document.hidden && tr.dataset.loop && !tr.classList.contains('dragging')) {
      if (!tr._half) { const a = $('#tkA'); tr._half = a ? a.offsetWidth + (parseFloat(getComputedStyle(tr).columnGap) || 0) : 0; }
      const cur = tr.scrollLeft;
      if (Math.abs(cur - pos) > 2) pos = cur;
      pos += 0.45 * Math.min(3, last ? (t - last) / 16.7 : 1);
      if (tr._half && pos >= tr._half) pos -= tr._half;
      tr.scrollLeft = pos;
    } else pos = tr.scrollLeft;
    last = t;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
})();

/* ---------------- shot chart ---------------- */
const COURT = `<rect x="0" y="0" width="500" height="470" rx="6" fill="var(--court)"/>
<g fill="none" stroke="var(--court-line)" stroke-width="2">
  <rect x="1" y="1" width="498" height="468" rx="5"/>
  <rect x="170" y="1" width="160" height="189" fill="var(--court-paint)"/>
  <path d="M190 190 A60 60 0 0 0 310 190"/>
  <path d="M190 190 A60 60 0 0 1 310 190" stroke-dasharray="7 7"/>
  <path d="${IS_W ? 'M30 1 V78 A221.5 221.5 0 0 0 470 78 V1' : 'M30 1 V140 A237.5 237.5 0 0 0 470 140 V1'}"/>
  <path d="M210 52.5 A40 40 0 0 0 290 52.5"/>
  <line x1="220" y1="40" x2="280" y2="40" stroke-width="3"/>
  <circle cx="250" cy="52.5" r="7.5"/>
  <path d="M190 469 A60 60 0 0 1 310 469"/>
</g>`;
function getShots(d) {
  const names = {};
  (d.boxscore?.players || []).forEach(t => (t.statistics?.[0]?.athletes || []).forEach(a => { names[a.athlete.id] = a.athlete.shortName || a.athlete.displayName; }));
  return (d.plays || []).filter(p => p.shootingPlay && p.coordinate && p.coordinate.x >= -2 && p.coordinate.x <= 52 && p.coordinate.y > -5 && p.coordinate.y < 95 && !/free throw/i.test(p.type?.text || p.text || ''))
    .map(p => ({
      x: p.coordinate.x, y: p.coordinate.y, made: !!p.scoringPlay,
      three: p.pointsAttempted === 3 || /three point/i.test(p.text || ''),
      team: p.team?.id, pid: p.participants?.[0]?.athlete?.id, name: names[p.participants?.[0]?.athlete?.id] || '',
      text: p.text || '', per: p.period?.number, clock: p.clock?.displayValue || '',
    }));
}
const perLabel = n => n > REG_PERIODS ? (n === REG_PERIODS + 1 ? 'OT' : `${n - REG_PERIODS}OT`) : RULES.halves ? `H${n}` : `Q${n}`;
function shotChart(d, sides, f) {
  const all = getShots(d);
  if (!all.length) return `<div class="empty" style="border:0"><b>No shots yet</b>The chart fills in as shots go up.</div>`;
  let shots = all.filter(s => f.team === 'all' || s.team === f.team);
  const players = [...new Map(shots.filter(s => s.pid && s.name).map(s => [s.pid, s.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  if (f.pid && !players.some(([id]) => id === f.pid)) f.pid = '';
  if (f.pid) shots = shots.filter(s => s.pid === f.pid);
  const colorOf = tid => tid === sides[0].id ? 'var(--sideA)' : 'var(--sideB)';
  const zone = s => s.three ? 'three' : (Math.abs(s.x - 25) <= 8 && s.y + 4.25 <= 19 ? 'paint' : 'mid');
  const line = arr => { const m = arr.filter(s => s.made).length; return { m, a: arr.length, p: arr.length ? (m / arr.length * 100).toFixed(1) + '%' : '–' }; };
  const rows = [['All shots', shots], ['3-pointers', shots.filter(s => s.three)], ['In the paint', shots.filter(s => zone(s) === 'paint')], ['Mid-range', shots.filter(s => zone(s) === 'mid')]].map(([k, arr]) => [k, line(arr)]);
  const mark = s => {
    const px = Math.max(5, Math.min(495, s.x * 10)), py = Math.max(5, Math.min(462, (s.y + 4.25) * 10));
    const tip = `${s.name || 'Shot'} · ${s.made ? 'Made' : 'Missed'} ${s.three ? '3PT' : '2PT'} · ${perLabel(s.per)} ${s.clock}`;
    const c = colorOf(s.team);
    return s.made
      ? `<circle class="sm" cx="${px}" cy="${py}" r="6.5" fill="${c}" stroke="var(--court)" stroke-width="1.5"><title>${esc(tip)}</title></circle>`
      : `<g class="sm miss" transform="translate(${px} ${py})"><title>${esc(tip)}</title><circle r="7" fill="transparent"/><path d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/></g>`;
  };
  const sorted = [...shots.filter(s => !s.made), ...shots.filter(s => s.made)];
  const teamBtns = [['all', 'Both'], [sides[0].id, sides[0].abbr], [sides[1].id, sides[1].abbr]];
  return `<div class="shot-ctl">
      <div class="seg"><span class="knob"></span>${teamBtns.map(([k, t]) => `<button data-shteam="${k}" aria-pressed="${f.team === k}">${esc(t)}</button>`).join('')}</div>
      <label class="shot-sel"><span class="sr">Player</span><select id="shotPlayer" data-shplayer>
        <option value="">All players</option>${players.map(([id, n]) => `<option value="${id}"${f.pid === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}
      </select></label>
    </div>
    <div class="shot-wrap">
      <svg class="court" viewBox="0 0 500 470" role="img" aria-label="Shot chart, ${shots.length} shots">${COURT}<g class="marks">${sorted.map(mark).join('')}</g></svg>
      <div class="shot-side">
        <table class="shot-tbl"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td><b>${v.m}/${v.a}</b></td><td>${v.p}</td></tr>`).join('')}</tbody></table>
        <div class="shot-legend">
          <span><svg viewBox="-8 -8 16 16" width="14" height="14"><circle r="6" fill="var(--ink-2)"/></svg> Made</span>
          <span><svg viewBox="-8 -8 16 16" width="14" height="14"><path d="M-4.5 -4.5L4.5 4.5M4.5 -4.5L-4.5 4.5" stroke="var(--ink-2)" stroke-width="2.2" stroke-linecap="round"/></svg> Missed</span>
          ${f.team === 'all' ? `<span><i style="background:var(--sideA)"></i>${esc(sides[0].abbr)}</span><span><i style="background:var(--sideB)"></i>${esc(sides[1].abbr)}</span>` : ''}
        </div>
        <p class="odds-note">Hover a mark for the shooter and time. Free throws aren't shown.</p>
      </div>
    </div>`;
}

/* ---------------- game flow (scoring margin + runs) ---------------- */
const clockSecs = v => { const s = String(v ?? '0'); if (s.includes(':')) { const [m, x] = s.split(':'); return (+m) * 60 + (+x || 0); } return +s || 0; };
const QP = RULES.per, REG = RULES.per * REG_PERIODS, OTP = RULES.ot;
const elapsedAt = (per, clk) => { const c = clockSecs(clk); return per <= 4 ? (per - 1) * QP + (QP - c) : REG + (per - 5) * OTP + (OTP - c); };
function flowData(d) {
  let pa = 0, ph = 0, maxPer = REG_PERIODS;
  const pts = [[0, 0]], ev = [];
  for (const p of d.plays || []) {
    const a = Number(p.awayScore), h = Number(p.homeScore), per = p.period?.number || 1;
    maxPer = Math.max(maxPer, per);
    if (!Number.isFinite(a) || !Number.isFinite(h) || (a === pa && h === ph)) continue;
    const t = elapsedAt(per, p.clock?.displayValue);
    if (h > ph) ev.push({ t, team: 'home', pts: h - ph, per, clock: p.clock?.displayValue });
    if (a > pa) ev.push({ t, team: 'away', pts: a - pa, per, clock: p.clock?.displayValue });
    pts.push([t, h - a]); pa = a; ph = h;
  }
  const end = maxPer <= 4 ? REG : REG + (maxPer - 4) * OTP;
  return { pts, ev, end, maxPer };
}
function findRuns(ev) {
  const c = [];
  for (let i = 0; i < ev.length; i++) {
    const team = ev[i].team; let tp = 0, op = 0;
    for (let j = i; j < ev.length; j++) {
      if (ev[j].team === team) tp += ev[j].pts; else op += ev[j].pts;
      if (op > 2) break;
      if (ev[j].team === team && tp >= 8 && tp - op >= 8) c.push({ i, j, team, tp, op });
    }
  }
  c.sort((a, b) => (b.tp - b.op) - (a.tp - a.op) || (a.j - a.i) - (b.j - b.i));
  const out = [];
  for (const r of c) { if (out.some(u => !(r.j < u.i || r.i > u.j))) continue; out.push(r); if (out.length >= 4) break; }
  return out.sort((a, b) => a.i - b.i).map(r => ({ ...r, t0: ev[r.i].t, t1: ev[r.j].t, per0: ev[r.i].per, clk0: ev[r.i].clock, clk1: ev[r.j].clock, per1: ev[r.j].per }));
}
function flowCard(d, sides) {
  const { pts, ev, end, maxPer } = flowData(d);
  if (ev.length < 4) return '';
  const W = 600, H = 210, L = 10, R = 10, T = 26, B = 36;
  const maxAbs = Math.max(5, Math.ceil(Math.max(...pts.map(p => Math.abs(p[1]))) / 5) * 5);
  const x = t => L + (t / end) * (W - L - R), mid = T + (H - T - B) / 2, y = m => mid - (m / maxAbs) * ((H - T - B) / 2);
  let path = `M${x(0).toFixed(1)} ${y(0).toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) path += ` L${x(pts[i][0]).toFixed(1)} ${y(pts[i - 1][1]).toFixed(1)} L${x(pts[i][0]).toFixed(1)} ${y(pts[i][1]).toFixed(1)}`;
  const lastT = pts.at(-1)[0];
  const area = `${path} L${x(lastT).toFixed(1)} ${mid.toFixed(1)} L${x(0).toFixed(1)} ${mid.toFixed(1)} Z`;
  const runs = findRuns(ev);
  const n = (S.wpN = (S.wpN || 0) + 1);
  const qs = []; for (let p = 1; p < maxPer; p++) qs.push(p <= REG_PERIODS ? p * QP : REG + (p - REG_PERIODS) * OTP);
  const qLabels = Array.from({ length: maxPer }, (_, i) => { const a = i < REG_PERIODS ? i * QP : REG + (i - REG_PERIODS) * OTP, b = i < REG_PERIODS ? (i + 1) * QP : a + OTP; return `<text x="${x((a + b) / 2)}" y="${H - 6}" text-anchor="middle" class="ax">${perLabel(i + 1)}</text>`; }).join('');
  const abbr = t => t === 'home' ? sides[1].abbr : sides[0].abbr;
  let homeMax = 0, awayMax = 0, changes = 0, ties = 0, prevSign = 0;
  for (const [, m] of pts.slice(1)) {
    homeMax = Math.max(homeMax, m); awayMax = Math.max(awayMax, -m);
    const s = Math.sign(m);
    if (s === 0) ties++;
    else { if (prevSign && s !== prevSign) changes++; prevSign = s; }
  }
  return `<div class="card flow"><div class="card-h"><h4>Game flow</h4><span class="eyebrow">Scoring margin</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Scoring margin over the game">
      <defs>
        <clipPath id="fa${n}"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath>
        <clipPath id="fb${n}"><rect x="0" y="${mid}" width="${W}" height="${H - mid}"/></clipPath>
      </defs>
      ${runs.map(r => `<rect x="${x(r.t0) - 2}" y="${T - 4}" width="${Math.max(4, x(r.t1) - x(r.t0) + 4)}" height="${H - T - B + 8}" rx="3" fill="${r.team === 'home' ? 'var(--sideB)' : 'var(--sideA)'}" opacity=".12"/>
        <text x="${Math.min(W - 30, Math.max(30, (x(r.t0) + x(r.t1)) / 2))}" y="${r.team === 'home' ? T - 9 : H - B + 15}" text-anchor="middle" class="ax run">${esc(abbr(r.team))} ${r.tp}–${r.op}</text>`).join('')}
      ${qs.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}" stroke="var(--line)"/>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".7"/>
      <path d="${area}" fill="var(--sideB)" opacity=".28" clip-path="url(#fa${n})"/>
      <path d="${area}" fill="var(--sideA)" opacity=".28" clip-path="url(#fb${n})"/>
      <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${x(lastT)}" cy="${y(pts.at(-1)[1])}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
      <text x="${L + 4}" y="${T + 11}" class="ax">${esc(sides[1].abbr)} +${maxAbs}</text>
      <text x="${L + 4}" y="${H - B - 5}" class="ax">${esc(sides[0].abbr)} +${maxAbs}</text>
      ${qLabels}
    </svg>
    <div class="flow-facts">
      <span>Biggest lead <b>${esc(sides[1].abbr)} ${homeMax}</b> · <b>${esc(sides[0].abbr)} ${awayMax}</b></span>
      <span>Lead changes <b>${changes}</b></span><span>Times tied <b>${ties}</b></span>
    </div>
    ${runs.length ? `<div class="runs">${runs.map(r => `<div class="run"><i style="background:${r.team === 'home' ? 'var(--sideB)' : 'var(--sideA)'}"></i><b>${esc(abbr(r.team))} ${r.tp}–${r.op} run</b><span>${perLabel(r.per0)} ${esc(r.clk0)} → ${r.per1 !== r.per0 ? perLabel(r.per1) + ' ' : ''}${esc(r.clk1)}</span></div>`).join('')}</div>` : ''}
  </div>`;
}

/* ---------------- search ---------------- */
/* Nicknames: the real ones, as Basketball-Reference lists them (built daily by tools/nick.mjs, branch nick-data) */
let nickP = null;
function loadNicks() {
  if (nickP) return nickP;
  let c = null; try { c = JSON.parse(localStorage.getItem('fc-nicks') || 'null'); } catch (e) {}
  const index = d => { const by = {}, list = []; for (const [br, p] of Object.entries(d.players || {})) { if (!p.nick?.length) continue; const x = { br, ...p }; if (p.espn) by[p.espn] = x; list.push(x); } return { by, list }; };
  if (c?.d && Date.now() - c.at < 24 * 3600e3) nickP = Promise.resolve(index(c.d));
  else nickP = fetch(`https://raw.githubusercontent.com/larosa023/fullcourt/nick-data/nicknames.json?t=${Math.floor(Date.now() / 3600e3)}`).then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { try { localStorage.setItem('fc-nicks', JSON.stringify({ at: Date.now(), d })); } catch (e) {} return index(d); })
    .catch(() => (c?.d ? index(c.d) : { by: {}, list: [] }));
  return nickP;
}
const nickLine = (list, n = 4) => list.slice(0, n).map(x => `“${esc(x)}”`).join(' · ');
const nickFold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
let spNick = [];
const spPop = $('#searchPop'), spIn = $('#spInput'), spRes = $('#spRes');
let spItems = [], spIdx = 0, spTimer = 0, spSeq = 0, spPlayers = [], spState = 'idle';
function openSearch() {
  closeDrawer();
  spPop.hidden = false;
  requestAnimationFrame(() => spPop.classList.add('on'));
  document.documentElement.classList.add('locked');
  spIn.value = ''; spPlayers = []; spState = 'idle';
  renderSearch();
  setTimeout(() => spIn.focus(), 30);
  if (!S.standings) loadStandings().then(renderSearch).catch(() => {});
  loadNicks();
}
function closeSearch() {
  if (spPop.hidden) return;
  spPop.classList.remove('on');
  setTimeout(() => { spPop.hidden = true; unlockIfIdle(); }, 180);
}
function matchTeams(q) {
  const t = q.toLowerCase();
  const all = Object.values(S.teams).filter(x => x.abbr && x.name);
  if (!t) return favId && S.teams[favId] ? [S.teams[favId]] : [];
  return all.filter(x => x.name.toLowerCase().includes(t) || x.abbr.toLowerCase() === t || (x.loc || '').toLowerCase().startsWith(t)).slice(0, 5);
}
function renderSearch() {
  const q = spIn.value.trim();
  const teams = matchTeams(q);
  let players = spPlayers;
  // nickname matches ("Wemby", "The Answer") come first; retired players open their History profile
  if (q.length >= 2 && spNick.length) { const nk = Object.fromEntries(spNick.map(n => [String(n.id), n])); players = [...spNick.filter(n => !players.some(p => String(p.id) === String(n.id))), ...players.map(p => nk[p.id] ? { ...p, sub: [nk[p.id].sub, p.sub].filter(Boolean).join(' · ') } : p)].slice(0, 9); }
  if (!q) {
    const pts = S.leadCache['offensive.avgPoints']?.d;
    players = (pts?.athletes || []).slice(0, 6).map(a => ({ id: a.athlete.id, name: a.athlete.displayName, sub: [a.athlete.position?.abbreviation, a.athlete.teams?.[0]?.displayName || a.athlete.teamName].filter(Boolean).join(' · '), teamId: a.athlete.teamId }));
  }
  const askable = q.split(/\s+/).length >= 3 || /\?$/.test(q);
  spItems = [...(askable ? [{ type: 'ask', q }] : []), ...teams.map(t => ({ type: 'team', t })), ...players.map(p => ({ type: 'player', p }))];
  spIdx = Math.min(spIdx, Math.max(0, spItems.length - 1));
  let i = -1;
  const row = it => {
    i++;
    if (it.type === 'ask') return `<button class="sp-row sp-ask${i === spIdx ? ' on' : ''}" data-ask="${esc(it.q)}" data-i="${i}"><span class="sp-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.2A8 8 0 1 1 20 12Z"/><path d="M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-.9.8-.9 1.4M12 16h.01"/></svg></span><span><b>Ask: “${esc(it.q)}”</b><small>Get the answer from live stats</small></span></button>`;
    if (it.type === 'team') return `<button class="sp-row${i === spIdx ? ' on' : ''}" data-team="${it.t.id}" data-i="${i}">${logo(it.t.abbr, 56)}<span><b>${esc(it.t.name)}</b><small>${favId === it.t.id ? '★ Your team' : 'Team'}</small></span></button>`;
    if (it.p.leg) return `<button class="sp-row${i === spIdx ? ' on' : ''}" data-nickleg="${esc(it.p.leg)}" data-i="${i}">${face(it.p.id, it.p.name, 'sp-face', 120)}<span><b>${esc(it.p.name)}</b><small>${esc(it.p.sub || '')}</small></span></button>`;
    return `<button class="sp-row${i === spIdx ? ' on' : ''}" data-player="${it.p.id}" data-i="${i}">${face(it.p.id, it.p.name, 'sp-face', 120)}<span><b>${esc(it.p.name)}</b><small>${esc(it.p.sub || 'Player')}</small></span></button>`;
  };
  const aH = askable ? row(spItems[0]) : '';
  const tH = teams.length ? `<div class="sp-h">${q ? 'Teams' : 'Your team'}</div>${teams.map(t => row({ type: 'team', t })).join('')}` : '';
  const pH = players.length ? `<div class="sp-h">${q ? 'Players' : 'Top scorers right now'}</div>${players.map(p => row({ type: 'player', p })).join('')}` : '';
  const status = q.length >= 2 && spState === 'loading' && !players.length ? '<div class="sp-msg">Searching players…</div>'
    : q.length >= 2 && spState === 'error' ? '<div class="sp-msg">Player search is unavailable right now. Teams still work.</div>'
    : q && !teams.length && !players.length && spState === 'done' ? `<div class="sp-msg">No players or teams match “${esc(q)}”.</div>`
    : !q && !teams.length && !players.length ? '<div class="sp-msg">Type a player or team name.</div>' : '';
  spRes.innerHTML = aH + tH + pH + status;
}
spIn.addEventListener('input', () => {
  spIdx = 0;
  const q = spIn.value.trim();
  clearTimeout(spTimer);
  if (q.length < 2) { spPlayers = []; spNick = []; spState = 'idle'; renderSearch(); return; }
  loadNicks().then(N => { const f = nickFold(q); if (f.length < 2) return; spNick = N.list.filter(x => x.lg === LGK && x.nick.some(n => { const k = nickFold(n); return k === f || (f.length >= 3 && k.startsWith(f)); })).slice(0, 4).map(x => ({ id: x.espn || x.br, name: x.name, sub: nickLine(x.nick.filter(n => nickFold(n).startsWith(f)).concat(x.nick).filter((v, i, a) => a.indexOf(v) === i), 2), ...(x.cur ? {} : { leg: x.br }) })).filter(x => x.leg || /^\d+$/.test(x.id)); renderSearch(); });
  spState = 'loading'; renderSearch();
  spTimer = setTimeout(async () => {
    const my = ++spSeq;
    try {
      const r = await getJSON(`${SEARCH_API}?query=${encodeURIComponent(q)}&limit=15&type=player&sport=basketball&league=${LG}`, { retries: 0, timeout: 8000 });
      if (my !== spSeq) return;
      spPlayers = (r.items || []).filter(it => it.league === LG && it.isActive !== false).slice(0, 8).map(it => {
        const tn = it.teamRelationships?.[0]?.displayName;
        return { id: it.id, name: it.displayName, sub: [it.position?.abbreviation, tn].filter(Boolean).join(' · '), teamId: teamByName(tn)?.id };
      });
      spState = 'done';
    } catch (e) { if (my !== spSeq) return; spPlayers = []; spState = 'error'; }
    renderSearch();
  }, 180);
});
spIn.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!spItems.length) return;
    spIdx = (spIdx + (e.key === 'ArrowDown' ? 1 : -1) + spItems.length) % spItems.length;
    $$('.sp-row', spRes).forEach(b => b.classList.toggle('on', +b.dataset.i === spIdx));
    $(`.sp-row[data-i="${spIdx}"]`, spRes)?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') {
    e.preventDefault();
    $(`.sp-row[data-i="${spIdx}"]`, spRes)?.click();
  } else if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
});
spRes.addEventListener('pointermove', e => { const r = e.target.closest('.sp-row'); if (r && +r.dataset.i !== spIdx) { spIdx = +r.dataset.i; $$('.sp-row', spRes).forEach(b => b.classList.toggle('on', b === r)); } });
spRes.addEventListener('click', e => {
  const r = e.target.closest('.sp-row'); if (!r) return;
  const it = spItems[+r.dataset.i];
  if (it?.type === 'player') rememberPlayer({ id: it.p.id, displayName: it.p.name }, it.p.teamId);
  closeSearch();
}, true);
$('#spScrim').addEventListener('click', closeSearch);

/* ---------------- keyboard shortcuts ---------------- */
const helpPop = $('#helpPop');
function openHelp() { helpPop.hidden = false; requestAnimationFrame(() => helpPop.classList.add('on')); document.documentElement.classList.add('locked'); }
function closeHelp() { if (helpPop.hidden) return; helpPop.classList.remove('on'); setTimeout(() => { helpPop.hidden = true; unlockIfIdle(); }, 180); }
$('#helpScrim').addEventListener('click', closeHelp);
$('#helpClose').addEventListener('click', closeHelp);
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); spPop.hidden ? openSearch() : closeSearch(); return; }
  if (!spPop.hidden) { if (e.key === 'Escape') closeSearch(); return; }
  if (!helpPop.hidden) { if (e.key === 'Escape' || e.key === '?') closeHelp(); return; }
  if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); openSearch(); return; }
  if (e.key === '?') { e.preventDefault(); openHelp(); return; }
  if (stack.length || $('#drawer').classList.contains('open')) return;
  const n = '12345'.indexOf(e.key);
  if (n >= 0) { go(VIEWS[n]); return; }
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && S.view === 'scores' && !document.activeElement?.closest('#rail, .hs')) {
    const d = addDays(S.date, e.key === 'ArrowLeft' ? -1 : 1);
    if ($(`#rail [data-date="${d}"]`)) { e.preventDefault(); pickDate(d); }
    return;
  }
  if (e.key === 't' || e.key === 'T') { go('scores'); pickDate(S.today); return; }
  if (e.key === 'm' || e.key === 'M') { if (S.view !== 'scores') go('scores'); openMulti(); return; }
  if (e.key === 'a' || e.key === 'A') { e.preventDefault(); openAsk(); return; }
  if (e.key === 'l' || e.key === 'L') { switchLeague({ nba: 'wnba', wnba: 'ncaa', ncaaw: 'nba', ncaam: 'nba' }[LGK]); }
});

const f1 = v => Number.isFinite(+v) ? (+v).toFixed(1) : '–';
const fpct = v => Number.isFinite(+v) ? (+v).toFixed(1) + '%' : '–';
const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
const deaccent = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const nameKey = s => deaccent(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const card = inner => `<div class="ask-card">${inner}</div>`;
/* ---------------- share as an image ---------------- */
const SHARE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
// make an image and hand it over: copied to the clipboard on a computer, the share sheet on a phone
async function runShare(fn, b) {
  if (b?.classList.contains('busy')) return;
  b?.classList.add('busy');
  const copyMode = !isTouch && !!navigator.clipboard?.write && 'ClipboardItem' in window;
  // start drawing right away; the clipboard gets the finished picture as soon as it's ready
  const job = Promise.resolve().then(fn).then(async o => { if (!o) throw new Error('nothing to share'); o.blob = await canvasBlob(o.canvas); return o; });
  try {
    if (copyMode) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': job.then(o => o.blob) })]);
        toast('Image copied. Paste it anywhere');
      } catch (err) { saveImage(await job); }
    } else {
      await shareImage(await job);
    }
  } catch (err) { toast("Couldn't make the image"); }
  b?.classList.remove('busy');
}
function addShareBtn(sheet, fn) {
  const bar = $('.sheet-bar', sheet.el); if (!bar || $('[data-share]', bar)) return;
  const b = document.createElement('button');
  const copyMode = !isTouch && !!navigator.clipboard?.write && 'ClipboardItem' in window;
  const label = copyMode ? 'Copy as image' : 'Share as image';
  b.className = 'icon-btn share-btn'; b.dataset.share = ''; b.setAttribute('aria-label', label); b.title = label;
  b.innerHTML = SHARE_ICON;
  b.addEventListener('click', e => { e.stopPropagation(); runShare(fn, b); });
  bar.insertBefore(b, $('[data-expand]', bar));
}
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
async function canvasBlob(canvas) {
  const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('no image');
  return blob;
}
// phones: the share sheet (Messages, Photos, Copy...); anywhere else without a clipboard: download
async function shareImage({ blob, name, title }) {
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return; } catch (e) { if (e?.name === 'AbortError') return; }
  }
  saveImage({ blob, name });
}
function saveImage({ blob, name }) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Image saved to your downloads');
}

const NEWS_LATEST = '2026-11-08f'; // must match the first entry in m/news.js
const NEWS_KEY = 'fc-news-seen';
function markNews() { $$('.news-dot').forEach(d => { d.hidden = lsGet(NEWS_KEY) === NEWS_LATEST; }); }

/* ================= parts of the site that load the first time they're used ================= */
const MODS = /*__MODS__*/{};
const modP = {};
function lazy(name) {
  if (!modP[name]) {
    const m = MODS[name];
    const css = m?.css ? new Promise(res => { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL(m.css, ASSET_BASE).href; l.onload = l.onerror = res; document.head.append(l); }) : null;
    modP[name] = Promise.all([import(new URL(m.js, ASSET_BASE).href), css]).then(([x]) => x).catch(e => { delete modP[name]; staleCheck(); throw e; });
  }
  return modP[name];
}
// A part that won't load is usually a sign Fullcourt was updated while this page was open (its old files are gone).
// If the site now has a newer build, reload into it (at most once a minute) instead of leaving a broken button.
let staleBusy = false;
async function staleCheck() {
  if (staleBusy || !navigator.onLine) return; staleBusy = true;
  try {
    const last = +sessionStorage.getItem('fc-stale-reload') || 0; if (Date.now() - last < 60e3) return;
    const mine = [...document.querySelectorAll('script[type=importmap]')].map(s => s.textContent.match(/core\.[\w-]+\.js/)?.[0]).find(Boolean);
    const h = await (await fetch(new URL('index.html', ASSET_BASE).href + '?t=' + Date.now(), { cache: 'no-store' })).text();
    const theirs = h.match(/core\.[\w-]+\.js/)?.[0];
    if (mine && theirs && theirs !== mine) {
      sessionStorage.setItem('fc-stale-reload', String(Date.now()));
      toast('Fullcourt was just updated. Reloading…');
      setTimeout(() => location.reload(), 1200);
    }
  } catch (e) {} finally { staleBusy = false; }
}
const stub = (name, fn) => (...a) => lazy(name).then(m => m[fn](...a)).catch(err => { console.error(err); toast("Couldn't load that part of Fullcourt. Check your connection and try again."); });
const openAsk = stub('ask', 'openAsk');
const renderBets = stub('bets', 'renderBets');
const removeBet = stub('bets', 'removeBet');
const toggleBetMin = stub('bets', 'toggleBetMin');
const renderCompare = stub('compare', 'renderCompare');
const renderBetDesk = stub('betdesk', 'renderBetDesk');
const openPropDetail = stub('ask', 'openPropDetail');
const openMulti = stub('multi', 'openMulti');
const renderAward = stub('awards', 'renderAward');
const shareGame = stub('share', 'shareGame');
const sharePlayer = stub('share', 'sharePlayer');
const sharePlayerGame = stub('share', 'sharePlayerGame');
const renderRankings = stub('ranks', 'renderRankings');
const drawRankings = stub('ranks', 'drawRankings');
const openNews = stub('news', 'openNews');
const fillCareer = stub('career', 'fillCareer');
const fillLog = stub('gamelog', 'fillLog');
const renderAdvLeader = stub('advlead', 'renderAdvLeader');
const fillTeamExtras = stub('teamx', 'fillTeamExtras');
const renderMoves = stub('moves', 'renderMoves');
const openSettings = stub('settings', 'openSettings');
const openWeek = stub('week', 'openWeek');

/* ---------------- data helpers ---------------- */
// the league-wide player table is a big download (every player's season line), so the last one is kept on the device and
// reused while it's still fresh (same rules as Leaders: 10 minutes, 1 while games are live, and never past a game going final)
const LT_KEY = () => lsKey('fc-lt');
async function leagueTable() {
  if (!S.lt && !S.ltTried) { S.ltTried = true; try { const c = JSON.parse(localStorage.getItem(LT_KEY()) || 'null'); if (c?.rows?.length && c.v === SEASON_QS) S.lt = { t: c.t, rows: c.rows }; } catch (e) {} }
  if (S.lt && !leadStale(S.lt)) return S.lt.rows;
  const d = await getJSON(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=false&page=1&limit=600&sort=offensive.avgPoints:desc${SEASON_QS}`, { timeout: 25000 });
  const idx = {}; (d.categories || []).forEach(c => { idx[c.name] = c.names; });
  const rows = (d.athletes || []).map(a => {
    const cat = {}; (a.categories || []).forEach(c => { cat[c.name] = c.values; });
    const g = (c, n) => { const i = idx[c]?.indexOf(n); return i >= 0 ? Number(cat[c]?.[i]) : NaN; };
    const at = a.athlete;
    return {
      id: at.id, name: at.displayName, first: at.firstName || '', last: at.lastName || '', short: at.shortName, key: nameKey(at.displayName),
      teamId: at.teamId, abbr: at.teamShortName || at.teams?.[0]?.abbreviation || '', pos: at.position?.abbreviation || '',
      gp: g('general', 'gamesPlayed'), min: g('general', 'avgMinutes'), reb: g('general', 'avgRebounds'), dd: g('general', 'doubleDouble'), td: g('general', 'tripleDouble'),
      pts: g('offensive', 'avgPoints'), ast: g('offensive', 'avgAssists'), tov: g('offensive', 'avgTurnovers'),
      fgp: g('offensive', 'fieldGoalPct'), tpp: g('offensive', 'threePointFieldGoalPct'), ftp: g('offensive', 'freeThrowPct'),
      tpm: g('offensive', 'avgThreePointFieldGoalsMade'), tpa: g('offensive', 'avgThreePointFieldGoalsAttempted'), fga: g('offensive', 'avgFieldGoalsAttempted'),
      fta: g('offensive', 'avgFreeThrowsAttempted'), ftm: g('offensive', 'avgFreeThrowsMade'),
      stl: g('defensive', 'avgSteals'), blk: g('defensive', 'avgBlocks'),
      tot: { pts: g('offensive', 'points'), reb: g('general', 'rebounds'), ast: g('offensive', 'assists'), stl: g('defensive', 'steals'), blk: g('defensive', 'blocks'), tpm: g('offensive', 'threePointFieldGoalsMade'), ftm: g('offensive', 'freeThrowsMade'), tov: g('offensive', 'turnovers'), min: g('general', 'minutes'), dd: g('general', 'doubleDouble'), td: g('general', 'tripleDouble') },
    };
  });
  S.lt = { t: Date.now(), rows };
  setTimeout(() => { try { localStorage.setItem(LT_KEY(), JSON.stringify({ t: S.lt.t, v: SEASON_QS, rows })); } catch (e) {} }, 0);
  return rows;
}
const scoreboardOn = date => getJSON(`${API}/scoreboard?dates=${date}${SB_QS}`).then(d => (d.events || []).map(parseGame));
const summaryOf = id => getJSON(`${API}/summary?event=${id}`);
const scheduleOf = id => getJSON(`${API}/teams/${id}/schedule`);
// team schedules, kept for 30 minutes (rest flags read many of them at once)
const schedMemo = new Map();
const scheduleCached = id => { const m = schedMemo.get(id); if (m && Date.now() - m.t < 30 * 60e3) return m.p; const p = scheduleOf(id).catch(e => { schedMemo.delete(id); throw e; }); schedMemo.set(id, { t: Date.now(), p }); return p; };
// rest: back-to-back (played the day before) and 3 games in 4 nights, counting the game on `day`. Who played on each of the three days before a slate, from those days' scoreboards (3 small requests for the
// whole league, instead of every team's full schedule)
const teamsOnDay = {};
function teamsOn(day) {
  return teamsOnDay[day] ||= scoreboardOn(day).then(gs => new Set(gs.flatMap(g => [String(g.home.id), String(g.away.id)]))).catch(() => { delete teamsOnDay[day]; return null; });
}
async function restOf(teamId, day) {
  try {
    const prev = await Promise.all([1, 2, 3].map(k => teamsOn(addDays(day, -k))));
    if (!prev[0]) return {};
    const t = String(teamId), b2b = prev[0].has(t), n4 = 1 + prev.filter(s => s?.has(t)).length; // the slate day itself counts
    return { b2b, three4: n4 >= 3 };
  } catch (e) { return {}; }
}
/* PBPStats team numbers (free, public): pace and the shooting each defense allows by zone. NBA only, cached 6h. */
const PBP_API = 'https://api.pbpstats.com';
const PBP_ABBR = { GS: 'GSW', NY: 'NYK', SA: 'SAS', NO: 'NOP', UTAH: 'UTA', WSH: 'WAS' };
const pbpAbbr = a => PBP_ABBR[a] || a;
const pbpSeason = (back = 0) => { const n = new Date(), y = (n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1) - back; return `${y}-${String(y + 1).slice(2)}`; };
let pbpTeamsP = null;
function pbpTeams() {
  if (IS_W || IS_C) return Promise.resolve(null);
  if (pbpTeamsP) return pbpTeamsP;
  pbpTeamsP = (async () => {
    try { const c = JSON.parse(lsGet('fc-pbp-teams') || 'null'); if (c && Date.now() - c.t < 6 * 3600e3) return c.d; } catch (e) {}
    const get = (type, back) => getJSON(`${PBP_API}/get-totals/nba?Season=${pbpSeason(back)}&SeasonType=Regular%20Season&Type=${type}`, { retries: 0, timeout: 15000 });
    let [T, O] = await Promise.all([get('Team', 0), get('Opponent', 0)]), back = 0;
    // too early in a season to say much: use last season's numbers
    if ((T.multi_row_table_data || []).reduce((a, r) => a + (r.GamesPlayed || 0), 0) / 30 < 6) { back = 1; [T, O] = await Promise.all([get('Team', 1), get('Opponent', 1)]); }
    const Z = [['AtRim', 'At the rim'], ['ShortMidRange', 'Short mid-range'], ['LongMidRange', 'Long mid-range'], ['Corner3', 'Corner 3'], ['Arc3', 'Above-the-break 3']];
    const zone = r => Object.fromEntries(Z.map(([z]) => [z, r[z + 'FGA'] ? r[z + 'FGM'] / r[z + 'FGA'] : null]));
    const d = { pace: {}, lgPace: T.single_row_table_data?.Pace, opp: {}, lgZone: zone(O.single_row_table_data || {}), zones: Z, gp: {}, tid: {}, season: pbpSeason(back), back };
    for (const r of T.multi_row_table_data || []) { d.pace[r.TeamAbbreviation || r.Name] = r.Pace; d.gp[r.TeamAbbreviation || r.Name] = r.GamesPlayed; d.tid[r.TeamAbbreviation || r.Name] = r.TeamId; }
    for (const r of O.multi_row_table_data || []) d.opp[r.TeamAbbreviation || r.Name] = zone(r);
    lsSet('fc-pbp-teams', JSON.stringify({ t: Date.now(), d }));
    return d;
  })().catch(() => { pbpTeamsP = null; return null; });
  return pbpTeamsP;
}
// projected pace for a matchup vs the league: + is faster
function paceOf(P, a, b) { const x = P?.pace?.[pbpAbbr(a)], y = P?.pace?.[pbpAbbr(b)]; return x && y && P.lgPace ? { pace: (x + y) / 2, diff: (x + y) / 2 - P.lgPace } : null; }
// game logs are the heaviest thing the Bet desk loads (one per player), so keep them for the session:
// in memory, and in sessionStorage for 2 hours (last season's for a day) so a reload doesn't refetch them all
const glMemo = new Map();
function gameLog(pid, season) {
  const k = `fc-gl3:${LG}:${pid}:${season || ''}`, ttl = season ? 864e5 : 2 * 3600e3;
  const m = glMemo.get(k); if (m && Date.now() - m.t < ttl) return m.p;
  try { const c = JSON.parse(sessionStorage.getItem(k) || 'null'); if (c && Date.now() - c.t < ttl) { const p = Promise.resolve(c.d); glMemo.set(k, { t: c.t, p }); return p; } } catch (e) {}
  const p = gameLogFetch(pid, season).then(d => { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d })); } catch (e) {} return d; });
  p.catch(() => glMemo.delete(k));
  glMemo.set(k, { t: Date.now(), p });
  return p;
}
async function gameLogFetch(pid, season) {
  const d = await getJSON(`${WEB}/athletes/${pid}/gamelog${season ? `?season=${season}` : ''}`);
  const lab = d.labels || [];
  const evs = [];
  for (const st of d.seasonTypes || []) {
    if (/preseason/i.test(st.displayName || '')) continue;
    for (const c of st.categories || []) for (const e of c.events || []) {
      const m = d.events?.[e.eventId] || {};
      // All-Star games sit in the regular season list; their "opponents" (Team Stars, World...) aren't franchises
      if ((LGK === 'nba' && +m.opponent?.id > 30) || /^(team |world$|usa|rising|all-?star)/i.test(m.opponent?.displayName || '')) continue;
      const v = k => e.stats[lab.indexOf(k)];
      const split = s => { const [a, b] = String(s || '0-0').split('-').map(Number); return [a || 0, b || 0]; };
      evs.push({ id: e.eventId, date: m.gameDate, opp: m.opponent?.abbreviation || '', oppId: m.opponent?.id, oppRank: +m.opponent?.rank || null, atVs: m.atVs || '', res: m.gameResult || '', score: m.score || '',
        min: +v('MIN') || 0, pts: +v('PTS') || 0, reb: +v('REB') || 0, ast: +v('AST') || 0, stl: +v('STL') || 0, blk: +v('BLK') || 0, tov: +v('TO') || 0,
        fg: split(v('FG')), tp: split(v('3PT')), ft: split(v('FT')) });
    }
  }
  evs.sort((a, b) => new Date(b.date) - new Date(a.date));
  return evs;
}
function boxRows(d) {
  const out = [];
  for (const T of d.boxscore?.players || []) {
    const st = T.statistics?.[0]; if (!st) continue;
    const lab = st.labels || st.names || [];
    for (const a of st.athletes || []) {
      const v = k => a.stats?.[lab.indexOf(k)];
      const split = s => { const [x, y] = String(s || '0-0').split('-').map(Number); return [x || 0, y || 0]; };
      out.push({ id: a.athlete.id, name: a.athlete.displayName, short: a.athlete.shortName, teamId: T.team?.id, abbr: T.team?.abbreviation,
        dnp: a.didNotPlay || !a.stats?.length, reason: a.reason || '', starter: a.starter,
        min: +v('MIN') || 0, pts: +v('PTS') || 0, reb: +v('REB') || 0, ast: +v('AST') || 0, stl: +v('STL') || 0, blk: +v('BLK') || 0, tov: +v('TO') || 0,
        pm: v('+/-') ?? '', fg: split(v('FG')), tp: split(v('3PT')), ft: split(v('FT')) });
    }
  }
  return out;
}
const valOf = (r, k) => k === 'tpm' ? (r.tp ? r.tp[0] : r.tpm) : k === 'ftm' ? (r.ft ? r.ft[0] : r.ftm) : k === 'pm' ? parseFloat(r.pm) || 0 : r[k];
const dblCount = r => ['pts', 'reb', 'ast', 'stl', 'blk'].filter(k => (r[k] || 0) >= 10).length;
function rankOf(rows, p, k, asc) {
  const q = qualified(rows, k);
  const sorted = q.filter(r => Number.isFinite(r[k])).sort((a, b) => asc ? a[k] - b[k] : b[k] - a[k]);
  const i = sorted.findIndex(r => r.id === p.id);
  return i < 0 ? null : { rank: i + 1, of: sorted.length };
}
function qualified(rows, k) {
  const maxGp = Math.max(1, ...rows.map(r => r.gp || 0));
  const minGp = Math.max(1, Math.ceil(maxGp * 0.5));
  return rows.filter(r => (r.gp || 0) >= minGp && (k !== 'fgp' || (r.fga >= 6 && r.fga * r.gp >= 20)) && (k !== 'tpp' || (r.tpa >= 3 && r.tpa * r.gp >= 10)) && (k !== 'ftp' || (r.fta >= 2.5 && r.fta * r.gp >= 8)));
}

/* ================= league switch ================= */
$$('[data-lg]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lg === LGK || (b.dataset.lg === 'ncaa' && IS_C)));
// (the league badge text comes from CSS, so it's right from the first paint)
// college: "Standings" is the polls plus conference tables
// (the Standings / Rankings label follows the league in CSS, so it's right from the first paint)
function switchLeague(lg) {
  // "NCAA" goes to whichever college side you used last (women's to start)
  if (lg === 'ncaa') { if (IS_C) return; try { lg = localStorage.getItem('fc-college') === 'ncaam' ? 'ncaam' : 'ncaaw'; } catch (e) { lg = 'ncaaw'; } }
  if (lg === LGK) return;
  try { localStorage.setItem('fc-league', lg); if (lg === 'ncaaw' || lg === 'ncaam') localStorage.setItem('fc-college', lg); } catch (e) {}
  // light the chosen pill right away, then fade the veil (in the new league's colour) before reloading
  $$('[data-lg]').forEach(b => b.setAttribute('aria-pressed', b.dataset.lg === lg || (b.dataset.lg === 'ncaa' && /^ncaa/.test(lg))));
  try { sessionStorage.setItem('fc-swap', '1'); } catch (e) {}
  const root = document.documentElement;
  root.dataset.league = lg;
  // hold the team-chip space the new league will need, and drop the old chip now, so the header changes once
  try { root.classList.toggle('has-fav', !!localStorage.getItem(lg === 'nba' ? 'fc-fav' : 'fc-fav-' + lg)); } catch (e) {}
  const fl = $('#favLink'); if (fl) fl.hidden = true;
  root.classList.add('switching');
  setTimeout(() => location.reload(), 230);
}

/* =====================================================================
   UPGRADES 2: win probability, play filters, previews, highlights, officials,
   big-night badges, team alerts, player trends, schedule calendar,
   award races, share images
   ===================================================================== */
const BIG_PTS = IS_W ? 35 : 40;      // a "big night" scoring game
const BIG_COMEBACK = IS_W ? 15 : 20; // a comeback worth flagging
const isTouch = matchMedia('(pointer: coarse)').matches;

/* ---------------- win probability ---------------- */
S.wpPts = {};
function wpChart(d, sides) {
  const wp = d.winprobability || [];
  if (wp.length < 4) return '';
  const byId = new Map((d.plays || []).map(p => [String(p.id), p]));
  let maxPer = REG_PERIODS;
  for (const p of d.plays || []) maxPer = Math.max(maxPer, p.period?.number || 1);
  const end = maxPer <= 4 ? REG : REG + (maxPer - 4) * OTP;
  let lastT = 0, lastP = null;
  const pts = wp.map(w => {
    const p = byId.get(String(w.playId)) || lastP;
    let t = p ? elapsedAt(p.period?.number || 1, p.clock?.displayValue) : lastT;
    if (t < lastT) t = lastT;
    lastT = t; lastP = p;
    return { t, h: Math.max(0, Math.min(1, +w.homeWinPercentage || 0)), p };
  });
  const W = 600, H = 176, L = 10, R = 10, T = 16, B = 28;
  const x = t => L + (t / end) * (W - L - R), y = h => T + (1 - h) * (H - T - B), mid = y(0.5);
  let path = '';
  pts.forEach((q, i) => { path += `${i ? 'L' : 'M'}${x(q.t).toFixed(1)} ${y(q.h).toFixed(1)} `; });
  const last = pts.at(-1);
  const area = `${path}L${x(last.t).toFixed(1)} ${mid.toFixed(1)} L${x(pts[0].t).toFixed(1)} ${mid.toFixed(1)} Z`;
  // biggest swings: change in win chance over ~90 seconds of game time, at least 12 points, kept apart from each other
  const sw = [];
  for (let i = 1, j = 0; i < pts.length; i++) {
    while (pts[j].t < pts[i].t - 90) j++;
    let k = j, best = 0;
    for (let m = j; m < i; m++) if (Math.abs(pts[i].h - pts[m].h) > Math.abs(best)) { best = pts[i].h - pts[m].h; k = m; }
    if (Math.abs(best) >= 0.12) sw.push({ i, from: k, d: best });
  }
  sw.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const swings = [];
  for (const s of sw) { if (swings.length >= 2) break; if (swings.every(o => Math.abs(pts[o.i].t - pts[s.i].t) > 300)) swings.push(s); }
  const n = (S.wpN = (S.wpN || 0) + 1);
  const final = d.header?.competitions?.[0]?.status?.type?.state === 'post';
  S.wpPts[n] = { pts, sides, x0: L, x1: W - R, end, W, final };
  const keys = Object.keys(S.wpPts); if (keys.length > 12) delete S.wpPts[keys[0]];
  const qs = []; for (let p = 1; p < maxPer; p++) qs.push(p <= REG_PERIODS ? p * QP : REG + (p - REG_PERIODS) * OTP);
  const qLabels = Array.from({ length: maxPer }, (_, i) => { const a = i < REG_PERIODS ? i * QP : REG + (i - REG_PERIODS) * OTP, b = i < REG_PERIODS ? (i + 1) * QP : a + OTP; return `<text x="${x((a + b) / 2)}" y="${H - 8}" text-anchor="middle" class="ax">${perLabel(i + 1)}</text>`; }).join('');
  const swingTeam = s => s.d > 0 ? sides[1] : sides[0];
  const swingText = s => { const p = pts[s.i].p; return p ? `${perLabel(p.period?.number || 1)} ${p.clock?.displayValue || ''}` : ''; };
  return `<div class="card wp" data-wp="${n}"><div class="card-h"><h4>Win probability</h4><span class="eyebrow wp-read">${esc(wpReadout(n, pts.length - 1))}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Win probability over the game">
      <defs>
        <clipPath id="wa${n}"><rect x="0" y="0" width="${W}" height="${mid}"/></clipPath>
        <clipPath id="wb${n}"><rect x="0" y="${mid}" width="${W}" height="${H - mid}"/></clipPath>
      </defs>
      ${qs.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${T}" y2="${H - B}" stroke="var(--line)"/>`).join('')}
      <line x1="${L}" x2="${W - R}" y1="${mid}" y2="${mid}" stroke="var(--muted)" stroke-dasharray="3 4" opacity=".7"/>
      <path d="${area}" fill="var(--sideB)" opacity=".26" clip-path="url(#wa${n})"/>
      <path d="${area}" fill="var(--sideA)" opacity=".26" clip-path="url(#wb${n})"/>
      <path d="${path}" fill="none" stroke="var(--ink)" stroke-width="1.7" stroke-linejoin="round"/>
      ${swings.map(s => { const q = pts[s.i]; return `<circle cx="${x(q.t).toFixed(1)}" cy="${y(q.h).toFixed(1)}" r="5" fill="none" stroke="${s.d > 0 ? 'var(--sideB)' : 'var(--sideA)'}" stroke-width="2"/>`; }).join('')}
      <circle cx="${x(last.t).toFixed(1)}" cy="${y(last.h).toFixed(1)}" r="4" fill="var(--accent)" stroke="var(--surface)" stroke-width="2"/>
      <line class="wp-guide" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--ink)" stroke-width="1" opacity="0"/>
      <circle class="wp-dot" cx="0" cy="0" r="4" fill="var(--ink)" opacity="0"/>
      <text x="${L + 4}" y="${T + 11}" class="ax">${esc(sides[1].abbr)} 100%</text>
      <text x="${L + 4}" y="${H - B - 5}" class="ax">${esc(sides[0].abbr)} 100%</text>
      ${qLabels}
    </svg>
    ${swings.length ? `<div class="runs">${swings.map(s => `<div class="run"><i style="background:${s.d > 0 ? 'var(--sideB)' : 'var(--sideA)'}"></i><b>${esc(swingTeam(s).abbr)} +${Math.round(Math.abs(s.d) * 100)}%</b><span>${esc(swingText(s))}${pts[s.i].p?.text ? ' · ' + esc(pts[s.i].p.text) : ''}</span></div>`).join('')}</div>` : ''}
  </div>`;
}
function wpReadout(n, i) {
  const D = S.wpPts[n]; if (!D) return '';
  const final = D.final;
  const q = D.pts[i]; if (!q) return '';
  const lead = q.h >= 0.5 ? D.sides[1] : D.sides[0];
  const pct = Math.round((q.h >= 0.5 ? q.h : 1 - q.h) * 100);
  const p = q.p;
  const when = i === D.pts.length - 1 && final ? 'Final' : p ? `${perLabel(p.period?.number || 1)} ${p.clock?.displayValue || ''}` : '';
  const score = p && Number.isFinite(+p.awayScore) ? ` · ${D.sides[0].abbr} ${p.awayScore}-${p.homeScore} ${D.sides[1].abbr}` : '';
  return `${when}${score} · ${lead.abbr} ${Math.min(pct, 100)}%`;
}
// hover / drag along the chart to read the win chance at any moment
function wpPointer(e) {
  const card = e.target.closest?.('.wp[data-wp]'); if (!card) return;
  const n = card.dataset.wp, D = S.wpPts[n]; if (!D) return;
  const svg = $('svg', card), r = svg.getBoundingClientRect();
  const vx = ((e.clientX - r.left) / r.width) * D.W;
  const t = Math.max(0, Math.min(D.end, ((vx - D.x0) / (D.x1 - D.x0)) * D.end));
  let lo = 0, hi = D.pts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (D.pts[m].t <= t) lo = m; else hi = m - 1; }
  const q = D.pts[lo];
  const gx = D.x0 + (q.t / D.end) * (D.x1 - D.x0);
  const H = 176, T = 16, B = 28, gy = T + (1 - q.h) * (H - T - B);
  const g = $('.wp-guide', card), dot = $('.wp-dot', card);
  g.setAttribute('x1', gx); g.setAttribute('x2', gx); g.setAttribute('opacity', '.35');
  dot.setAttribute('cx', gx); dot.setAttribute('cy', gy); dot.setAttribute('opacity', '1');
  $('.wp-read', card).textContent = wpReadout(n, lo);
}
function wpLeave(e) {
  const card = e.target.closest?.('.wp[data-wp]'), svg = e.target.closest?.('svg');
  if (!card || (svg && svg.contains(e.relatedTarget))) return;
  $('.wp-guide', card)?.setAttribute('opacity', '0'); $('.wp-dot', card)?.setAttribute('opacity', '0');
  const D = S.wpPts[card.dataset.wp];
  if (D) $('.wp-read', card).textContent = wpReadout(card.dataset.wp, D.pts.length - 1);
}
document.addEventListener('pointermove', e => { if (e.target.closest?.('.wp svg')) wpPointer(e); }, { passive: true });
document.addEventListener('pointerout', e => { if (e.target.closest?.('.wp svg')) wpLeave(e); }, { passive: true });

/* ---------------- play-by-play with filters ---------------- */
function playsList(d, sides, prevLast, F = { kind: 'all', team: 'all', per: 'all', n: 120 }) {
  const all = d.plays || [];
  if (!all.length) return `<div class="empty" style="border:0"><b>No plays yet</b></div>`;
  const maxPer = Math.max(REG_PERIODS, ...all.map(p => p.period?.number || 1));
  const perKey = n => n > REG_PERIODS ? 'OT' : String(n);
  const perOpts = [['all', 'All']].concat(Array.from({ length: Math.min(maxPer, REG_PERIODS) }, (_, i) => [String(i + 1), perLabel(i + 1)]), maxPer > REG_PERIODS ? [['OT', 'OT']] : []);
  const list = all.filter(p =>
    (F.kind === 'all' || p.scoringPlay) &&
    (F.team === 'all' || p.team?.id === F.team) &&
    (F.per === 'all' || perKey(p.period?.number || 1) === F.per)).reverse();
  const shown = list.slice(0, F.n);
  let seenPrev = !prevLast, lastPer = null;
  const rows = shown.map(p => {
    const isNew = !seenPrev && p.id !== prevLast;
    if (p.id === prevLast) seenPrev = true;
    const per = p.period?.number || 1;
    const sep = per !== lastPer ? `<div class="pl-sep">${esc(p.period?.displayValue || perLabel(per))}</div>` : '';
    lastPer = per;
    const tc = p.team?.id ? teamColor(p.team.id) : 'transparent';
    return `${sep}<div class="play${p.scoringPlay ? ' scoring' : ''}${isNew ? ' new' : ''}">
      <span class="clk">${esc(perLabel(per))} ${esc(p.clock?.displayValue || '')}</span>
      <span class="txt"><i class="tdot" style="background:${tc}"></i>${esc(p.text)}</span>
      <span class="sc">${p.awayScore}-${p.homeScore}</span></div>`;
  }).join('');
  const chip = (attr, val, cur, label) => `<button class="chip sm" data-${attr}="${esc(val)}" aria-pressed="${val === cur}">${label}</button>`;
  return `<div class="pl-filters">
      <div class="pl-row" data-drag>${chip('pk', 'all', F.kind, 'All plays')}${chip('pk', 'scoring', F.kind, 'Scoring')}<span class="pl-div"></span>${chip('pt', 'all', F.team, 'Both')}${sides.map(s => chip('pt', s.id, F.team, `${logo(s.abbr, 32)}${esc(s.abbr)}`)).join('')}</div>
      <div class="pl-row hs drag-x" data-drag>${perOpts.map(([v, l]) => chip('pp', v, F.per, l)).join('')}<span class="pl-count">${plural(list.length, 'play')}</span></div>
    </div>
    ${list.length ? `<div class="plays">${rows}</div>` : `<div class="empty" style="border:0;padding:28px 10px"><b>No plays match</b>Try a different filter.</div>`}
    ${list.length > shown.length ? `<div class="btn-row" style="justify-content:center"><button class="btn ghost" data-pmore>Show ${Math.min(200, list.length - shown.length)} more</button></div>` : ''}`;
}

/* ---------------- officials ---------------- */
function officialsCard(d) {
  const o = (d.gameInfo?.officials || []).slice().sort((a, b) => (a.order || 9) - (b.order || 9));
  if (!o.length) return '';
  return `<div class="card refs"><div class="card-h"><h4>Officials</h4><span class="eyebrow">Referee crew</span></div>
    <div class="ref-list">${o.map((r, i) => `<span class="ref"><i>${i === 0 ? 'Crew chief' : esc(r.position?.displayName || 'Referee')}</i><b>${esc(r.displayName || r.fullName)}</b></span>`).join('')}</div></div>`;
}


/* ================= advanced stats (worked out from the box score numbers) ================= */
let advOn = lsGet('fc-adv') === '1';
const GAME_MIN = RULES.per * REG_PERIODS / 60;
const advBtn = () => `<button class="adv-btn" data-adv aria-pressed="${advOn}" title="Switch to advanced stats"><i></i>Advanced</button>`;
function toggleAdv() {
  advOn = !advOn;
  lsSet('fc-adv', advOn ? '1' : null);
  $$('[data-adv]').forEach(b => b.setAttribute('aria-pressed', advOn));
  document.dispatchEvent(new Event('fcadv'));
}
const splitMA = v => { const m = /^\s*([\d.]+)-([\d.]+)\s*$/.exec(String(v ?? '')); return m ? [+m[1], +m[2]] : [NaN, NaN]; };
const advPct = v => Number.isFinite(v) ? (v * 100).toFixed(1) : '–';
const advNum = (v, d = 1) => Number.isFinite(v) ? v.toFixed(d) : '–';
const tsPct = (pts, fga, fta) => fga + 0.44 * fta > 0 ? pts / (2 * (fga + 0.44 * fta)) : NaN;
const efgPct = (fgm, tpm, fga) => fga > 0 ? (fgm + 0.5 * tpm) / fga : NaN;
const astTo = (ast, tov) => tov > 0 ? ast / tov : NaN;
const ADV_HELP = 'TS% true shooting · eFG% effective FG · USG% share of team plays used · GmSc game score';
// box score row -> advanced numbers
const ADV_BOX = ['MIN', 'PTS', 'TS%', 'eFG%', 'USG%', 'AST/TO', 'GmSc', '+/-'];
function advBox(st, lab) {
  const ix = k => lab.indexOf(k);
  const parse = s => {
    const n = k => parseFloat(s?.[ix(k)]) || 0;
    const [fgm, fga] = splitMA(s?.[ix('FG')]), [tpm] = splitMA(s?.[ix('3PT')]), [ftm, fta] = splitMA(s?.[ix('FT')]);
    return { min: n('MIN'), pts: n('PTS'), ast: n('AST'), tov: n('TO'), stl: n('STL'), blk: n('BLK'), orb: n('OREB'), drb: n('DREB'), pf: n('PF'), pm: s?.[ix('+/-')] ?? '', fgm: fgm || 0, fga: fga || 0, tpm: tpm || 0, ftm: ftm || 0, fta: fta || 0 };
  };
  const ps = (st.athletes || []).map(a => a.stats?.length ? parse(a.stats) : null);
  const tot = st.totals?.length ? parse(st.totals) : null;
  const tm = tot || ps.filter(Boolean).reduce((s, p) => { Object.keys(p).forEach(k => { if (typeof p[k] === 'number') s[k] = (s[k] || 0) + p[k]; }); return s; }, {});
  const tmMin = ps.reduce((s, p) => s + (p?.min || 0), 0) || GAME_MIN * 5;
  const tmPoss = (tm.fga || 0) + 0.44 * (tm.fta || 0) + (tm.tov || 0);
  const gmsc = p => p.pts + 0.4 * p.fgm - 0.7 * p.fga - 0.4 * (p.fta - p.ftm) + 0.7 * p.orb + 0.3 * p.drb + p.stl + 0.7 * p.ast + 0.7 * p.blk - 0.4 * p.pf - p.tov;
  const row = p => [p.min, p.pts, advPct(tsPct(p.pts, p.fga, p.fta)), advPct(efgPct(p.fgm, p.tpm, p.fga)), p.min && tmPoss ? advPct(((p.fga + 0.44 * p.fta + p.tov) * (tmMin / 5)) / (p.min * tmPoss)) : '–', advNum(astTo(p.ast, p.tov)), advNum(gmsc(p)), p.pm].map(String);
  return {
    labels: ADV_BOX,
    athletes: (st.athletes || []).map((a, i) => ps[i] ? { ...a, stats: row(ps[i]) } : a),
    totals: [String(Math.round(tmMin)), String(tm.pts ?? ''), advPct(tsPct(tm.pts, tm.fga, tm.fta)), advPct(efgPct(tm.fgm, tm.tpm, tm.fga)), '', advNum(astTo(tm.ast, tm.tov)), '', ''],
  };
}
// team box -> four factors + ratings for both sides
function advTeams(d, sides) {
  const teams = d.boxscore?.players || [];
  const get = s => {
    const T = teams.find(t => t.team?.id === s.id)?.statistics?.[0]; if (!T?.totals?.length) return null;
    const lab = T.labels || T.names || [], ix = k => lab.indexOf(k), n = k => parseFloat(T.totals[ix(k)]) || 0;
    const [fgm, fga] = splitMA(T.totals[ix('FG')]), [tpm] = splitMA(T.totals[ix('3PT')]), [ftm, fta] = splitMA(T.totals[ix('FT')]);
    const min = (T.athletes || []).reduce((x, a) => x + (parseFloat(a.stats?.[ix('MIN')]) || 0), 0) || GAME_MIN * 5;
    return { pts: n('PTS'), orb: n('OREB'), drb: n('DREB'), tov: n('TO'), fgm, fga, tpm, ftm, fta, min };
  };
  const A = get(sides[0]), H = get(sides[1]); if (!A || !H) return null;
  const poss = t => t.fga - t.orb + t.tov + 0.44 * t.fta;
  const P = (poss(A) + poss(H)) / 2 || 1, mins = Math.max(A.min, H.min, GAME_MIN * 5) / 5;
  const side = (t, o) => ({ ortg: 100 * t.pts / P, drtg: 100 * o.pts / P, net: 100 * (t.pts - o.pts) / P, pace: GAME_MIN * P / mins, efg: efgPct(t.fgm, t.tpm, t.fga) * 100, tov: 100 * t.tov / (t.fga + 0.44 * t.fta + t.tov), orb: 100 * t.orb / ((t.orb + o.drb) || 1), ftr: 100 * t.fta / (t.fga || 1), ts: tsPct(t.pts, t.fga, t.fta) * 100 });
  return [side(A, H), side(H, A)];
}

/* ---------------- roster moves (shared by the Moves tab and team pages) ---------------- */
let movesP = null;
function loadMoves() {
  if (!movesP) movesP = getJSON(`${API}/transactions?limit=200`, { timeout: 15000 }).then(d => (d.transactions || []).filter(t => t.description)).catch(e => { movesP = null; throw e; });
  return movesP;
}
const moveKind = t => /trade|acquired|in exchange/i.test(t) ? 'trade' : /waiv|releas|reassign|assigned to|recalled/i.test(t) ? 'waive' : /sign|re-sign|extension|claimed/i.test(t) ? 'sign' : 'other';
const MOVE_LABEL = { trade: 'Trade', waive: 'Waived / assigned', sign: 'Signing', other: 'Other' };
function moveRow(t, showTeam = true) {
  const k = moveKind(t.description);
  return `<div class="mv-row">${showTeam && t.team ? `<button class="mv-tm" data-team="${esc(t.team.id)}">${logo(t.team.abbreviation, 40)}<b>${esc(t.team.abbreviation)}</b></button>` : ''}<div class="mv-txt"><span class="mv-k k-${k}">${MOVE_LABEL[k]}</span><span class="mv-d">${esc(fmtShortDate(t.date))}</span><p>${esc(t.description)}</p></div></div>`;
}

/* ---------------- where to watch ---------------- */
// official places to watch; anything not listed (local channels, team apps) shows as plain text
const WATCH_LINKS = [
  [/^(espn|espn2|espnu|abc|espn deportes)\b/i, 'https://www.espn.com/watch/'],
  [/prime video|amazon/i, 'https://www.primevideo.com/'],
  [/^nbc\b|peacock/i, 'https://www.peacocktv.com/'],
  [/nba tv|league pass/i, IS_W ? 'https://www.wnba.com/' : 'https://www.nba.com/watch'],
  [/^(tnt|tbs|trutv)\b/i, 'https://www.tntsports.com/'],
  [/^ion\b/i, 'https://iontelevision.com/'],
  [/^cbs\b|paramount/i, 'https://www.paramountplus.com/'],
  [/^dazn\b/i, 'https://www.dazn.com/'],
];
function watchCard(d, sides) {
  const bc = d.header?.competitions?.[0]?.broadcasts || [];
  if (!bc.length) return '';
  const groups = [['National', x => x.isNational || /national/i.test(x.market?.type || '')], [`${sides[0].abbr} local`, x => /away/i.test(x.market?.type || '')], [`${sides[1].abbr} local`, x => /home/i.test(x.market?.type || '')]];
  const seen = new Set();
  const chip = x => {
    const name = x.media?.shortName || x.station || ''; if (!name) return '';
    const url = WATCH_LINKS.find(([re]) => re.test(name))?.[1];
    const kind = x.type?.shortName === 'Subscription Package' ? 'Package' : x.type?.shortName || '';
    return url ? `<a class="wt" href="${url}" target="_blank" rel="noopener"><b>${esc(name)}</b>${kind ? `<small>${esc(kind)}</small>` : ''}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg></a>`
      : `<span class="wt"><b>${esc(name)}</b>${kind ? `<small>${esc(kind)}</small>` : ''}</span>`;
  };
  const rows = groups.map(([label, test]) => {
    const items = bc.filter(x => test(x) && !seen.has(x.media?.shortName) && seen.add(x.media?.shortName));
    return items.length ? `<div class="wt-row"><span class="wt-l">${esc(label)}</span><div class="wt-c">${items.map(chip).join('')}</div></div>` : '';
  }).join('');
  return rows ? `<div class="card watch"><div class="card-h"><h4>Where to watch</h4><span class="eyebrow">Official links open in a new tab</span></div>${rows}</div>` : '';
}

/* ---------------- highlight clips (ESPN) ---------------- */
function clipList(d) {
  return (d.videos || []).map(v => {
    const src = v.links?.source || {};
    const mp4 = src.HD?.href || src.href || src.full?.href || '';
    return mp4 ? { id: String(v.id), title: v.headline || v.description || 'Highlight', dur: v.duration || 0, thumb: v.thumbnail || '', mp4, web: v.links?.web?.href || '' } : null;
  }).filter(Boolean).slice(0, 8);
}
const durText = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const COURT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M12 5v14"/><circle cx="12" cy="12" r="2.6"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 8 5.5Z"/></svg>';
function clipsCard(clips) {
  if (!clips.length) return '';
  const c = clips[0];
  return `<div class="card clips" data-clips="${esc(clips.map(x => x.id).join(','))}">
    <div class="card-h"><h4>Highlights</h4><span class="eyebrow">Plays muted · tap the speaker for sound</span></div>
    <div class="clip-stage">
      <video class="clip-v" preload="none" muted playsinline webkit-playsinline disablepictureinpicture poster="${esc(c.thumb)}" data-i="0"></video>
      <button class="clip-go" data-clipplay aria-label="Play ${esc(c.title)}"><span class="clip-btn">${PLAY_ICON}</span></button>
      <div class="clip-cap"><b>${esc(c.title)}</b><span>${durText(c.dur)}</span></div>
    </div>
    ${clips.length > 1 ? `<div class="clip-list hs drag-x" data-drag>${clips.map((x, i) => `
      <button class="clip-t${i === 0 ? ' on' : ''}" data-clip="${i}">
        <span class="ct-img">${x.thumb ? `<img src="${esc(x.thumb)}" alt="" loading="lazy" draggable="false">` : ''}<em>${durText(x.dur)}</em></span>
        <span class="ct-txt">${esc(x.title)}</span>
      </button>`).join('')}</div>` : ''}
  </div>`;
}
// keep a playing clip alive while live games refresh around it
function wireClips(root, clips, keep) {
  const card = $('.clips', root); if (!card) return null;
  if (keep && keep.dataset.clips === card.dataset.clips) { card.replaceWith(keep); return keep; }
  card._clips = clips;
  return card;
}
function playClip(card, i, autoplay = true) {
  const clips = card._clips || []; const c = clips[i]; if (!c) return;
  const v = $('.clip-v', card);
  const wasMuted = card._touched ? v.muted : true;
  v.dataset.i = i;
  v.poster = c.thumb || '';
  v.src = c.mp4;
  v.muted = wasMuted; v.defaultMuted = true;
  v.controls = true;
  card.classList.add('playing');
  $('.clip-cap b', card).textContent = c.title; $('.clip-cap span', card).textContent = durText(c.dur);
  $$('.clip-t', card).forEach((b, k) => b.classList.toggle('on', k === i));
  if (!v._wired) {
    v._wired = true;
    v.addEventListener('volumechange', () => { card._touched = true; });
    v.addEventListener('error', () => {
      const cc = (card._clips || [])[+v.dataset.i];
      card.classList.remove('playing');
      $('.clip-stage', card).insertAdjacentHTML('beforeend', `<div class="clip-err">This clip can't play here.${cc?.web ? ` <a href="${esc(cc.web)}" target="_blank" rel="noopener">Watch on ESPN</a>` : ''}</div>`);
    });
  }
  $('.clip-err', card)?.remove();
  if (autoplay) v.play().catch(() => {});
}

/* ---------------- pre-game preview ---------------- */
function preSide(d, sides) {
  let html = '';
  const pr = d.predictor;
  const hp = parseFloat(pr?.homeTeam?.gameProjection), ap = parseFloat(pr?.awayTeam?.gameProjection);
  // Fullcourt's own number (the Playoff Odds / Bracketology model), next to ESPN's
  const fh = S.wpPre?.[d.header?.id], fc = Number.isFinite(fh) ? `<p class="wc-fc"><span>Fullcourt's projection</span><b>${esc((fh >= 0.5 ? sides[1] : sides[0]).abbr)} ${Math.round(Math.max(fh, 1 - fh) * 100)}%</b></p>` : '';
  if (Number.isFinite(hp) && Number.isFinite(ap) && hp + ap > 0) {
    const h = hp / (hp + ap) * 100;
    html += `<div class="card"><div class="card-h"><h4>Win chance</h4><span class="eyebrow">ESPN matchup predictor</span></div>
      <div class="wc"><span class="wc-a"><b>${ap.toFixed(1)}%</b>${esc(sides[0].abbr)}</span><span class="wc-h"><b>${hp.toFixed(1)}%</b>${esc(sides[1].abbr)}</span></div>
      <div class="wc-bar"><i style="width:${(100 - h).toFixed(1)}%;background:var(--sideA)"></i><i style="width:${h.toFixed(1)}%;background:var(--sideB)"></i></div>${fc}</div>`;
  } else if (fc) {
    const h = fh * 100;
    html += `<div class="card"><div class="card-h"><h4>Win chance</h4><span class="eyebrow">Fullcourt's projection</span></div>
      <div class="wc"><span class="wc-a"><b>${(100 - h).toFixed(0)}%</b>${esc(sides[0].abbr)}</span><span class="wc-h"><b>${h.toFixed(0)}%</b>${esc(sides[1].abbr)}</span></div>
      <div class="wc-bar"><i style="width:${(100 - h).toFixed(1)}%;background:var(--sideA)"></i><i style="width:${h.toFixed(1)}%;background:var(--sideB)"></i></div></div>`;
  }
  const l5 = d.lastFiveGames || [];
  const rowFor = s => {
    const t = l5.find(x => x.team?.id === s.id); if (!t?.events?.length) return '';
    const ev = t.events.slice().sort((x, y) => new Date(x.gameDate) - new Date(y.gameDate)).slice(-5);
    const w = ev.filter(e => e.gameResult === 'W').length;
    return `<div class="form-row"><span class="fr-t">${logo(s.abbr, 40)}<b>${esc(s.abbr)}</b><span>${w}-${ev.length - w}</span></span>
      <span class="fr-g">${ev.map(e => `<button class="fg ${e.gameResult === 'W' ? 'w' : e.gameResult === 'L' ? 'l' : ''}" data-game="${esc(e.id)}" title="${esc(`${fmtShortDate(e.gameDate)} ${e.atVs} ${e.opponent?.abbreviation || ''} · ${e.gameResult || ''} ${e.score || ''}`)}"><b>${esc(e.gameResult || '–')}</b><span>${esc(e.atVs === '@' ? '@' : 'v')}${esc(e.opponent?.abbreviation || '')}</span></button>`).join('')}</span></div>`;
  };
  const form = sides.map(rowFor).join('');
  if (form) html += `<div class="card"><div class="card-h"><h4>Last 5 games</h4><span class="eyebrow">Oldest → newest</span></div>${form}</div>`;
  const ss = d.seasonseries?.[0];
  const met = (ss?.events || []).filter(e => e.id !== d.header?.id);
  if (ss && met.length) {
    html += `<div class="card"><div class="card-h"><h4>Season series</h4><span class="eyebrow">${esc(ss.summary || '')}</span></div>
      ${met.map(e => {
        const c = e.competitors || [];
        const a = c.find(x => x.homeAway === 'away'), h = c.find(x => x.homeAway === 'home');
        const done = e.statusType?.state === 'post' || e.status === 'post';
        return `<button class="ser" data-game="${esc(e.id)}"><span>${esc(fmtShortDate(e.date))}</span><b>${esc(a?.team?.abbreviation || '')} ${done ? esc(a?.score ?? '') : ''}</b><i>@</i><b>${esc(h?.team?.abbreviation || '')} ${done ? esc(h?.score ?? '') : ''}</b><span>${done ? 'Final' : esc(fmtTime(e.date))}</span></button>`;
      }).join('')}</div>`;
  }
  return html;
}
function statEdges(d, sides) {
  const bt = d.boxscore?.teams || [];
  if (bt.length < 2) return '';
  const A = bt.find(t => t.team?.id === sides[0].id), Hm = bt.find(t => t.team?.id === sides[1].id);
  if (!A || !Hm) return '';
  const want = [['Points Per Game', 'Points', 1], ['Points Against', 'Points allowed', -1], ['Field Goal %', 'FG%', 1], ['Three Point %', '3P%', 1], ['Rebounds Per Game', 'Rebounds', 1], ['Assists Per Game', 'Assists', 1], ['Steals Per Game', 'Steals', 1], ['Blocks Per Game', 'Blocks', 1], ['Total Turnovers Per Game', 'Turnovers', -1]];
  const get = (T, l) => T.statistics?.find(s => s.label === l || s.displayName === l);
  const rows = want.map(([key, lab, dir]) => {
    const a = get(A, key), h = get(Hm, key); if (!a || !h) return null;
    const av = parseFloat(a.displayValue), hv = parseFloat(h.displayValue);
    if (!Number.isFinite(av) || !Number.isFinite(hv) || (!av && !hv)) return null;
    const rel = Math.abs(av - hv) / (Math.max(Math.abs(av), Math.abs(hv)) || 1);
    return { lab, dir, a: a.displayValue, h: h.displayValue, av, hv, rel };
  }).filter(Boolean).sort((x, y) => y.rel - x.rel).slice(0, 5);
  if (!rows.length) return '';
  return `<div class="card"><div class="card-h"><h4>Biggest edges</h4><span class="eyebrow">Season averages</span></div><div class="cmp">
    <div class="cmp-row"><span class="l">${esc(sides[0].abbr)}</span><span></span><span class="r">${esc(sides[1].abbr)}</span></div>
    ${rows.map(r => {
      const m = Math.max(r.av, r.hv) || 1;
      const aw = r.dir > 0 ? r.av > r.hv : r.av < r.hv, hw = r.dir > 0 ? r.hv > r.av : r.hv < r.av;
      return `<div class="cmp-row"><span class="l" style="${aw ? '' : 'color:var(--muted)'}">${esc(r.a)}</span>
        <div class="mid"><span>${esc(r.lab)}${r.dir < 0 ? ' <small>(fewer is better)</small>' : ''}</span><div class="cmp-bars"><div><i data-w="${r.av / m * 100}" style="background:var(--sideA)"></i></div><div><i data-w="${r.hv / m * 100}" style="background:var(--sideB)"></i></div></div></div>
        <span class="r" style="${hw ? '' : 'color:var(--muted)'}">${esc(r.h)}</span></div>`;
    }).join('')}</div></div>`;
}

/* ---------------- big nights (40-point games, triple-doubles, comebacks), shown inside the game ---------------- */
// an old version cached these per game; clear that leftover
try { localStorage.removeItem(lsKey('fc-bn')); } catch (e) {}
function bigNight(d) {
  const comp = d.header?.competitions?.[0];
  const state = comp?.status?.type?.state;
  if (!comp || state === 'pre') return null;
  const out = [];
  for (const T of d.boxscore?.players || []) {
    const st = T.statistics?.[0]; if (!st) continue;
    const lab = st.labels || st.names || [];
    for (const a of st.athletes || []) {
      if (!a.stats?.length) continue;
      const v = k => { const i = lab.indexOf(k); return i >= 0 ? (parseInt(a.stats[i], 10) || 0) : 0; };
      const nm = a.athlete?.shortName || a.athlete?.displayName || '';
      const pts = v('PTS');
      const tens = ['PTS', 'REB', 'AST', 'STL', 'BLK'].filter(k => v(k) >= 10).length;
      if (tens >= 3) out.push({ k: 'td', s: 3, label: tens >= 4 ? 'Quadruple-double' : 'Triple-double', who: `${nm} ${pts} pts, ${v('REB')} reb, ${v('AST')} ast` });
      if (pts >= BIG_PTS) out.push({ k: 'pts', s: pts >= 50 ? 4 : 2, label: `${pts}-pt game`, who: `${nm} scored ${pts}` });
    }
  }
  const cs = comp.competitors || [];
  const home = cs.find(c => c.homeAway === 'home'), away = cs.find(c => c.homeAway === 'away');
  let downH = 0, downA = 0;
  for (const p of d.plays || []) {
    const a = +p.awayScore, h = +p.homeScore;
    if (!Number.isFinite(a) || !Number.isFinite(h)) continue;
    downH = Math.max(downH, a - h); downA = Math.max(downA, h - a);
  }
  const hs = +home?.score, as = +away?.score;
  const leader = state === 'post' ? cs.find(c => c.winner) : hs > as ? home : as > hs ? away : null;
  if (leader) {
    const def = leader === home ? downH : downA;
    if (def >= BIG_COMEBACK) out.push({ k: 'cb', s: 1, label: state === 'post' ? `${def}-pt comeback` : `Erased ${def}-pt deficit`, who: `${leader.team?.abbreviation || ''} ${state === 'post' ? 'came back from' : 'has come back from'} ${def} down` });
  }
  out.sort((a, b) => b.s - a.s);
  return { list: out, fin: state === 'post' };
}
/* ---------------- favorite-team alerts ---------------- */
let alertsOn = lsGet(lsKey('fc-alerts')) === '1';
const canNotify = () => 'Notification' in window;
const BELL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
function alertBtnHTML() {
  const on = alertsOn && canNotify() && Notification.permission === 'granted';
  return `<button class="fav-btn alert-btn${on ? ' on' : ''}" data-alerts aria-pressed="${on}" title="${on ? 'Game alerts are on' : 'Get alerts for this team'}">${BELL}<span>${on ? 'Alerts on' : 'Alerts'}</span></button>`;
}
async function toggleAlerts() {
  if (alertsOn && canNotify() && Notification.permission === 'granted') { alertsOn = false; }
  else {
    if (!canNotify()) {
      toast(/iPhone|iPad/.test(navigator.userAgent) ? 'On iPhone, add Fullcourt to your Home Screen first, then turn alerts on there' : "This browser can't show alerts");
      return;
    }
    let p = Notification.permission;
    if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) {} }
    if (p !== 'granted') { toast('Alerts are blocked for this site in your browser settings'); return; }
    alertsOn = true;
  }
  lsSet(lsKey('fc-alerts'), alertsOn ? '1' : null);
  $$('[data-alerts]').forEach(b => { b.outerHTML = alertBtnHTML(); });
  toast(alertsOn ? `You'll get alerts when ${S.teams[favId]?.short || 'your team'} tips off, goes to overtime, or is in a close finish` : 'Game alerts off');
  if (alertsOn) alertTick(true);
}
async function notify(title, body, gameId) {
  const opts = { body, tag: `fc-${gameId}`, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: { game: gameId, lg: LG } };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.active) { await reg.showNotification(title, opts); return; }
  } catch (e) {}
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); openGame(gameId); n.close(); }; } catch (e) {}
}
function alertCheck(games) {
  if (!alertsOn || !favId || !canNotify() || Notification.permission !== 'granted') return;
  for (const g of games.filter(isFavGame)) {
    const k = `fc-al-${g.id}`;
    let f = null; try { f = JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) {}
    const fresh = !f; f = f || {};
    const me = g.home.id === favId ? g.home : g.away, op = me === g.home ? g.away : g.home;
    const line = `${g.away.abbr} ${g.away.score ?? 0} – ${g.home.abbr} ${g.home.score ?? 0}`;
    const send = (flag, title, body, okWhenFresh = false) => { if (f[flag]) return; f[flag] = 1; if (!fresh || okWhenFresh) notify(title, body, g.id); };
    if (g.state === 'in') {
      const clk = clockSecs(g.clock);
      send('start', `${me.name} game is on`, `${g.away.abbr} @ ${g.home.abbr} just tipped off`, g.period === 1 && clk > QP - 240);
      if (g.period > REG_PERIODS) send('ot', 'Overtime', `${line} · heading to ${perLabel(g.period)}`);
      if (g.period >= REG_PERIODS && clk <= 300 && clk > 0 && Math.abs((+g.home.score || 0) - (+g.away.score || 0)) <= 5) send(`close${g.period}`, 'Close game', `${line} · ${perLabel(g.period)} ${g.clock} left`);
    }
    if (g.state === 'post' && f.start) send('final', `${upsetOf(g) ? 'Upset! ' : ''}Final: ${+me.score > +op.score ? me.name + ' win' : me.name + ' lose'}`, line);
    try { sessionStorage.setItem(k, JSON.stringify(f)); } catch (e) {}
  }
}
let alertTimer = 0;
async function alertTick(force) {
  clearTimeout(alertTimer);
  if (alertsOn && favId) {
    const usingToday = S.date === S.today && Date.now() - S.lastUpdate < 60e3 && !document.hidden;
    if (!usingToday || force) {
      try { alertCheck(await scoreboardOn(S.today)); } catch (e) {}
    }
  }
  alertTimer = setTimeout(alertTick, 45000);
}

/* ---------------- minimizable cards ---------------- */
const MIN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 15 6-6 6 6"/></svg>';
function addMinimize(root) {
  $$('.card > .card-h', root).forEach(h => {
    if (h._min || !h.querySelector(':scope > h4')) return;
    h._min = true;
    const r = document.createElement('div'); r.className = 'ch-r';
    [...h.children].filter(c => c.tagName !== 'H4').forEach(c => r.appendChild(c));
    const b = document.createElement('button'); b.className = 'min-btn'; b.title = 'Minimize'; b.setAttribute('aria-expanded', 'true'); b.innerHTML = MIN_ICON;
    r.appendChild(b); h.appendChild(r);
    const card = h.parentElement; if (card.classList.contains('min')) b.setAttribute('aria-expanded', 'false');
    const flip = e => { e.stopPropagation(); const m = card.classList.toggle('min'); b.setAttribute('aria-expanded', !m); b.title = m ? 'Expand' : 'Minimize'; };
    b.addEventListener('click', flip); h.querySelector(':scope > h4').addEventListener('click', flip);
  });
}

/* ---------------- player trends: last 10 games + splits ---------------- */
async function playerTrends(id, box, seasonAvg) {
  let log = [], sp = null;
  try { [log, sp] = await Promise.all([gameLog(id), getJSON(`${WEB}/athletes/${id}/splits`).catch(() => null)]); }
  catch (e) { box.remove(); return; }
  if (!box.isConnected) return;
  const games = log.slice(0, 10).reverse();
  let html = '';
  if (games.length >= 2) {
    const avg = k => log.reduce((s, g) => s + g[k], 0) / log.length;
    const cats = [['pts', 'PTS', 'Points'], ['reb', 'REB', 'Rebounds'], ['ast', 'AST', 'Assists']];
    const whole = log.length <= games.length; // the chart already shows every game this season
    box._games = games; box._avg = Object.fromEntries(cats.map(([k]) => [k, avg(k)]));
    html += `<div class="card trend"><div class="card-h"><h4>Last ${games.length} games</h4>
      <div class="seg" data-trseg><span class="knob"></span>${cats.map(([k, l], i) => `<button data-tr="${k}" aria-pressed="${i === 0}">${l}</button>`).join('')}</div></div>
      <div class="tr-chart"></div>
      <div class="tr-sum">${cats.map(([k, l]) => { const l10 = games.reduce((s, g) => s + g[k], 0) / games.length; const d = l10 - box._avg[k]; return `<span>${l} <b>${l10.toFixed(1)}</b>${whole ? '' : ` <em class="${d >= 0.05 ? 'up' : d <= -0.05 ? 'down' : ''}">${d >= 0 ? '+' : ''}${d.toFixed(1)} vs season</em>`}</span>`; }).join('')}</div>
    </div>`;
  }
  if (IS_C) html += '<div class="card splits-card csplits"></div>'; // college: splits built from the game logs (conference, ranked opponents, months, career highs)
  else if (sp?.splitCategories) { box._sp = sp; html += '<div class="card splits-card"></div>'; }
  if (!IS_C && log.length) html += '<div class="card splits-card mates-card"></div>'; // with / without teammates, loaded when it scrolls into view
  if (LGK === 'nba') html += '<div class="card splits-card contract-card"></div>'; // Capsheet contract, loaded when it scrolls into view
  if (!html) { box.remove(); return; }
  box.innerHTML = html;
  box.classList.add('in');
  wireDrag(box);
  const seg = $('[data-trseg]', box);
  if (seg) { placeKnob(seg); drawTrend(box, 'pts'); seg.addEventListener('click', e => { const b = e.target.closest('[data-tr]'); if (!b) return; $$('button', seg).forEach(x => x.setAttribute('aria-pressed', x === b)); placeKnob(seg); drawTrend(box, b.dataset.tr); }); }
  const kc = $('.contract-card', box);
  if (kc) { const io2 = new IntersectionObserver(es => { if (!es.some(x => x.isIntersecting)) return; io2.disconnect(); lazy('cap').then(m => m.drawContract(kc, id)).catch(() => kc.remove()); }, { rootMargin: '300px' }); io2.observe(kc); }
  const mc = $('.mates-card', box);
  if (mc) { const io = new IntersectionObserver(es => { if (!es.some(x => x.isIntersecting)) return; io.disconnect(); lazy('mates').then(m => m.drawMates(mc, id)).catch(() => mc.remove()); }, { rootMargin: '300px' }); io.observe(mc); }
  const sc = $('.splits-card:not(.mates-card):not(.contract-card)', box);
  const slot = box.parentElement?.querySelector('.splits-slot');
  if (sc && slot) { slot.replaceWith(sc); if (!box.children.length) box.remove(); }
  if (sc && IS_C) lazy('csplits').then(m => m.drawCollegeSplits(sc, id)).catch(() => sc.remove());
  else if (sc) { drawSplits(sc, box._sp); const onAdv = () => { if (!sc.isConnected) { document.removeEventListener('fcadv', onAdv); return; } drawSplits(sc, box._sp); }; document.addEventListener('fcadv', onAdv); }
}
// Splits card: basic per-game numbers, or advanced (shooting efficiency, shot profile, per-36)
function drawSplits(card, sp) {
  const lab = sp.labels || [];
  const pickRows = [['split', /^all splits$/i, 'Season'], ['split', /^home$/i, 'Home'], ['split', /^road$|^away$/i, 'Away'], ['byResult', /^wins?$/i, 'Wins'], ['byResult', /^loss/i, 'Losses']];
  const found = pickRows.map(([cat, re, name]) => { const s = sp.splitCategories.find(c => c.name === cat)?.splits?.find(x => re.test(x.displayName || '')); return s ? { name, s: s.stats } : null; }).filter(Boolean);
  if (!found.length) { card.remove(); return; }
  const g = (r, k) => r.s[lab.indexOf(k)];
  let cols, rows;
  if (!advOn) {
    cols = ['GP', 'MIN', 'PTS', 'REB', 'AST', 'FG%', '3P%'].filter(c => lab.includes(c));
    rows = found.map(r => ({ name: r.name, v: cols.map(c => g(r, c)) }));
  } else {
    cols = ['GP', 'TS%', 'eFG%', '3PA rate', 'FT rate', 'AST/TO', 'PTS/36', 'REB/36', 'AST/36'];
    rows = found.map(r => {
      const [fgm, fga] = splitMA(g(r, 'FG')), [tpm, tpa] = splitMA(g(r, '3PT')), [, fta] = splitMA(g(r, 'FT'));
      const n = k => parseFloat(g(r, k)) || 0, min = n('MIN'), per = k => min ? advNum(n(k) * 36 / min) : '–';
      return { name: r.name, v: [g(r, 'GP'), advPct(tsPct(n('PTS'), fga, fta)), advPct(efgPct(fgm, tpm, fga)), fga ? advPct(tpa / fga) : '–', fga ? advPct(fta / fga) : '–', advNum(astTo(n('AST'), n('TO'))), per('PTS'), per('REB'), per('AST')] };
    });
  }
  card.innerHTML = `<div class="card-h"><h4>Splits</h4>${advBtn()}</div>${advOn ? '<p class="adv-note">TS% true shooting · eFG% effective FG · 3PA and FT rate per shot · per 36 minutes</p>' : ''}<div class="box-wrap drag-x" data-drag><table class="split-tbl">
    <thead><tr><th></th>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td>${r.v.map(x => `<td>${esc(x ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  wireDrag(card);
}
function drawTrend(box, k) {
  const games = box._games || [], avg = box._avg?.[k] || 0;
  const max = Math.max(1, avg, ...games.map(g => g[k]));
  const top = Math.ceil(max / 5) * 5 || 5;
  $('.tr-chart', box).innerHTML = `<div class="tr-leg"><i></i>Season average ${avg.toFixed(1)}</div><div class="tr-plot" style="--n:${games.length}">
      <span class="tr-avg" style="bottom:${(avg / top * 100).toFixed(1)}%"></span>
      ${games.map((g, i) => `<button class="tr-col" data-game="${esc(g.id)}" title="${esc(`${fmtShortDate(g.date)} ${g.atVs} ${g.opp} · ${g.res} ${g.score} · ${g.pts} pts, ${g.reb} reb, ${g.ast} ast in ${g.min} min`)}">
        <span class="tr-bar${g[k] >= avg ? ' hi' : ''}" style="--h:${(g[k] / top * 100).toFixed(1)}%;--i:${i}"><b>${g[k]}</b></span>
        <span class="tr-x"><i class="${g.res === 'W' ? 'w' : g.res === 'L' ? 'l' : ''}"></i>${esc(g.atVs === '@' ? '@' : '')}${esc(g.opp)}</span>
      </button>`).join('')}
    </div>`;
}

/* ---------------- team schedule calendar ---------------- */
const etYmd = iso => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso)).map(x => [x.type, x.value])); return `${p.year}${p.month}${p.day}`; };
function calInfo(evs) {
  const list = evs.map(e => ({ ...e, ymd: etYmd(e.date) })).sort((a, b) => a.ymd.localeCompare(b.ymd));
  list.forEach((e, i) => {
    const prev = list[i - 1];
    e.rest = prev ? Math.round((fromYmd(e.ymd) - fromYmd(prev.ymd)) / 864e5) - 1 : null;
    e.b2b = e.rest === 0;
  });
  // road trips: 3 or more away games in a row
  for (let i = 0; i < list.length;) {
    if (list[i].home) { i++; continue; }
    let j = i; while (j < list.length && !list[j].home) j++;
    if (j - i >= 3) for (let k = i; k < j; k++) { list[k].trip = j - i; list[k].tripPos = k === i ? 'first' : k === j - 1 ? 'last' : 'mid'; }
    i = j;
  }
  return list;
}
function calHTML(info, ym) {
  const y = +ym.slice(0, 4), m = +ym.slice(4, 6);
  const first = new Date(Date.UTC(y, m - 1, 1, 12)), days = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  const byDay = new Map(info.map(e => [e.ymd, e]));
  const inMonth = info.filter(e => e.ymd.slice(0, 6) === ym);
  const months = [...new Set(info.map(e => e.ymd.slice(0, 6)))];
  const mi = months.indexOf(ym);
  const cells = [];
  for (let i = 0; i < first.getUTCDay(); i++) cells.push('<span class="cd pad"></span>');
  const today = S.today;
  for (let dd = 1; dd <= days; dd++) {
    const key = `${ym}${String(dd).padStart(2, '0')}`, e = byDay.get(key);
    if (!e) { cells.push(`<span class="cd${key === today ? ' today' : ''}"><span class="dn">${dd}</span></span>`); continue; }
    const res = e.state === 'post' ? `<span class="cr ${e.win ? 'w' : 'l'}">${e.win ? 'W' : 'L'}<span> ${esc(e.my)}-${esc(e.their)}</span></span>` : e.state === 'in' ? '<span class="cr live">Live</span>' : `<span class="cr t">${esc(fmtTime(e.date, true).replace(':00', ''))}</span>`;
    cells.push(`<button class="cd g${e.home ? '' : ' away'}${e.trip ? ' trip ' + e.tripPos : ''}${key === today ? ' today' : ''}" data-game="${esc(e.id)}" title="${esc(`${fmtShortDate(e.date)} · ${e.home ? 'vs' : '@'} ${e.op.displayName || e.op.abbreviation}${e.b2b ? ' · 2nd night of a back-to-back' : e.rest != null ? ` · ${e.rest} day${e.rest === 1 ? '' : 's'} rest` : ''}${e.trip ? ` · ${e.trip}-game road trip` : ''}`)}">
      <span class="dn">${dd}${e.b2b ? '<em class="b2b">B2B</em>' : ''}</span>
      <span class="co">${logo(e.op.abbreviation, 40)}<span>${e.home ? 'vs' : '@'}${esc(e.op.abbreviation)}</span></span>${res}</button>`);
  }
  const home = inMonth.filter(e => e.home).length, b2b = inMonth.filter(e => e.b2b).length;
  const trips = []; inMonth.forEach(e => { if (e.tripPos === 'first') trips.push(e.trip); });
  const label = first.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  return `<div class="card-h"><h4 class="h-display" style="font-size:18px;margin:0">Calendar</h4>
      <div class="cal-nav"><button class="icon-btn" data-calm="-1" aria-label="Previous month" ${mi <= 0 ? 'disabled' : ''}>${ICON.back}</button><b>${esc(label)}</b><button class="icon-btn" data-calm="1" aria-label="Next month" ${mi >= months.length - 1 ? 'disabled' : ''}><span style="display:grid;transform:scaleX(-1)">${ICON.back}</span></button></div></div>
    <div class="cal-sum"><span><b>${inMonth.length}</b> games</span><span><b>${home}</b> home · <b>${inMonth.length - home}</b> away</span><span><b>${b2b}</b> back-to-back${b2b === 1 ? '' : 's'}</span>${trips.length ? `<span>Road trip <b>${Math.max(...trips)}</b> games</span>` : ''}</div>
    <div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(w => `<span class="cw">${w}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-key"><span><i class="k-away"></i>Away</span><span><i class="k-trip"></i>Road trip (3+)</span><span><em class="b2b">B2B</em>Back-to-back</span></div>`;
}

/* ---------------- home-screen app: service worker + notification taps ---------------- */
if (!IS_APP && 'serviceWorker' in navigator && /^https:$|^http:$/.test(location.protocol) && !location.pathname.startsWith('/__')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.game && (!e.data.lg || e.data.lg === LG)) openGame(String(e.data.game)); });
}


/* =====================================================================
   UPGRADES 3: player watchlist, who's out, line movement,
   pick'em, recaps, team rankings
   ===================================================================== */

/* ---------------- shared: game details with a short memory ---------------- */
S.sum = {};
async function summaryCached(id, ttl = 20000) {
  const c = S.sum[id];
  if (c && (c.fin || Date.now() - c.t < ttl)) return c.d;
  const d = await getJSON(`${API}/summary?event=${id}`, { retries: 0, timeout: 15000 });
  S.sum[id] = { d, t: Date.now(), fin: d.header?.competitions?.[0]?.status?.type?.state === 'post' };
  const keys = Object.keys(S.sum); if (keys.length > 16) delete S.sum[keys[0]];
  return d;
}

/* ---------------- line movement ---------------- */
const lineNum = v => { const m = /[-+]?\d+(\.\d+)?/.exec(String(v ?? '')); return m ? parseFloat(m[0]) : null; };
function lineMoves(o) {
  if (!o) return null;
  const favK = o.fav || (lineNum(o.home.spread) < 0 ? 'home' : 'away');
  const f = o[favK];
  const sNow = lineNum(f?.spread), sOpen = lineNum(f?.spreadOpen);
  const tNow = lineNum(o.over?.line), tOpen = lineNum(o.over?.open);
  return {
    favK,
    spread: sNow != null && sOpen != null ? { now: sNow, open: sOpen, d: sOpen - sNow } : null, // d > 0: the favorite got more points
    total: tNow != null && tOpen != null ? { now: tNow, open: tOpen, d: tNow - tOpen } : null,
    ml: ['away', 'home'].map(k => ({ k, now: o[k]?.ml, open: o[k]?.mlOpen })),
  };
}
const moveTag = (d, title) => !d ? '' : `<em class="mvt ${d > 0 ? 'up' : 'dn'}" title="${esc(title)}">${d > 0 ? '▲' : '▼'}${Math.abs(d) % 1 ? Math.abs(d).toFixed(1) : Math.abs(d)}</em>`;
function lineMoveCard(o, sides) {
  const m = lineMoves(o); if (!m) return '';
  const fav = m.favK === 'home' ? sides[1] : sides[0], dog = fav === sides[1] ? sides[0] : sides[1];
  const rows = [];
  if (m.spread) {
    const fmt = v => (v > 0 ? '+' : '') + v;
    const what = !m.spread.d ? 'No change' : m.spread.open > 0 && m.spread.now < 0 ? `${esc(fav.abbr)} flipped to favorite` : m.spread.d > 0 ? `${esc(fav.abbr)} more favored` : `Moved toward ${esc(dog.abbr)}`;
    rows.push(`<div class="lm"><span>Spread</span><b>${esc(fav.abbr)} ${fmt(m.spread.open)} → ${fmt(m.spread.now)}</b><i class="${m.spread.d ? (m.spread.d > 0 ? 'up' : 'dn') : ''}">${what}</i></div>`);
  }
  if (m.total) {
    const what = !m.total.d ? 'No change' : `${m.total.d > 0 ? 'Up' : 'Down'} ${Math.abs(m.total.d)}`;
    rows.push(`<div class="lm"><span>Total</span><b>${m.total.open} → ${m.total.now}</b><i class="${m.total.d ? (m.total.d > 0 ? 'up' : 'dn') : ''}">${what}</i></div>`);
  }
  const mls = m.ml.filter(x => x.now && x.open);
  if (mls.length) rows.push(`<div class="lm"><span>Moneyline</span><b>${mls.map(x => `${esc((x.k === 'home' ? sides[1] : sides[0]).abbr)} ${esc(x.open)} → ${esc(x.now)}`).join('<br>')}</b><i></i></div>`);
  if (!rows.length) return '';
  return `<div class="card odds-card"><div class="card-h"><h4>Line movement</h4><span class="eyebrow">Open → now${o.provider ? ' · ' + esc(o.provider) : ''}</span></div><div class="lms">${rows.join('')}</div></div>`;
}

/* ---------------- my players (watchlist) ---------------- */
let watch = [];
try { watch = JSON.parse(lsGet(lsKey('fc-watch')) || '[]') || []; } catch (e) { watch = []; }
const isWatched = id => watch.some(w => String(w.id) === String(id));
const STAR = on => `<svg viewBox="0 0 24 24" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z"/></svg>`;
function watchBtnHTML(id, hero) {
  const on = isWatched(id);
  // the player page shows it as a pill in the banner's corner, like a team page's "Your team" button
  if (hero) return `<button class="fav-btn${on ? ' on' : ''}" data-watch="${esc(id)}" data-whero aria-pressed="${on}">${on ? '★ In your players' : '☆ Add to your players'}</button>`;
  return `<button class="btn ${on ? '' : 'ghost'} watch-btn" data-watch="${esc(id)}" aria-pressed="${on}">${STAR(on)}${on ? 'In your players' : 'Add to your players'}</button>`;
}
function toggleWatch(id, info) {
  if (isWatched(id)) watch = watch.filter(w => String(w.id) !== String(id));
  else if (info) watch.push(info);
  lsSet(lsKey('fc-watch'), watch.length ? JSON.stringify(watch) : null);
  $$(`[data-watch="${id}"]`).forEach(b => { b.outerHTML = watchBtnHTML(id, 'whero' in b.dataset); });
  toast(isWatched(id) ? `${info?.name || 'Player'} added to your players on the Scores page` : 'Removed from your players');
  renderWatch(true);
}
// one player's line from a game's box score
function lineFromBox(d, pid) {
  for (const T of d?.boxscore?.players || []) {
    const st = T.statistics?.[0]; if (!st) continue;
    const a = (st.athletes || []).find(x => String(x.athlete?.id) === String(pid)); if (!a) continue;
    const lab = st.labels || st.names || [], v = k => a.stats?.[lab.indexOf(k)];
    if (!a.stats?.length) return { dnp: true, reason: a.reason || (a.didNotPlay ? 'DNP' : 'No stats yet') };
    return { min: v('MIN'), pts: v('PTS'), reb: v('REB'), ast: v('AST'), fg: v('FG'), tp: v('3PT'), stl: v('STL'), blk: v('BLK'), on: !!a.active };
  }
  return null;
}
let watchBusy = false;
async function renderWatch(force) {
  const blk = $('#watchBlock'); if (!blk) return;
  if (!watch.length) { blk.hidden = true; return; }
  blk.hidden = false;
  const gameOf = w => S.games.find(g => g.home.id === w.teamId || g.away.id === w.teamId);
  const card = (w, g, line) => {
    const opp = g ? (g.home.id === w.teamId ? g.away : g.home) : null;
    const at = g && g.away.id === w.teamId ? '@' : 'vs';
    let st = '', body = '';
    if (!g) { st = 'No game'; body = `<span class="wl-avg">${[['PTS', w.pts], ['REB', w.reb], ['AST', w.ast]].filter(([, v]) => v != null && v !== '').map(([k, v]) => `<b>${esc(v)}</b> ${k}`).join(' · ') || 'Season averages unavailable'}</span>`; }
    else if (g.state === 'pre') { st = `${at} ${esc(opp.abbr)} · ${esc(fmtTime(g.date))}`; body = `<span class="wl-avg">Season ${[['PTS', w.pts], ['REB', w.reb], ['AST', w.ast]].filter(([, v]) => v != null && v !== '').map(([k, v]) => `<b>${esc(v)}</b> ${k}`).join(' · ')}</span>`; }
    else {
      st = `${at} ${esc(opp.abbr)} · ${g.state === 'in' ? `<span class="wl-live">${esc(statusText(g))}</span>` : esc(statusText(g))}`;
      if (!line) body = '<span class="wl-avg">Loading line…</span>';
      else if (line.dnp) body = `<span class="wl-avg">${esc(String(line.reason).toLowerCase().replace(/^\w/, c => c.toUpperCase()))}</span>`;
      else body = `<span class="wl-line"><b>${esc(line.pts ?? 0)}</b><small>PTS</small><b>${esc(line.reb ?? 0)}</b><small>REB</small><b>${esc(line.ast ?? 0)}</b><small>AST</small></span><span class="wl-sub">${esc(line.fg || '0-0')} FG · ${esc(line.tp || '0-0')} 3PT · ${esc(line.min || 0)} min${g.state === 'in' && line.on ? ' · <i>on court</i>' : ''}</span>`;
    }
    return `<button class="wl-card${g?.state === 'in' ? ' live' : ''}" data-player="${esc(w.id)}" style="--tc:${teamColor(w.teamId || w.abbr)}">
      ${face(w.id, w.name, 'face', 160)}
      <span class="wl-txt"><b>${esc(w.short || w.name)}</b><span class="wl-st">${logo(w.abbr, 32)}${st}</span>${body}</span>
    </button>`;
  };
  const draw = () => {
    $('#watchStrip').innerHTML = watch.map(w => { const g = gameOf(w); return card(w, g, g && S.watchLines?.[`${g.id}:${w.id}`]); }).join('');
    dragScroll($('#watchStrip'));
  };
  draw();
  if (watchBusy && !force) return;
  watchBusy = true;
  S.watchLines = S.watchLines || {};
  const need = [...new Set(watch.map(gameOf).filter(g => g && g.state !== 'pre').map(g => g.id))];
  await Promise.all(need.map(async id => {
    try {
      const d = await summaryCached(id);
      watch.forEach(w => { const l = lineFromBox(d, w.id); if (l) S.watchLines[`${id}:${w.id}`] = l; });
    } catch (e) {}
  }));
  watchBusy = false;
  if (need.length) draw();
}

/* ---------------- who's out ---------------- */
async function renderOut() {
  const box = $('#outPanel'); if (!box) return;
  const games = S.games.filter(g => g.state !== 'post');
  if (S.date < S.today || !games.length) { box.hidden = true; return; }
  box.hidden = false;
  const body = $('#outBody');
  if (!body.children.length) body.innerHTML = '<div class="sk" style="height:120px"></div>';
  const all = await leagueInjuries();
  if (!all) { body.innerHTML = '<p class="out-none">The injury report is unavailable right now.</p>'; return; }
  const entries = all.injuries || all.teams || [];
  const forTeam = s => (entries.find(e => e.id === s.id || e.team?.id === s.id || e.displayName === s.full || e.team?.displayName === s.full)?.injuries || []).map(normInjury)
    .filter(n => /out|doubt|question|day/i.test(n.status));
  const order = s => /^out/i.test(s) ? 0 : /doubt/i.test(s) ? 1 : /question/i.test(s) ? 2 : 3;
  const cls = s => /^out/i.test(s) ? 'out' : /doubt/i.test(s) ? 'doubt' : 'q';
  let list = (favId ? [...games].sort((a, b) => isFavGame(b) - isFavGame(a)) : games);
  if (IS_C) { const top = list.filter(g => g.home.rank || g.away.rank || isFavGame(g)); if (!top.length) { box.hidden = true; return; } list = top.slice(0, 12); }
  const rows = list.map(g => {
    const teams = [g.away, g.home].map(s => ({ s, l: forTeam(s).sort((a, b) => order(a.status) - order(b.status)) }));
    const n = teams.reduce((k, t) => k + t.l.length, 0);
    const outs = teams.reduce((k, t) => k + t.l.filter(x => /^out/i.test(x.status)).length, 0);
    return `<details class="out-g"${isFavGame(g) ? ' open' : ''}><summary>
        <span class="og-t">${logo(g.away.abbr, 32)}${esc(g.away.abbr)} <i>@</i> ${logo(g.home.abbr, 32)}${esc(g.home.abbr)}</span>
        <span class="og-n">${n ? `${outs ? `<b>${outs} out</b>` : ''}${n - outs ? `${outs ? ' · ' : ''}${n - outs} questionable` : ''}` : 'Full strength'}</span>
        <svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
      </summary>
      <div class="og-b">${teams.map(t => `<div class="og-team"><span class="og-h">${logo(t.s.abbr, 32)}${esc(t.s.name)}</span>${t.l.length ? t.l.map(x => `<button class="og-p" ${x.id ? `data-player="${esc(x.id)}"` : ''}><span>${esc(x.short || x.name)}</span><em class="${cls(x.status)}">${esc(x.status)}</em><small>${esc(x.what)}</small></button>`).join('') : '<span class="og-none">No one listed</span>'}</div>`).join('')}</div>
    </details>`;
  }).join('');
  body.innerHTML = rows;
}

/* ---------------- daily pick'em ---------------- */
let picks = {};
function resetPicks() { picks = {}; savePicks(); renderPicks(); }
function clearWatch() { watch = []; lsSet(lsKey('fc-watch'), null); renderWatch(true); }
try { picks = JSON.parse(lsGet(lsKey('fc-picks')) || '{}') || {}; } catch (e) { picks = {}; }
const savePicks = () => lsSet(lsKey('fc-picks'), JSON.stringify(picks));
function settlePicks(games) {
  let changed = false;
  for (const g of games) {
    const p = picks[g.id]; if (!p || p.res || g.state !== 'post') continue;
    const w = g.home.winner ? g.home.id : g.away.winner ? g.away.id : null; if (!w) continue;
    p.res = p.pick === w ? 'W' : 'L'; changed = true;
  }
  if (changed) savePicks();
  return changed;
}
function pickRecord() {
  const done = Object.values(picks).filter(p => p.res).sort((a, b) => (a.date + (a.t || '')).localeCompare(b.date + (b.t || '')));
  const w = done.filter(p => p.res === 'W').length;
  let streak = 0, kind = '';
  for (let i = done.length - 1; i >= 0; i--) { if (!kind) kind = done[i].res; if (done[i].res !== kind) break; streak++; }
  return { w, l: done.length - w, streak: streak ? `${kind}${streak}` : '' };
}
function renderPicks() {
  const box = $('#pickPanel'); if (!box) return;
  if (!S.games.length) { box.hidden = true; return; }
  box.hidden = false;
  settlePicks(S.games);
  const rec = pickRecord();
  const day = S.games.filter(g => picks[g.id]);
  const dayW = day.filter(g => picks[g.id].res === 'W').length, dayDone = day.filter(g => picks[g.id].res).length;
  $('#pickRec').innerHTML = rec.w + rec.l ? `<b>${rec.w}-${rec.l}</b>${rec.streak ? ` · ${rec.streak}` : ''}` : 'No picks yet';
  let list = [...S.games].sort((a, b) => new Date(a.date) - new Date(b.date));
  // college: just the Top 25 games (plus yours and any you've already picked), not all 100+
  if (IS_C) { const top = list.filter(g => g.home.rank || g.away.rank || isFavGame(g) || picks[g.id]); list = (top.length ? top : list).slice(0, 16); }
  $('#pickBody').innerHTML = list.map(g => {
    const p = picks[g.id], open = g.state === 'pre' && new Date(g.date) > Date.now();
    const side = s => {
      const mine = p?.pick === s.id;
      const res = mine && p.res ? (p.res === 'W' ? ' right' : ' wrong') : '';
      return `<button class="pk-t${mine ? ' on' : ''}${res}" data-pick="${g.id}:${s.id}" ${open ? '' : 'disabled'} aria-pressed="${mine}">${logo(s.abbr, 40)}<b>${esc(s.abbr)}</b>${g.state !== 'pre' ? `<span>${esc(s.score)}</span>` : ''}</button>`;
    };
    const st = g.state === 'pre' ? esc(fmtTime(g.date, true)) : g.state === 'in' ? `<span class="pk-live">${esc(statusText(g))}</span>` : (p?.res ? `<span class="pk-res ${p.res === 'W' ? 'w' : 'l'}">${p.res === 'W' ? '✓' : '✗'}</span>` : 'Final');
    return `<div class="pk-row">${side(g.away)}<i>@</i>${side(g.home)}<span class="pk-st">${st}</span></div>`;
  }).join('') + (day.length ? `<div class="pk-day">${S.date === S.today ? 'Today' : esc(fmtDay(S.date, { weekday: 'long' }))}: ${dayDone ? `${dayW} of ${dayDone} right` : ''}${dayDone && day.length > dayDone ? ' · ' : ''}${day.length > dayDone ? `${day.length - dayDone} pick${day.length - dayDone === 1 ? '' : 's'} waiting on results` : ''}</div>` : `<div class="pk-day">Tap a team to pick the winner. Picks lock at tip-off.</div>`);
}
function makePick(gid, tid) {
  const g = S.games.find(x => x.id === gid);
  if (!g || g.state !== 'pre' || new Date(g.date) <= Date.now()) { toast('Picks lock at tip-off'); renderPicks(); return; }
  if (picks[gid]?.pick === tid) delete picks[gid];
  else picks[gid] = { pick: tid, date: S.date, t: g.date };
  savePicks(); renderPicks();
}
// settle older picks quietly (one scoreboard per past day)
async function settleOldPicks() {
  const days = [...new Set(Object.values(picks).filter(p => !p.res && p.date < S.today).map(p => p.date))].slice(0, 6);
  for (const d of days) { try { settlePicks(await scoreboardOn(d)); } catch (e) {} }
  if (days.length) renderPicks();
}

/* ---------------- recap (written from the stats) ---------------- */
function recapHTML(d, sides) {
  const comp = d.header?.competitions?.[0];
  if (comp?.status?.type?.state !== 'post') return '';
  const W = sides.find(s => s.winner), L = sides.find(s => s !== W);
  if (!W || !L) return '';
  const ws = +W.score, ls = +L.score, mg = ws - ls, per = Math.max(comp.status?.period || 0, sides[0].lines.length, 4);
  const ot = per > REG_PERIODS ? (per === REG_PERIODS + 1 ? ' in overtime' : ` in ${per - REG_PERIODS} overtimes`) : '';
  const verb = mg >= 20 ? 'rolled past' : mg >= 12 ? 'pulled away from' : mg <= 3 ? 'edged' : 'beat';
  const city = d.gameInfo?.venue?.address?.city;
  const where = W === sides[1] ? ' at home' : city ? ` in ${city}` : ' on the road';
  const best = s => {
    const T = (d.boxscore?.players || []).find(t => t.team?.id === s.id)?.statistics?.[0]; if (!T) return null;
    const lab = T.labels || [], v = (a, k) => a.stats?.[lab.indexOf(k)];
    const a = (T.athletes || []).filter(x => x.stats?.length).sort((x, y) => (+v(y, 'PTS') || 0) - (+v(x, 'PTS') || 0))[0];
    if (!a) return null;
    return { name: a.athlete?.displayName || a.athlete?.shortName, last: a.athlete?.lastName || (a.athlete?.displayName || '').split(' ').slice(-1)[0], pts: +v(a, 'PTS') || 0, reb: +v(a, 'REB') || 0, ast: +v(a, 'AST') || 0, fg: v(a, 'FG') || '', tp: v(a, '3PT') || '' };
  };
  const statBits = p => { const xs = [`${p.pts} points`]; if (p.reb >= 7) xs.push(`${p.reb} rebounds`); if (p.ast >= 6) xs.push(`${p.ast} assists`); return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs.at(-1) : xs[0]; };
  const shoot = p => { const m = /^(\d+)-(\d+)$/.exec(p.fg); return m && +m[2] >= 8 ? ` on ${m[1]}-of-${m[2]} shooting` : ''; };
  const bw = best(W), bl = best(L);
  const out = [`The ${esc(W.short)} ${verb} the ${esc(L.short)} ${ws}-${ls}${ot}${esc(where)}.`];
  if (bw) out.push(`${esc(bw.name)} led the way with ${statBits(bw)}${shoot(bw)}.`);
  // how it was won: comeback, a decisive quarter, or a late finish
  let downW = 0; const isHome = W === sides[1];
  for (const p of d.plays || []) { const a = +p.awayScore, h = +p.homeScore; if (Number.isFinite(a) && Number.isFinite(h)) downW = Math.max(downW, isHome ? a - h : h - a); }
  const lines = sides.map(s => s.lines.map(Number));
  const wi = sides.indexOf(W), li = 1 - wi;
  let bestQ = -1, bestD = 0;
  lines[wi].forEach((v, i) => { const dq = v - (lines[li][i] || 0); if (dq > bestD) { bestD = dq; bestQ = i; } });
  const qName = i => i < REG_PERIODS ? (RULES.halves ? ['first', 'second'][i] + ' half' : ['first', 'second', 'third', 'fourth'][i] + ' quarter') : 'overtime';
  if (downW >= 12) out.push(`${esc(W.abbr)} came back from ${downW} points down${bestQ >= 0 && bestD >= 8 ? `, winning the ${qName(bestQ)} ${lines[wi][bestQ]}-${lines[li][bestQ]}` : ''}.`);
  else if (ot) { const reg = lines[wi].slice(0, 4).reduce((a, b) => a + b, 0); out.push(`It was tied ${reg}-${reg} after regulation before ${esc(W.abbr)} took over.`); }
  else if (bestQ >= 0 && bestD >= 8) out.push(`${esc(W.abbr)} took control in the ${qName(bestQ)}, outscoring ${esc(L.abbr)} ${lines[wi][bestQ]}-${lines[li][bestQ]}.`);
  else if (mg <= 5) out.push(`It came down to the final minutes.`);
  if (bl) out.push(`${esc(bl.name)} had ${statBits(bl)} for the ${esc(L.short)}.`);
  const bn = bigNight(d)?.list || [];
  const big = bn.find(x => x.k === 'td');
  const tdName = big ? big.who.replace(/ \d+ pts.*/, '') : '';
  const tdLine = big ? /(\d+) pts, (\d+) reb, (\d+) ast/.exec(big.who) : null;
  if (big && ![bw, bl].some(p => p && tdName.endsWith(p.last))) out.push(`${esc(tdName)} had a ${big.label.toLowerCase()}${tdLine ? `: ${tdLine[1]} points, ${tdLine[2]} rebounds and ${tdLine[3]} assists` : ''}.`);
  return `<div class="card recap"><div class="card-h"><h4>Recap</h4><span class="eyebrow">Written from the box score</span></div><p>${out.join(' ')}</p>${notableRows(bn)}</div>`;
}
// big nights (40-point games, triple-doubles, comebacks) shown quietly inside the game
function notableRows(list) {
  if (!list?.length) return '';
  return `<div class="notable">${list.map(x => `<div class="nt"><b>${esc(x.label)}</b><span>${esc(x.who)}</span></div>`).join('')}</div>`;
}
function notableCard(d) {
  if (d.header?.competitions?.[0]?.status?.type?.state !== 'in') return '';
  const list = bigNight(d)?.list || [];
  return list.length ? `<div class="card"><div class="card-h"><h4>Big night</h4><span class="eyebrow">So far</span></div>${notableRows(list)}</div>` : '';
}

/* ---------------- Netlify's floating badge: keep our bottom bars clear of it ---------------- */
(function watchBadge() {
  const fit = f => {
    const m = [...String(f.style.clipPath || '').matchAll(/M\s*[\d.]+[\s,]+([\d.]+)\s*H/g)].map(x => +x[1]);
    const h = f.getBoundingClientRect().height;
    const up = m.length && f.style.display !== 'none' ? Math.max(0, h - Math.min(...m)) : 0;
    document.documentElement.style.setProperty('--nfb', up ? Math.round(up + 6) + 'px' : '0px');
  };
  const hook = () => {
    const f = document.getElementById('nl-badge-frame') || document.getElementById('nl-hud-frame');
    if (!f || f._fc) return !!f;
    f._fc = true; fit(f);
    new MutationObserver(() => fit(f)).observe(f, { attributes: true, attributeFilter: ['style'] });
    return true;
  };
  if (!hook()) { const mo = new MutationObserver(() => { if (hook()) mo.disconnect(); }); mo.observe(document.body, { childList: true }); setTimeout(() => mo.disconnect(), 20000); }
})();

/* starred props on the Bet desk: check for line moves every few minutes, only when there are stars */
setInterval(() => { if (!document.hidden && !IS_W && lsGet('fc-bd-stars') && lsGet('fc-bd-stars') !== '{}') lazy('betdesk').then(m => m.checkStars()).catch(() => {}); }, 5 * 60e3);

/* ================= global events ================= */
document.addEventListener('click', e => {
  const el = e.target;
  const lgb = el.closest('[data-lg]'); if (lgb) { switchLeague(lgb.dataset.lg); return; }
  if (el.closest('[data-navmore]')) { navMenu(); return; }
  // a game's highlights in Replay (from the game sheet)
  const ckb = el.closest('[data-court]'); if (ckb) { e.preventDefault(); openGame(ckb.dataset.court, { tab: 'court' }); return; }
  const rpl = el.closest('[data-replay]'); if (rpl) { const [gid, day] = rpl.dataset.replay.split('|'); S.replayFocus = { gid, day }; closeAll(); if (S.view === 'replay') lazy('replay').then(m => m.renderReplay()); else go('replay'); return; }
  const v = el.closest('[data-view]');
  if (v) { e.preventDefault(); closeAll(); go(v.dataset.view); return; }
  if (el.closest('[data-close]')) { closeTop(); return; }
  if (el.closest('[data-adv]')) { toggleAdv(); return; }
  const bsh = el.closest('[data-betshare]'); if (bsh) { lazy('bets').then(m => m.shareBet(bsh.dataset.betshare)); return; }
  const bm = el.closest('[data-betmin]'); if (bm) { toggleBetMin(bm.dataset.betmin); return; }
  const bd = el.closest('[data-betdel]'); if (bd) { const c = bd.closest('.bt-card'); if (c && c.closest('.bt-ask')) c.remove(); removeBet(bd.dataset.betdel); return; }
  if (el.closest('[data-news]')) { openNews(); return; }
  if (el.closest('[data-settings]')) { openSettings(); return; }
  if (el.closest('[data-openmini]')) { appCall('open_mini').catch(() => toast("Couldn't open the mini scoreboard")); return; }
  if (el.closest('[data-week]')) { openWeek(); return; }
  if (el.closest('[data-alerts]')) { toggleAlerts(); return; }
  const wb = el.closest('[data-watch]'); if (wb) { const id = wb.dataset.watch; toggleWatch(id, S.watchInfo?.[id]); return; }
  const pk = el.closest('[data-pick]'); if (pk) { const [gid, tid] = pk.dataset.pick.split(':'); makePick(gid, tid); return; }
  const rs = el.closest('[data-rsort]'); if (rs) { S.rankSort = rs.dataset.rsort; if (S.ranks) drawRankings(S.ranks.rows); return; }
  const tmo = el.closest('[data-tmode]'); if (tmo) { S.teamsMode = tmo.dataset.tmode; $$('#teamsSeg button').forEach(b => b.setAttribute('aria-pressed', b === tmo)); placeKnob($('#teamsSeg')); renderTeams(); return; }
  const fv = el.closest('[data-fav]'); if (fv) { setFav(fv.dataset.fav); return; }
  if (el.closest('[data-search]')) { openSearch(); return; }
  const ak = el.closest('[data-ask]'); if (ak) { closeSearch(); openAsk(ak.dataset.ask || ''); return; }
  if (el.closest('[data-mv]')) { openMulti(); return; }
  const cw = el.closest('[data-cmpwith]');
  if (cw) { const id = cw.dataset.cmpwith; S.cmp = [id, S.cmp[1] !== id ? S.cmp[1] : S.cmp[0] !== id ? S.cmp[0] : null]; closeAll(); go('compare'); return; }
  const cs = el.closest('[data-cmpsplit]');
  if (cs) { S.cmpSplit = cs.dataset.cmpsplit; $$('#cmpSeg button').forEach(b => b.setAttribute('aria-pressed', b === cs)); placeKnob($('#cmpSeg')); renderCompare(); return; }
  const ex = el.closest('[data-expand]'); if (ex) { toggleFull(ex.closest('.sheet')); return; }
  const psh = el.closest('[data-pgshare]'); if (psh) { e.stopPropagation(); const [gid, pid] = psh.dataset.pgshare.split(':'); runShare(() => sharePlayerGame(gid, pid), psh); return; }
  const g = el.closest('[data-game]'); if (g) { openGame(g.dataset.game, g.dataset.legpid ? { focus: g.dataset.legpid } : {}); return; }
  const tm = el.closest('[data-team]'); if (tm) { openTeam(tm.dataset.team); return; }
  const p = el.closest('[data-player]'); if (p) { openPlayer(p.dataset.player); return; }
  const co = el.closest('[data-coach]'); if (co) { lazy('coach').then(m => m.openCoach(co.dataset.coach, co.dataset.coachteam, co.textContent.trim())); return; }
  const nl = el.closest('[data-nickleg]'); if (nl) { closeSearch(); lazy('history').then(m => m.openLegend({ br: nl.dataset.nickleg })); return; }
  const d = el.closest('[data-date]'); if (d) { pickDate(d.dataset.date); return; }
  const r = el.closest('[data-rail]'); if (r) { const rail = $('#rail'); rail.scrollBy({ left: +r.dataset.rail * rail.clientWidth * 0.7, behavior: reduced ? 'auto' : 'smooth' }); return; }
  const f = el.closest('[data-filter]'); if (f) { gamesFilter = f.dataset.filter; renderGames(true); return; }
  if (el.closest('[data-cscopeall]')) { cScope = 'all'; gamesFilter = 'all'; renderGames(true); return; }
  const mc = el.closest('[data-conf]'); if (mc) { S.miniConf = +mc.dataset.conf; $$('#miniSeg button').forEach(b => b.setAttribute('aria-pressed', b === mc)); placeKnob($('#miniSeg')); renderMini(); return; }
  const sc = el.closest('[data-sconf]'); if (sc) { S.stdConf = +sc.dataset.sconf; $$('#stdSeg button').forEach(b => b.setAttribute('aria-pressed', b === sc)); placeKnob($('#stdSeg')); renderStandings(); return; }
  const lc = el.closest('[data-lead]'); if (lc) { S.leadKey = +lc.dataset.lead; $$('#leadChips .chip').forEach(b => b.setAttribute('aria-pressed', b === lc)); lc.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' }); loadLeaders(); return; }
  const rt = el.closest('[data-retry]');
  if (rt) {
    const k = rt.dataset.retry;
    if (k === 'scores') loadScores();
    if (k === 'standings') { stdPromise = null; renderStandings(); }
    if (k === 'teams') { stdPromise = null; renderTeams(); }
    if (k === 'leaders') loadLeaders();
    if (k === 'replay') go('replay');
    if (k === 'cap') go('cap');
    if (k === 'history') go('history');
    if (k === 'draft') go('draft');
  }
});
// keyboard arrows on the date rail
$('#rail').addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const d = addDays(S.date, e.key === 'ArrowLeft' ? -1 : 1);
  if ($(`[data-date="${d}"]`)) { pickDate(d); $(`[data-date="${d}"]`).focus(); }
});

/* ================= boot ================= */
boot();
function boot() {
renderLeadChips();
renderMini();
renderFavLink();
applyHome();
go(location.hash.slice(1) || 'scores', false);
wireDrag();
$$('.seg').forEach(placeKnob);
// lift the switch veil once the first scores are on screen (or after a short cap, whichever comes first)
const liftVeil = () => document.documentElement.classList.remove('arriving');
if (document.documentElement.classList.contains('arriving')) setTimeout(liftVeil, 1800);
Promise.resolve(loadScores()).finally(() => {
  // let the favourite team's logo finish so the chip fades in whole, not logo-second
  const img = $('#favLink:not([hidden]) img');
  Promise.race([img?.decode?.(), new Promise(r => setTimeout(r, 500))]).catch(() => {}).finally(() => setTimeout(liftVeil, 60));
});
markNews();
setTimeout(settleOldPicks, 4000);
alertTick();
try {
  const qs = new URLSearchParams(location.search), gq = qs.get('game');
  if (gq || qs.has('league')) history.replaceState(null, '', location.pathname + location.hash);
  if (gq) setTimeout(() => openGame(gq), 300);
} catch (e) {}
loadStandings().catch(() => { $('#miniStd').innerHTML = `<div class="empty" style="padding:20px"><b>Standings unavailable</b><button class="btn" data-retry="standings">Retry</button></div>`; });
// refresh "tips in" countdowns & time labels each minute
setInterval(() => { if (S.view === 'scores' && !document.hidden && S.games.some(g => g.state === 'pre')) { const back = holdScroll(); renderGames(false); back(); } }, 60000);
}
try { const t = document.getElementById('tzNote'); if (t) t.textContent = TZ_AB === 'ET' ? 'ET' : TZ_AB + ' (your time zone)'; } catch (e) {}

/* Windows app updater: see if GitHub has a newer release (on launch, every 10 minutes, and when the window comes back). "Update now" has the
   app download it, check it against GitHub's checksum, install it silently and reopen (main.rs, install_update).
   Older app versions without that command still get a download link. */
const APP_REL = 'https://github.com/larosa023/fullcourt/releases';
// manual: from Settings. Shows the banner even for a version you said "Not now" to, and reports what it found.
async function appUpdateCheck(manual = false) {
  try {
    const T = window.__TAURI__, cur = await T.app.getVersion();
    const res = await fetch('https://api.github.com/repos/larosa023/fullcourt/releases?per_page=15', { cache: 'no-store' }); if (!res.ok) return { st: 'error', cur };
    const rels = await res.json();
    // highest version, compared number by number (GitHub lists "1.0.10" below "1.0.9")
    const num = x => x.split('.').map(n => +n || 0), cmp = (x, y) => { const a = num(x), b = num(y); for (let k = 0; k < 3; k++) if ((a[k] || 0) !== (b[k] || 0)) return (a[k] || 0) - (b[k] || 0); return 0; };
    const rel = rels.filter(r => /^desktop-v\d/.test(r.tag_name || '') && !r.draft && !r.prerelease).sort((x, y) => cmp(y.tag_name.slice(9), x.tag_name.slice(9)))[0]; if (!rel) return { st: 'current', cur };
    const v = rel.tag_name.replace('desktop-v', '');
    const a = num(v), b = num(cur), i = [0, 1, 2].find(k => (a[k] || 0) !== (b[k] || 0)), newer = i != null && (a[i] || 0) > (b[i] || 0);
    if (!newer) return { st: 'current', cur };
    if ($('#appUpd')) return { st: 'newer', cur, v };
    if (!manual && lsGet('fc-app-skip') === v) return { st: 'skipped', cur, v };
    if (manual) lsSet('fc-app-skip', null);
    const asset = rel.assets?.find(x => /\.exe$/i.test(x.name)), exe = asset?.browser_download_url || rel.html_url || APP_REL;
    const el = document.createElement('div'); el.id = 'appUpd'; el.className = 'app-upd';
    el.innerHTML = `<b>Fullcourt ${esc(v)} is out</b><span class="au-msg">You're on ${esc(cur)}. Updating takes a few seconds; your bets and settings stay.</span>
      <button class="btn sm" data-appupd>Update now</button><div class="au-bar" hidden><i></i></div>
      <span class="au-act"><button class="link-btn" data-appskip>Not now</button>${rel.body ? `<a class="link-btn" href="${esc(rel.html_url)}">What's new</a>` : ''}</span>`;
    // found while the window is hidden or in the tray: a Windows notification, once per version
    if (!manual && document.hidden && lsGet('fc-app-told') !== v) { lsSet('fc-app-told', v); try { new Notification(`Fullcourt ${v} is ready`, { body: 'Open Fullcourt and click Update now. It takes a few seconds.' }); } catch (x) {} }
    const msg = $('.au-msg', el), bar = $('.au-bar', el);
    el.addEventListener('click', async e => {
      if (e.target.closest('[data-appskip]')) { lsSet('fc-app-skip', v); el.remove(); return; }
      const go = e.target.closest('[data-appupd]'); if (!go || go.disabled) return;
      if (!asset || !T.core?.invoke) { T.opener.openUrl(exe); msg.textContent = 'The download opened in your browser. Run it to update.'; return; }
      go.disabled = true; go.textContent = 'Updating…'; bar.hidden = false; el.classList.add('busy');
      let un = null; try { un = await T.event.listen('fc-update-progress', ev => { bar.firstElementChild.style.width = `${ev.payload}%`; msg.textContent = ev.payload >= 100 ? 'Installing. Fullcourt will reopen in a moment.' : `Downloading ${ev.payload}%`; }); } catch (x) {}
      try { await T.core.invoke('install_update', { url: exe, sha256: asset.digest || null }); }
      catch (x) {
        un?.(); go.disabled = false; go.textContent = 'Try again'; bar.hidden = true; el.classList.remove('busy');
        msg.innerHTML = `Couldn't update: ${esc(String(x?.message || x))} <a class="link-btn" href="${esc(exe)}">Download it instead</a>`;
      }
    });
    document.body.append(el);
    return { st: 'newer', cur, v };
  } catch (e) { return { st: 'error' }; }
}
// checked soon after launch, every 10 minutes while open (even in the tray), and whenever the window comes back
// into view (at most once a minute), so a new release shows up within minutes of being published
if (IS_APP && !IS_MINI) {
  let lastChk = 0; const chk = () => { if (Date.now() - lastChk < 60e3) return; lastChk = Date.now(); appUpdateCheck(); };
  setTimeout(chk, 5000); setInterval(chk, 10 * 60e3);
  // running the newest site from GitHub Pages: when a newer one is published, reload into it (right away if the window
  // is hidden or in the tray, otherwise the next time you come back to it)
  if (window.FC_LIVE) {
    const mine = [...document.querySelectorAll('script[type=importmap]')].map(s => s.textContent.match(/core\.[\w-]+\.js/)?.[0]).find(Boolean);
    let newer = false;
    const siteChk = async () => {
      if (newer) { if (document.hidden) location.reload(); return; }
      try { const h = await (await fetch(window.FC_BASE + 'index.html?t=' + Date.now(), { cache: 'no-store' })).text(); const theirs = h.match(/core\.[\w-]+\.js/)?.[0]; if (mine && theirs && theirs !== mine) { newer = true; if (document.hidden) location.reload(); } } catch (e) {}
    };
    setInterval(siteChk, 10 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.hidden && newer) location.reload(); else if (!document.hidden) siteChk(); });
  } else if (window.FC_BASE !== undefined && !/[?&]local\b/.test(location.search) && sessionStorage.getItem('fc-local') !== '1') {
    // opened the copy built into the app (no connection, or GitHub Pages was slow): once the live site is reachable,
    // switch to it (right away if the window is hidden or in the tray, otherwise the next time it's hidden)
    let ready = false;
    const liveChk = async () => {
      if (ready) { if (document.hidden) location.reload(); return; }
      try { const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000); const r = await fetch('https://larosa023.github.io/fullcourt/index.html?t=' + Date.now(), { cache: 'no-store', signal: ctl.signal }); clearTimeout(t); if (r.ok && /core\.[\w-]+\.js/.test(await r.text())) { ready = true; if (document.hidden) location.reload(); } } catch (e) {}
    };
    setTimeout(liveChk, 30e3); setInterval(liveChk, 3 * 60e3);
    window.addEventListener('online', () => setTimeout(liveChk, 3000));
    document.addEventListener('visibilitychange', () => { if (document.hidden && ready) location.reload(); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) chk(); });
  window.addEventListener('focus', chk);
}

/* Windows app: tray, mini scoreboard button, and the mini window's own bar */
function appOpenGame(t) {
  if (!t || !t.game || !/^\w{1,32}$/.test(String(t.game))) return;
  const lg = ['nba', 'wnba', 'ncaam', 'ncaaw'].includes(t.league) ? t.league : LGK;
  if (lg !== LGK) { location.href = `${location.pathname}?league=${lg}&game=${encodeURIComponent(t.game)}`; return; }
  openGame(String(t.game));
}
const appCall = (cmd, args) => { try { return window.__TAURI__.core.invoke(cmd, args); } catch (e) { return Promise.reject(e); } };
if (IS_APP && !IS_MINI) {
  appCall('set_close_to_tray', { on: lsGet('fc-app-tray') !== '0' }).catch(() => {});
  try {
    window.__TAURI__.event.listen('fc-nav', e => { location.hash = String(e.payload || '#scores'); });
    // Isle (or anything else) can start the app with --league nba --game 401… to open that game
    window.__TAURI__.event.listen('fc-open', e => appOpenGame(e.payload));
    setTimeout(() => appCall('launch_target').then(appOpenGame).catch(() => {}), 400);
    // the first time the window hides to the tray, say so (Windows notification, since the window is gone)
    window.__TAURI__.event.listen('fc-to-tray', () => { if (lsGet('fc-app-trayseen')) return; lsSet('fc-app-trayseen', '1'); try { window.__TAURI__.notification.sendNotification({ title: 'Fullcourt is still running', body: 'It\'s in the tray by the clock, keeping your bet alerts on. Right-click it to quit. You can turn this off in Settings.' }); } catch (x) {} });
  } catch (e) {}
  const mb = document.createElement('button');
  mb.className = 'icon-btn mini-btn'; mb.dataset.openmini = ''; mb.title = 'Mini scoreboard: a small always-on-top window'; mb.setAttribute('aria-label', 'Open the mini scoreboard');
  mb.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2.5"/><rect x="12" y="11" width="7" height="5" rx="1.2"/></svg>';
  $('.set-btn')?.before(mb);
}
if (IS_MINI) {
  let onTop = lsGet('fc-mini-top') !== '0';
  appCall('set_mini_on_top', { on: onTop }).catch(() => {});
  const bar = document.createElement('div'); bar.className = 'mini-bar';
  const pinTxt = () => (onTop ? 'On top' : 'Pin on top');
  bar.innerHTML = `<b>Fullcourt</b><span class="mini-live"><i></i>Live</span><button class="mini-pin${onTop ? ' on' : ''}" data-minipin title="Keep this window above other windows">${pinTxt()}</button><button class="mini-full" data-minifull title="Open the full Fullcourt window">Open full</button>`;
  document.body.prepend(bar);
  bar.addEventListener('click', e => {
    if (e.target.closest('[data-minifull]')) appCall('focus_main').catch(() => {});
    const pin = e.target.closest('[data-minipin]');
    if (pin) { onTop = !onTop; lsSet('fc-mini-top', onTop ? '1' : '0'); appCall('set_mini_on_top', { on: onTop }).catch(() => {}); pin.classList.toggle('on', onTop); pin.textContent = pinTxt(); }
  });
  // always today, always Scores
  window.addEventListener('hashchange', () => { if (location.hash !== '#scores' && !document.querySelector('.sheet.open')) history.replaceState(null, '', '#scores'); });
}

/* ---- pull to refresh, for Fullcourt saved to the home screen (browsers already have their own) ---- */
if ((matchMedia('(display-mode: standalone)').matches || navigator.standalone) && 'ontouchstart' in window && !IS_APP) {
  const ind = document.createElement('div'); ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true'); ind.innerHTML = '<i></i>'; document.body.append(ind);
  let y0 = null, d = 0, busy = false;
  const refreshNow = () => {
    refreshTicker();
    if (S.view === 'scores') return loadScores({ silent: true });
    if (S.view === 'standings') { stdPromise = null; return loadStandings(true).then(() => renderStandings()); }
    if (S.view === 'leaders') return loadLeaders({ silent: true });
    if (S.view === 'teams') { stdPromise = null; return loadStandings(true).then(() => renderTeams()); }
    go(S.view, false); return sleep(700);
  };
  addEventListener('touchstart', e => {
    y0 = null;
    if (busy || window.scrollY > 24 || stack.length || e.touches.length > 1 || document.documentElement.classList.contains('locked')) return;
    if (e.target.closest?.('.sheet, .pop, input, textarea, select, .hs, [data-drag], .drag-x, #drawer')) return;
    y0 = e.touches[0].clientY; d = 0;
  }, { passive: true });
  addEventListener('touchmove', e => {
    if (y0 == null) return;
    d = Math.max(0, e.touches[0].clientY - y0);
    if (window.scrollY > 24 && d < 8) { y0 = null; return; }
    ind.style.setProperty('--p', Math.min(1, d / 90).toFixed(3));
    ind.classList.toggle('on', d > 10); ind.classList.toggle('ready', d >= 90);
  }, { passive: true });
  const end = () => {
    if (y0 == null) return; y0 = null;
    if (d >= 90) { busy = true; ind.classList.add('spin'); Promise.resolve(refreshNow()).catch(() => {}).finally(() => setTimeout(() => { busy = false; ind.classList.remove('on', 'ready', 'spin'); }, 350)); }
    else ind.classList.remove('on', 'ready');
    d = 0;
  };
  addEventListener('touchend', end, { passive: true }); addEventListener('touchcancel', end, { passive: true });
}
