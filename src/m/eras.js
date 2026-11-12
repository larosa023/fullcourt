/* ---------------- Ask, any era ----------------
   Past seasons, award races, all-time lists and retired players, plus the side-by-side graphic those answers are
   drawn as (in the chat, and as a share image).
   Data: the era-data branch, built weekly on GitHub from Basketball-Reference (tools/eras.mjs):
     seasons/<year>.json  every player's per-game line that season and in its playoffs, award finishes, team records
     index.json           every player who has appeared (name, first and last season, a career-size number, ESPN id)
     top.json             the best single seasons ever by stat
   A season is named by the year it ended: 1962 is 1961-62. NBA only. */
const ERA_URL = 'https://raw.githubusercontent.com/larosa023/fullcourt/era-data' + (IS_W ? '/wnba' : ''); // the WNBA's files sit in their own folder
const eraFetch = (path, hours) => fetch(`${ERA_URL}/${path}?t=${Math.floor(Date.now() / (hours * 3600e3))}`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
let eraIdxP = null, eraTopP = null;
const eraSeasonP = new Map();
const eraFold = s => nameKey(s).replace(/ (jr|sr|ii|iii|iv)$/, '');

function eraIndex() {
  return eraIdxP || (eraIdxP = eraFetch('index.json', 6).then(d => {
    const list = d.players.map(([id, name, y0, y1, score, espn]) => { const key = eraFold(name), parts = key.split(' '); return { id, name, y0, y1, score, espn: espn || null, looked: espn != null, key, first: parts[0], last: parts.slice(1).join(' ') || parts[0] }; });
    const byKey = new Map(), byLast = new Map(), byFirst = new Map(), byId = new Map();
    const add = (m, k, p) => { if (k) (m.get(k) || m.set(k, []).get(k)).push(p); };
    for (const p of list) { byId.set(p.id, p); add(byKey, p.key, p); add(byLast, p.last, p); const lw = p.last.split(' ').pop(); if (lw !== p.last) add(byLast, lw, p); add(byFirst, p.first, p); }
    for (const m of [byKey, byLast, byFirst]) for (const v of m.values()) v.sort((a, b) => b.score - a.score);
    return { cur: d.cur, first: d.first, last: d.last, list, byKey, byLast, byFirst, byId };
  }).catch(e => { eraIdxP = null; throw e; }));
}
// "MVP-2,AS,NBA1" → { MVP: 2, AS: true, NBA: 1 }
function eraAw(s) {
  const o = {};
  for (const t of String(s || '').split(',')) {
    const m = t.trim().match(/^(MVP|ROY|DPOY|6MOY|MIP|CPOY)-(\d+)$/);
    if (m) o[m[1]] = +m[2];
    else if (/^AS$/.test(t.trim())) o.AS = true;
    else { const n = t.trim().match(/^(NBA|DEF)(\d)$/); if (n) o[n[1]] = +n[2]; }
  }
  return o;
}
function eraSeason(y) {
  if (!eraSeasonP.has(y)) eraSeasonP.set(y, eraFetch(`seasons/${y}.json`, y >= new Date().getFullYear() ? 6 : 24 * 30).then(d => {
    const mk = r => { const o = { y: d.y }; d.cols.forEach((k, i) => { o[k] = r[i]; }); o.aws = eraAw(o.aw); return o; };
    const reg = d.reg.map(mk), post = d.post.map(mk);
    return { y: d.y, label: d.season, reg, post, teams: d.teams || {}, maxG: Math.max(...reg.map(r => r.g || 0)), byId: new Map(reg.map(r => [r.id, r])), postById: new Map(post.map(r => [r.id, r])) };
  }).catch(e => { eraSeasonP.delete(y); throw e; }));
  return eraSeasonP.get(y);
}
const eraTop = () => eraTopP || (eraTopP = eraFetch('top.json', 24).catch(e => { eraTopP = null; throw e; }));
// "MVP-2,AS,NBA1" in words
const eraAwText = aw => String(aw || '').split(',').map(t => t.trim()).filter(Boolean).map(t => {
  let m = t.match(/^(MVP|ROY|DPOY|6MOY|MIP|CPOY)-(\d+)$/); if (m) return +m[2] === 1 ? m[1] : `${m[1]} ${eraOrd(+m[2])}`;
  if (t === 'AS') return 'All-Star';
  m = t.match(/^(NBA|DEF)(\d)$/); if (m) return `${m[1] === 'NBA' ? (IS_W ? 'All-WNBA' : 'All-NBA') : 'All-Defense'} ${eraOrd(+m[2])}`;
  return t;
}).join(', ');
const eraLabel = y => (IS_W ? String(y) : `${y - 1}-${String(y).slice(2)}`); // a WNBA season sits inside one year
const eraOrd = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
const eraQual = (S, r) => (r.g || 0) >= 0.7 * S.maxG;
// one number for "how good was this season" (to pick a player's best year)
const eraImpact = r => (r.pts || 0) + 1.2 * (r.trb || 0) + 1.5 * (r.ast || 0) + 2 * (r.stl || 0) + 2 * (r.blk || 0);

/* ---------------- reading the question ---------------- */
const ERA_AWARDS = [
  { k: 'MVP', re: /\b(mvps?|most valuable( player)?)\b/, name: 'MVP', from: 1956, rows: ['pts', 'trb', 'ast'] },
  { k: 'ROY', re: /\b(roy|roty|rookie of the year)\b/, name: 'Rookie of the Year', from: 1953, rows: ['pts', 'trb', 'ast'] },
  { k: 'DPOY', re: /\b(dpoy|dpoty|defensive player( of the year)?)\b/, name: 'Defensive Player of the Year', from: 1983, rows: ['stl', 'blk', 'trb'] },
  { k: '6MOY', re: /\b(6moy|smoy|(sixth|6th) man( of the year)?)\b/, name: 'Sixth Man of the Year', from: 1983, rows: ['pts', 'trb', 'ast'] },
  { k: 'MIP', re: /\b(mip|most improved( player)?)\b/, name: 'Most Improved Player', from: 1986, rows: ['pts', 'trb', 'ast'] },
  { k: 'CPOY', re: /\b(cpoy|clutch player( of the year)?)\b/, name: 'Clutch Player of the Year', from: 2023, rows: ['pts', 'trb', 'ast'] },
];
const ERA_STATS = [
  ['tp', /\b(threes|3s|three pointers?|3 pointers?|3pm|3pt|three point|from three)\b/, 'threes'],
  ['pts', /\b(points?|pts|ppg|scor(ers?|ing|ed|e)|buckets)\b/, 'points'],
  ['trb', /\b(rebound(s|ers?|ing)?|boards|rpg|reb)\b/, 'rebounds'],
  ['ast', /\b(assists?|apg|dimes|passers?|ast)\b/, 'assists'],
  ['stl', /\b(steals?|spg|stl)\b/, 'steals'],
  ['blk', /\b(blocks?|bpg|blk|shot blockers?)\b/, 'blocks'],
  ['mp', /\b(minutes|mpg)\b/, 'minutes'],
];
const ERA_ROW = { pts: ['PTS', 1], trb: ['REB', 1], ast: ['AST', 1], stl: ['STL', 1], blk: ['BLK', 1], tp: ['3PM', 1], mp: ['MIN', 1], fgp: ['FG%', 'pct'], tpp: ['3P%', 'pct'], ftp: ['FT%', 'pct'], g: ['GP', 0] };
const eraFmt = (k, v) => v == null || !Number.isFinite(+v) ? '–' : ERA_ROW[k][1] === 'pct' ? (v * 100).toFixed(1) : (+v).toFixed(ERA_ROW[k][1]);
// words that are never part of a player's name in a question
const ERA_STOP = new Set(('the a an of in on for to at by with from is was were are be been who whom whos what whats which when where how many much did does do had has have vs versus v and or against compared compare comparison ' +
  'season seasons year years stats stat numbers line lines averages average averaged avg per game games race races voting vote votes voted ladder finish finished finishes won win wins winner winners award awards leaders leader ' +
  'top best most highest lowest peak prime greatest rookie rookies career careers playoffs playoff postseason regular all time alltime ever history historic nba league team teams roster graphic graphics image images card cards picture pic ' +
  'make show give me draw create generate share side his her their its first last second third each every during between than better worse great good put as into me my please look looked like ' +
  'points point pts scoring scorer scorers scored score rebounds rebound rebounders rebounding boards assists assist passers steals steal blocks block blockers threes three pointers pointer minutes ppg rpg apg spg bpg mpg ' +
  'mvp mvps roy roty dpoy dpoty smoy 6moy mip cpoy valuable player players defensive sixth 6th man improved clutch champion champions champ title titles').split(' '));
// surnames that are also everyday words: matched only as part of a full name ("Jerry West", not "in the West")
const ERA_COMMON = new Set('long young free white brown green love price king hill west east rose ball person house rice day may wise short smart strong battle cash born new park money rush temple'.split(' '));
// nicknames and one-word names
const ERA_ALIAS = { shaq: 'onealsh01', mj: 'jordami01', magic: 'johnsma02', 'dr j': 'ervinju01', 'doctor j': 'ervinju01', kd: 'duranke01', cp3: 'paulch01', wemby: 'wembavi01', steph: 'curryst01', zeke: 'thomais01', melo: 'anthoca01',
  'the admiral': 'robinda01', 'the dream': 'olajuha01', 'pistol pete': 'maravpe01', 'big o': 'roberos01', hondo: 'havlijo01', 'the mailman': 'malonka01', 'the glove': 'paytoga01', 'greek freak': 'antetgi01', sga: 'gilgesh01',
  kat: 'townska01', tmac: 'mcgratr01', 't mac': 'mcgratr01', ai: 'iversal01', 'the answer': 'iversal01', kg: 'garneke01', 'the big o': 'roberos01', 'air jordan': 'jordami01', 'king james': 'jamesle01', bron: 'jamesle01', 'the logo': 'westje01',
  'sir charles': 'barklch01', 'the iceman': 'gervige01', 'clyde the glide': 'drexlcl01', 'the stilt': 'chambwi01', 'the big fundamental': 'duncati01', dirk: 'nowitdi01', ant: 'edwaran01', draymond: 'greendr01', penny: 'hardaan01', yao: 'mingya01', artest: 'artesro01', 'ron artest': 'artesro01', 'lew alcindor': 'abdulka01', alcindor: 'abdulka01',
  klay: 'thompkl01', kyrie: 'irvinky01', kawhi: 'leonaka01', dame: 'lillada01', russ: 'westbru01', zion: 'willizi01', vince: 'cartevi01', dwyane: 'wadedw01', dwayne: 'wadedw01', carmelo: 'anthoca01', 'd rose': 'rosede01', pau: 'gasolpa01',
  dwight: 'howardw01', blake: 'griffbl01', boogie: 'couside01', nique: 'wilkido01', mamba: 'bryanko01', 'black mamba': 'bryanko01', ad: 'davisan02', pg13: 'georgpa01', pistol: 'maravpe01', 'the joker': 'jokicni01', jokic: 'jokicni01', luka: 'doncilu01', giannis: 'antetgi01' };

// every season the text names, each with where it sits in the text
if (IS_W) for (const k of Object.keys(ERA_ALIAS)) delete ERA_ALIAS[k]; // those are NBA nicknames
function eraYears(t, cur) {
  const out = [];
  const ok = y => y >= 1947 && y <= cur;
  const re = /\b((?:19|20)\d\d)\s*[-\/]\s*(\d\d|(?:19|20)\d\d)\b|\b((?:19|20)\d\d)(s)?\b|'(\d\d)(s)?\b|\b(\d0)s\b/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1]) { const a = +m[1], b = +m[2]; const end = b < 100 ? ((a + 1) % 100 === b ? a + 1 : null) : b === a + 1 ? b : null; if (end && ok(end)) out.push({ y: end, i: m.index }); else if (ok(a)) out.push({ y: a, i: m.index }); }
    else if (m[3]) { const y = +m[3]; if (m[4] && y % 10 === 0) out.push({ decade: y, i: m.index }); else if (ok(y)) out.push({ y, i: m.index }); }
    else if (m[5]) { const y = +m[5] >= 47 ? 1900 + +m[5] : 2000 + +m[5]; if (m[6] && y % 10 === 0) out.push({ decade: y, i: m.index }); else if (ok(y)) out.push({ y, i: m.index }); }
    else if (m[7]) { const d = +m[7]; out.push({ decade: d >= 40 ? 1900 + d : 2000 + d, i: m.index }); }
  }
  return out;
}
// the players named in a stretch of text
function eraFindPlayers(text, I, yearHint) {
  const words = eraFold(text).split(' ').filter(Boolean);
  const active = p => !yearHint || (p.y0 <= yearHint && p.y1 >= yearHint);
  const pick = list => { if (!list?.length) return null; return list.find(active) || (yearHint ? null : list[0]); };
  const found = [];
  let i = 0;
  while (i < words.length) {
    let hit = null, used = 0;
    for (const n of [3, 2, 1]) {
      if (i + n > words.length) continue;
      const seg = words.slice(i, i + n), s = seg.join(' ');
      if (ERA_ALIAS[s] && I.byId.get(ERA_ALIAS[s]) && !(s === 'magic' && yearHint > 1991)) { hit = I.byId.get(ERA_ALIAS[s]); used = n; break; } // ("1995 Magic" is Orlando)
      if (seg.some(w => ERA_STOP.has(w) || /^\d+$/.test(w))) continue;
      if (n >= 2) {
        const exact = pick(I.byKey.get(s)) || I.byKey.get(s)?.[0];
        if (exact) { hit = exact; used = n; break; }
        // "kareem abdul", "wilt chamber": every word starts a part of the name
        if (n === 2 && seg.every(w => w.length >= 3)) {
          const cands = (I.byFirst.get(seg[0]) || []).filter(p => p.last.startsWith(seg[1]));
          const c = pick(cands); if (c && (c.score >= 1500 || cands.length === 1)) { hit = c; used = n; break; }
        }
      } else {
        const w = seg[0]; if (w.length < 3) continue;
        const common = ERA_COMMON.has(w); if (common && !yearHint) continue; // ("Rose 2011" is Derrick Rose; "in the West" is not Jerry West)
        const byLast = (I.byLast.get(w) || []).filter(p => p.score >= (common ? 15000 : 2500));
        const l = pick(byLast);
        const f = I.byFirst.get(w), fTop = f?.[0];
        const firstOk = fTop && !common && w.length >= 4 && fTop.score >= 9000 && (f[1]?.score || 0) * 2.5 < fTop.score && active(fTop);
        // a surname beats a first name unless the first name's owner is far bigger (Kobe, Wilt, LeBron...)
        if (l && !(firstOk && fTop.score > l.score * 3)) { hit = l; used = 1; break; }
        if (firstOk) { hit = fTop; used = 1; break; }
      }
    }
    if (hit) { if (!found.includes(hit)) found.push(hit); i += used; } else i++;
  }
  return found;
}

/* ---------------- photos, colours, links ---------------- */
// franchises that have moved or renamed, for a team colour
const ERA_FR = { PHW: 'GS', SFW: 'GS', GSW: 'GS', MNL: 'LAL', SEA: 'OKC', NJN: 'BKN', NYN: 'BKN', CIN: 'SAC', KCK: 'SAC', KCO: 'SAC', ROC: 'SAC', STL: 'ATL', MLH: 'ATL', TRI: 'ATL', SYR: 'PHI', FTW: 'DET', BAL: 'WSH', CAP: 'WSH', WSB: 'WSH', CHZ: 'WSH', CHP: 'WSH',
  SDR: 'HOU', BUF: 'LAC', SDC: 'LAC', NOJ: 'UTAH', VAN: 'MEM', NOH: 'NO', NOK: 'NO', CHH: 'CHA', CHA: 'CHA', CHO: 'CHA', BRK: 'BKN', NOP: 'NO', NYK: 'NY', PHO: 'PHX', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH' };
// WNBA franchises that moved or were renamed, as ESPN's abbreviation for where they are now
const ERA_FR_W = { NYL: 'NY', LAS: 'LA', LVA: 'LV', SAS: 'LV', UTA: 'LV', PHO: 'PHX', WAS: 'WSH', TUL: 'DAL', DET: 'DAL', GSV: 'GS' };
const eraAbbr = tm => { const a = String(tm || '').split('/').pop(); return IS_C ? a : IS_W ? ERA_FR_W[a] || a : ERA_FR[a] || a; };
const eraLum = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
// teams whose old look was nothing like their franchise's current one
const ERA_OLD_COLOR = { SEA: '#00653A', VAN: '#00B2A9', CHH: '#00788C', NJN: '#002A60', NYN: '#002A60', WSB: '#E31837', BAL: '#E31837', CAP: '#E31837', SDC: '#5091CD', BUF: '#5091CD', NOJ: '#4F2683' };
const eraColor = tm => {
  const raw = String(tm || '').split('/').pop(); if (!IS_C && !IS_W && ERA_OLD_COLOR[raw]) return ERA_OLD_COLOR[raw];
  const a = eraAbbr(tm); let c = a ? teamColor(a) : '#444444';
  if (c === '#444444') return '#3a4150';
  if (eraLum(c) < 0.12) { const alt = Object.values(S.teams).find(x => x.abbr === a)?.alt; c = alt && /^[0-9a-f]{6}$/i.test(alt) && eraLum('#' + alt) >= 0.12 && eraLum('#' + alt) < 0.8 ? '#' + alt : '#4a5262'; } // black (Spurs, Nets) disappears on a dark card
  return c;
};
const eraShort = name => { const p = String(name).trim().split(/\s+/); return p.length < 2 ? name : `${p[0][0]}. ${p.slice(1).join(' ')}`; };
const eraEspnCache = new Map();
async function eraEspnLookup(p) {
  if (eraEspnCache.has(p.id)) return eraEspnCache.get(p.id);
  let id = null;
  try {
    const d = await getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(deaccent(p.name))}&limit=6&type=player`, { retries: 0, timeout: 6000 });
    const hit = (d.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).find(c => c.description === (IS_W ? 'WNBA' : 'NBA') && eraFold(c.displayName) === p.key);
    id = hit?.uid?.match(/a:(\d+)/)?.[1] || null;
  } catch (e) {}
  eraEspnCache.set(p.id, id);
  return id;
}
// where a player's picture comes from, and what tapping him opens
async function eraPerson(p, X) {
  const now = X.rows?.find(r => eraFold(r.name) === p.key && p.y1 >= X.I.cur - 1);
  const L = X.Hd?.legends?.[p.id];
  const own = X.H?.ownKey?.(p.id) ? new URL(`data/photos/${p.id}.webp`, ASSET_BASE).href : null;
  let espn = now?.id || p.espn || L?.espn || X.Hd?.espn?.[p.id] || null;
  if (!espn && !own && !p.looked && p.y1 >= 1990) espn = await eraEspnLookup(p);
  const noPhoto = !own && (!espn || (L && L.photo === false && !now) || (X.Hd?.nophoto || []).includes(espn));
  return { own, espn, img: own || (noPhoto ? null : headSrc(espn, 400)), link: now ? `data-player="${esc(now.id)}"` : L ? `data-hleg="${esc(p.id)}"` : espn ? `data-hespn="${esc(espn)}"` : '' };
}

/* ---------------- the side-by-side card ----------------
   spec: { title, sub, cols: [{ head, name, tm, sub, img, link }], rows: [{ lab, vals: ['18.9', ...], best }],
           foot: [{ lab, vals, trophy }] }   (trophy: vals are finishing places, drawn with a cup) */
const EC = new Map(); let ecN = 0;
const EC_CUP = 'M6 3h12v2h3v2a4 4 0 0 1-4 4h-.3A6 6 0 0 1 13 14.9V18h3v3H8v-3h3v-3.1A6 6 0 0 1 7.3 11H7a4 4 0 0 1-4-4V5h3V3zm0 4H5a2 2 0 0 0 1.5 1.9A6 6 0 0 1 6 7zm12 0c0 .7-.2 1.3-.5 1.9A2 2 0 0 0 19 7h-1z';
const EC_CUP_COL = ['#F5B63F', '#B9C0CB', '#D08A4E'];
// "1961-62 Season" / "BOS · 60-20": the first word always shows, the rest drops away when the columns are cramped
const ecSplit = t => { const i = String(t).indexOf(' '); return i < 0 ? esc(t) : `${esc(t.slice(0, i))}<span class="ec-x">${esc(t.slice(i))}</span>`; };
const ecBest = vals => { const n = vals.map(v => parseFloat(v)); const mx = Math.max(...n.filter(Number.isFinite)); return n.filter(v => v === mx).length === 1 ? n.indexOf(mx) : -1; };
function ecHTML(spec) {
  const id = 'ec' + (++ecN); EC.set(id, spec);
  const n = spec.cols.length, between = n >= 2 && n <= 3; // labels between the columns (up to three), otherwise down the left
  const col = i => between ? i * 2 + 1 : i + 2;
  const head = spec.cols.map((c, i) => `<button class="ec-hd" style="grid-column:${col(i)}" ${c.link || ''}>
      <span class="ec-ss">${ecSplit(c.head || '')}</span>
      <span class="ec-ph${c.logo ? ' lg' : ''}" style="--tc:${c.color || '#3a4150'}"><i>${esc(c.mono || initials(c.name))}</i>${c.img ? `<img src="${esc(c.img)}" alt="" loading="lazy" draggable="false" onerror="this.remove()">` : ''}</span>
      <b>${(c.short || c.name) !== c.name && /^\S\. /.test(c.short) ? `<span class="ec-x">${esc(c.short.slice(0, 3))}</span>${esc(c.short.slice(3))}` : esc(c.short || c.name)}</b>${c.sub ? `<small>${ecSplit(c.sub)}</small>` : ''}</button>`).join('');
  const line = (r, foot) => {
    const best = foot ? -1 : r.best ?? ecBest(r.vals);
    const val = (v, i) => `<span class="ec-v${i === best ? ' best' : ''}${foot ? ' ec-f' : ''}" style="grid-column:${col(i)}">${r.trophy && v ? `<svg viewBox="0 0 24 24" aria-hidden="true" style="color:${EC_CUP_COL[+v - 1] || 'var(--muted)'}"><path fill="currentColor" d="${EC_CUP}"/></svg>` : ''}${esc(v || '–')}</span>`;
    const lab = i => `<span class="ec-l" style="grid-column:${between ? i * 2 + 2 : 1}">${esc(r.lab)}</span>`;
    return between ? r.vals.map((v, i) => val(v, i) + (i < n - 1 ? lab(i) : '')).join('') : lab(0) + r.vals.map(val).join('');
  };
  const copy = !isTouch && !!navigator.clipboard?.write && 'ClipboardItem' in window;
  return `<div class="ec ${between ? 'ec-a' : 'ec-b'}" style="--n:${n}">
    <div class="ec-t"><b>${esc(spec.title)}</b>${spec.sub ? `<span>${esc(spec.sub)}</span>` : ''}</div>
    <div class="ec-g" style="grid-template-columns:${between ? Array.from({ length: n }, () => 'minmax(0,1fr)').join(' auto ') : `auto repeat(${n}, minmax(0,1fr))`}">
      ${head}<span class="ec-rule"></span>
      ${spec.rows.map(r => line(r)).join('')}${(spec.foot || []).map(r => line(r, true)).join('')}
    </div>
    <div class="ec-acts"><button class="btn ghost ec-share" data-ecshare="${id}">${SHARE_ICON}<span>${copy ? 'Copy as image' : 'Share as image'}</span></button></div>
  </div>`;
}
// the same card as a 1080-wide picture
async function ecImage(spec) {
  const M = await lazy('share');
  const n = spec.cols.length, between = n >= 2 && n <= 3;
  const rows = [...spec.rows.map(r => ({ ...r, best: r.best ?? ecBest(r.vals) })), ...(spec.foot || []).map(r => ({ ...r, foot: true, best: -1 }))];
  const R = n <= 3 ? 92 : n === 4 ? 76 : 62, rh = n <= 3 ? 122 : 108, headH = 96 + R * 2 + 120, top = 268;
  const H = top + headH + rows.length * rh + 44 + 150;
  const K = await M.canvasKit(H); const { x, C, font, text, fit } = K;
  const tpx = K.size(spec.title, 800, null, 84, 44, 936);
  text(fit(spec.title, font(800, tpx), 936), 72, 150, font(800, tpx), C.ink);
  if (spec.sub) text(fit(spec.sub.toUpperCase(), font(600, 26, 'mono'), 936), 72, 206, font(600, 26, 'mono'), C.accent);
  x.fillStyle = C.surface; M.roundRect(x, 72, top, 936, H - top - 150, 32); x.fill();
  const L = 72 + 28, Wd = 936 - 56, labW = 150;
  const cw = between ? (Wd - (n - 1) * labW) / n : (Wd - labW) / n;
  const cx = i => between ? L + i * (cw + labW) + cw / 2 : L + labW + i * cw + cw / 2;
  const imgs = await Promise.all(spec.cols.map(c => c.img ? M.loadImg(c.img) : null));
  spec.cols.forEach((c, i) => {
    const X0 = cx(i), cy = top + 96 + R;
    const hw = between ? cw + 36 : cw - 8; // between-the-columns layouts have a little of the label gutters to spill into
    x.font = font(700, n <= 3 ? 30 : 24, 'body');
    const hd = x.measureText(c.head || '').width <= hw ? c.head || '' : String(c.head).split(' ')[0];
    text(fit(hd, font(700, n <= 3 ? 30 : 24, 'body'), hw), X0, top + 62, font(700, n <= 3 ? 30 : 24, 'body'), C.accent, 'center');
    x.save(); x.beginPath(); x.arc(X0, cy, R, 0, Math.PI * 2); x.closePath(); x.fillStyle = c.cv || c.color || '#3a4150'; x.fill(); x.clip();
    const im = imgs[i];
    if (im && c.logo) { const sz = R * 1.36; x.drawImage(im, X0 - sz / 2, cy - sz / 2, sz, sz); }
    else if (im) { const h = R * 2.06, w = h * im.width / im.height; x.drawImage(im, X0 - w / 2, cy - R + R * 0.1, w, h); }
    else { const mono = c.mono || initials(c.name); text(mono, X0, cy + R * 0.3, font(800, R * (mono.length > 2 ? 0.66 : 0.9)), 'rgba(255,255,255,.92)', 'center'); }
    x.restore();
    const npx = n <= 3 ? 34 : n === 4 ? 28 : 24;
    // the name: smaller first, then the surname alone, then cut short
    const nm = c.short || c.name; let px2 = K.size(nm, 600, 'body', npx, Math.round(npx * 0.8), hw), nm2 = nm;
    x.font = font(600, px2, 'body'); if (x.measureText(nm).width > hw) { nm2 = nm.replace(/^\S\. /, ''); px2 = K.size(nm2, 600, 'body', npx, Math.round(npx * 0.74), hw); }
    text(fit(nm2, font(600, px2, 'body'), hw), X0, cy + R + 52, font(600, px2, 'body'), C.ink, 'center');
    if (c.sub) { x.font = font(500, n <= 3 ? 22 : 19, 'mono'); const sb = x.measureText(c.sub).width <= hw ? c.sub : c.sub.split(' ')[0]; text(fit(sb, font(500, n <= 3 ? 22 : 19, 'mono'), hw), X0, cy + R + 88, font(500, n <= 3 ? 22 : 19, 'mono'), C.muted, 'center'); }
  });
  const y0 = top + headH;
  x.fillStyle = C.line; x.fillRect(72, y0 - 18, 936, 2);
  const vpx = n <= 3 ? 76 : n === 4 ? 60 : 50, lpx = 22;
  rows.forEach((r, ri) => {
    const by = y0 + ri * rh + rh * 0.66;
    r.vals.forEach((v, i) => {
      const s = String(v || '–'), px = Math.min(vpx, K.size(s, 800, null, vpx, 30, cw - (r.trophy ? 70 : 10)));
      if (r.trophy && v) {
        x.font = font(800, px);
        const sc = px / 30, w = x.measureText(s).width, tw = 24 * sc, gap = 12;
        const sx = cx(i) - (tw + gap + w) / 2;
        x.save(); x.translate(sx, by - px * 0.78); x.scale(sc, sc); x.fillStyle = EC_CUP_COL[+v - 1] || C.muted; x.fill(new Path2D(EC_CUP)); x.restore();
        text(s, sx + tw + gap, by, font(800, px), C.ink);
      } else { x.globalAlpha = r.foot || i === r.best || r.best < 0 ? 1 : 0.68; text(s, cx(i), by, font(800, px), C.ink, 'center'); x.globalAlpha = 1; } // (the leader in each row at full strength, in either theme)
    });
    const lab = r.lab.toUpperCase();
    if (between) for (let i = 0; i < n - 1; i++) text(fit(lab, font(500, lpx, 'mono'), labW - 8), cx(i) + cw / 2 + labW / 2, by - vpx * 0.24, font(500, lpx, 'mono'), C.muted, 'center');
    else text(fit(lab, font(500, lpx, 'mono'), labW - 8), L + 6, by - vpx * 0.24, font(500, lpx, 'mono'), C.muted);
  });
  K.foot();
  return { canvas: K.c, name: `${nameKey(spec.title).replace(/ /g, '-') || 'fullcourt'}.png`, title: spec.title };
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-ecshare]'); if (!b) return;
  const spec = EC.get(b.dataset.ecshare); if (!spec) return;
  e.preventDefault(); e.stopPropagation();
  runShare(() => ecImage(spec), b);
});

/* ---------------- building answers ---------------- */
// (a three-point percentage on next to no attempts says nothing: shown as a dash)
const eraVal = (k, r) => !r || (k === 'tpp' && r.tpa != null && r.tpa < 0.3) ? '–' : eraFmt(k, r[k]);
const eraRowsFor = (keys, lines) => keys.map(k => ({ lab: ERA_ROW[k][0], vals: lines.map(r => eraVal(k, r)) })).filter(r => r.vals.some(v => v !== '–'));
async function eraCol(p, line, X, head, sub) {
  const P = await eraPerson(p, X);
  const rec = line?.tm && line.y ? (await eraSeason(line.y).catch(() => null))?.teams?.[String(line.tm).split('/').pop()] : null;
  return { head, name: p.name, short: eraShort(p.name), tm: line?.tm, color: eraColor(line?.tm), img: P.img, link: P.link, sub: sub ?? (line?.tm ? `${line.tm}${rec ? ` · ${rec[1]}-${rec[2]}` : ''}` : '') };
}
const eraTable = (head, rows) => `<div class="ask-tbl-wrap"><table class="ask-tbl ec-tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const eraTblRow = (r, rank, extra = '') => `<tr><td>${rank != null ? `<i class="ec-rk">${rank}</i>` : ''}${esc(r.name)}</td><td>${esc(r.tm || '')}</td><td>${r.g ?? '–'}</td><td>${eraFmt('pts', r.pts)}</td><td>${eraFmt('trb', r.trb)}</td><td>${eraFmt('ast', r.ast)}</td>${extra}</tr>`;

// "1962 MVP race", "who won DPOY in 2004", "2016 rookie of the year voting"
async function eraAwardRace(A, y, n, X) {
  const S = await eraSeason(y);
  const list = S.reg.filter(r => r.aws[A.k]).sort((a, b) => a.aws[A.k] - b.aws[A.k] || b.pts - a.pts);
  if (!list.length) return { text: y < A.from ? `The ${A.name} award was first handed out in ${eraLabel(A.from)}.` : y >= X.I.cur ? `The ${eraLabel(y)} ${A.name} hasn't been voted on yet.` : `I don't have ${A.name} voting for ${eraLabel(y)}.`, miss: true };
  const top = list.slice(0, n);
  const cols = await Promise.all(top.map(r => eraCol(X.I.byId.get(r.id) || { id: r.id, name: r.name, key: eraFold(r.name), y1: y }, r, X, `${S.label} Season`)));
  const spec = { title: `${S.label} ${A.name} race`, sub: 'Per game · regular season', cols, rows: eraRowsFor(A.rows, top), foot: [{ lab: `${A.k} finish`, vals: top.map(r => String(r.aws[A.k])), trophy: true }] };
  const w = list[0], rest = list.slice(1, 3);
  const text = `<b>${esc(w.name)}</b> won the ${S.label} ${A.name}${w[A.rows[0]] != null ? ` (${A.rows.map(k => `${eraFmt(k, w[k])} ${ERA_STATS.find(x => x[0] === k)[2]}`).join(', ')})` : ''}.${rest.length ? ` ${rest.map((r, i) => `${esc(r.name)} finished ${eraOrd(r.aws[A.k])}`).join(' and ')}.` : ''}`;
  const more = list.length > n ? eraTable(['Voting', 'Team', 'GP', 'PTS', 'REB', 'AST'], list.slice(0, 12).map(r => eraTblRow(r, r.aws[A.k]))) : '';
  return { text, html: card(ecHTML(spec) + more), ctx: {}, src: 'Basketball-Reference' };
}
// "top scorers 1987", "rebound leaders 1962", "who led the league in assists in 1991"
async function eraLeaders(stat, y, n, post, X) {
  const S = await eraSeason(y);
  const pool = post ? S.post.filter(r => (r.g || 0) >= 4) : S.reg.filter(r => eraQual(S, r));
  const list = pool.filter(r => r[stat] != null).sort((a, b) => b[stat] - a[stat]);
  const word = ERA_STATS.find(s => s[0] === stat)[2];
  if (!list.length) return { text: `${word[0].toUpperCase() + word.slice(1)} weren't recorded in ${S.label}.`, miss: true };
  const top = list.slice(0, n);
  const cols = await Promise.all(top.map(r => eraCol(X.I.byId.get(r.id) || { id: r.id, name: r.name, key: eraFold(r.name), y1: y }, r, X, `${S.label}${post ? ' Playoffs' : ' Season'}`)));
  const keys = [stat, ...['pts', 'trb', 'ast'].filter(k => k !== stat)].slice(0, 3);
  const spec = { title: `${S.label} ${word} leaders${post ? ', playoffs' : ''}`, sub: `Per game${post ? '' : ' · regular season'}`, cols, rows: eraRowsFor(keys, top), foot: [{ lab: 'Rank', vals: top.map((_, i) => String(i + 1)), trophy: true }] };
  const text = `<b>${esc(top[0].name)}</b> led the ${post ? `${S.label} playoffs` : `league in ${S.label}`} with <b>${eraFmt(stat, top[0][stat])} ${word} per game</b>${top[1] ? `, ahead of ${esc(top[1].name)} (${eraFmt(stat, top[1][stat])})${top[2] ? ` and ${esc(top[2].name)} (${eraFmt(stat, top[2][stat])})` : ''}` : ''}.`;
  const basic = stat === 'pts' || stat === 'trb' || stat === 'ast';
  const more = eraTable(['Leaders', 'Team', 'GP', 'PTS', 'REB', 'AST', ...(basic ? [] : [ERA_ROW[stat][0]])], list.slice(0, 10).map((r, i) => eraTblRow(r, i + 1, basic ? '' : `<td>${eraFmt(stat, r[stat])}</td>`)));
  return { text, html: card(ecHTML(spec) + more), ctx: {}, src: 'Basketball-Reference' };
}
// "best scoring seasons ever", "most rebounds per game in a season", "best scoring seasons of the 90s"
async function eraAllTime(stat, decade, n, X) {
  const T = await eraTop();
  const word = ERA_STATS.find(s => s[0] === stat)[2];
  let list = (T.top[stat] || []).map(([val, id, name, y, tm, g]) => ({ val, id, name, y, tm, g }));
  if (decade) list = list.filter(r => r.y > decade && r.y <= decade + 10);
  if (!list.length) return { text: `I don't have a list for that${decade ? ` in the ${decade}s` : ''}.`, miss: true };
  const top = list.slice(0, n);
  const lines = await Promise.all(top.map(async r => (await eraSeason(r.y)).byId.get(r.id) || { ...r, [stat]: r.val }));
  const cols = await Promise.all(top.map((r, i) => eraCol(X.I.byId.get(r.id) || { id: r.id, name: r.name, key: eraFold(r.name), y1: r.y }, lines[i], X, `${eraLabel(r.y)} Season`)));
  const keys = [stat, ...['pts', 'trb', 'ast'].filter(k => k !== stat)].slice(0, 3);
  const when = decade ? `of the ${decade}s` : 'ever';
  const spec = { title: `Best ${word} seasons ${when}`, sub: 'Per game · regular season', cols, rows: eraRowsFor(keys, lines), foot: [{ lab: 'Rank', vals: top.map((_, i) => String(i + 1)), trophy: true }] };
  const text = `The most ${word} per game in a season${decade ? ` in the ${decade}s` : ''}: <b>${esc(top[0].name)}, ${eraFmt(stat, top[0].val)} in ${eraLabel(top[0].y)}</b>.${top[1] ? ` Next: ${top.slice(1, 3).map(r => `${esc(r.name)} (${eraFmt(stat, r.val)}, ${eraLabel(r.y)})`).join(' and ')}.` : ''}`;
  const more = eraTable(['Player', 'Season', 'Team', 'GP', ERA_ROW[stat][0]], list.slice(0, 15).map((r, i) => `<tr><td><i class="ec-rk">${i + 1}</i>${esc(r.name)}</td><td>${eraLabel(r.y)}</td><td>${esc(r.tm || '')}</td><td>${r.g ?? '–'}</td><td>${eraFmt(stat, r.val)}</td></tr>`));
  return { text, html: card(ecHTML(spec) + more), ctx: {}, src: 'Basketball-Reference' };
}
// "1996 Bulls"
async function eraTeam(ab, y, post, X) {
  const S = await eraSeason(y), T = S.teams[ab];
  const pool = (post ? S.post : S.reg).filter(r => String(r.tm).split('/').includes(ab));
  if (!pool.length) return null;
  const list = pool.filter(r => (r.g || 0) >= (post ? 1 : S.maxG * 0.25)).sort((a, b) => (b.mp ?? b.pts ?? 0) * Math.min(1, (b.g || 0) / (S.maxG * 0.6)) - (a.mp ?? a.pts ?? 0) * Math.min(1, (a.g || 0) / (S.maxG * 0.6)));
  const top = list.slice(0, 5);
  const cols = await Promise.all(top.map(r => eraCol(X.I.byId.get(r.id) || { id: r.id, name: r.name, key: eraFold(r.name), y1: y }, r, X, r.pos || '', r.aws.AS ? 'All-Star' : `${r.g} games`)));
  const name = T?.[0] || ab;
  const spec = { title: `${S.label} ${name}`, sub: `${T ? `${T[1]}-${T[2]} · ` : ''}per game${post ? ' · playoffs' : ''}`, cols, rows: eraRowsFor(['pts', 'trb', 'ast'], top) };
  const lead = [...pool].sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
  const text = `The ${S.label} ${esc(name)}${T ? ` went <b>${T[1]}-${T[2]}</b>` : ''}. ${esc(lead.name)} led them with ${eraFmt('pts', lead.pts)} points per game${post ? ' in the playoffs' : ''}.`;
  const more = eraTable(['Roster', 'Team', 'GP', 'PTS', 'REB', 'AST'], list.slice(0, 12).map(r => eraTblRow(r)));
  return { text, html: card(ecHTML(spec) + more), ctx: {}, src: 'Basketball-Reference' };
}
// teams side by side: "2016 Warriors vs 1996 Bulls"
async function eraTeams(list, X) {
  const cols = [], recs = [], texts = [];
  for (const { ab, y } of list.slice(0, 5)) {
    const S = await eraSeason(y), T = S.teams[ab]; if (!T) continue;
    const pool = S.reg.filter(r => String(r.tm).split('/').includes(ab));
    const lead = [...pool].filter(r => (r.g || 0) >= S.maxG * 0.4).sort((a, b) => (b.pts || 0) - (a.pts || 0))[0];
    const known = X.H?.H_KNOWN?.has(X.H.hAbbr(ab)), nick = T[0].split(' ').slice(/trail blazers$/i.test(T[0]) ? -2 : -1).join(' ');
    cols.push({ head: `${S.label} Season`, name: T[0], short: nick, logo: true, mono: ab, color: known ? 'var(--surface-3)' : eraColor(ab), cv: known ? cssVar('--surface-3') || '#232830' : eraColor(ab), img: known ? logoSrc(X.H.hAbbr(ab), 200) : null, sub: lead ? `${eraShort(lead.name)} ${eraFmt('pts', lead.pts)}` : '', link: '' });
    recs.push({ w: T[1], l: T[2], as: pool.filter(r => r.aws.AS).length, mvp: pool.filter(r => r.aws.MVP && r.aws.MVP <= 5).length });
    texts.push(`the ${S.label} ${esc(nick)} went <b>${T[1]}-${T[2]}</b>${lead ? ` (${esc(lead.name)}, ${eraFmt('pts', lead.pts)} points a game)` : ''}`);
  }
  if (cols.length < 2) return null;
  const lo = Math.min(...recs.map(r => r.l));
  const spec = { title: cols.map(c => c.short).join(' vs '), sub: 'Regular season', cols, rows: [
    { lab: 'Wins', vals: recs.map(r => String(r.w)) },
    { lab: 'Losses', vals: recs.map(r => String(r.l)), best: recs.filter(r => r.l === lo).length === 1 ? recs.findIndex(r => r.l === lo) : -1 },
    { lab: 'Win %', vals: recs.map(r => (r.w / Math.max(1, r.w + r.l) * 100).toFixed(1)) },
    { lab: 'All-Stars', vals: recs.map(r => String(r.as)) },
  ] };
  const t = texts.join('; ') + '.';
  return { text: t[0].toUpperCase() + t.slice(1), html: card(ecHTML(spec)), ctx: {}, src: 'Basketball-Reference' };
}
// every season a player played (for his career line, best year, MVP years)
async function eraSeasonsOf(p, post) {
  const ys = []; for (let y = p.y0; y <= p.y1; y++) ys.push(y);
  const all = await Promise.all(ys.map(y => eraSeason(y).then(S => (post ? S.postById : S.byId).get(p.id) || null).catch(() => null)));
  return all.filter(Boolean);
}
function eraCareerLine(lines) {
  const g = lines.reduce((s, r) => s + (r.g || 0), 0) || 1;
  const o = { g, career: true, seasons: lines.length };
  // a stat counts only if it was kept for most of his games (steals and blocks start in 1973-74, threes in 1979-80)
  for (const k of ['pts', 'trb', 'ast', 'stl', 'blk', 'mp', 'tp', 'tpa']) { const have = lines.filter(r => r[k] != null), w = have.reduce((s, r) => s + (r.g || 0), 0); o[k] = w >= g * 0.8 ? have.reduce((s, r) => s + r[k] * (r.g || 0), 0) / w : null; }
  for (const [k, a] of [['fgp', 'fga'], ['tpp', 'tpa'], ['ftp', 'fta']]) { const have = lines.filter(r => r[k] != null && r[a]), gw = have.reduce((s, r) => s + (r.g || 0), 0), w = have.reduce((s, r) => s + r[a] * (r.g || 0), 0); o[k] = w && gw >= g * (k === 'tpp' ? 0.8 : 0.5) ? have.reduce((s, r) => s + r[k] * r[a] * (r.g || 0), 0) / w : null; }
  o.mvp = lines.filter(r => r.aws.MVP === 1).length; o.as = lines.filter(r => r.aws.AS).length; o.nba = lines.filter(r => r.aws.NBA).length;
  o.tm = Object.entries(lines.reduce((m, r) => { const t = String(r.tm).split('/')[0]; m[t] = (m[t] || 0) + (r.g || 0); return m; }, {})).sort((a, b) => b[1] - a[1])[0]?.[0];
  return o;
}
// players side by side: each with a season, his rookie year, his best year or his whole career
async function eraPlayers(subj, post, X) {
  const many = subj.length > 1;
  const lines = [], heads = [];
  for (const s of subj) {
    const p = s.p;
    if (s.mode === 'career') { const all = await eraSeasonsOf(p, post); if (!all.length) { lines.push(null); heads.push('Career'); continue; } const c = eraCareerLine(all); lines.push(c); heads.push(`Career${post ? ' Playoffs' : ''} · ${p.y0 === p.y1 ? p.y0 : `${p.y0 - 1}-${String(p.y1).slice(2)}`}`); }
    else {
      let y = s.y;
      if (s.mode === 'rookie') y = p.y0;
      if (s.mode === 'best') { const all = await eraSeasonsOf(p, post); y = [...all].sort((a, b) => eraImpact(b) * Math.min(1, (b.g || 0) / 50) - eraImpact(a) * Math.min(1, (a.g || 0) / 50))[0]?.y || p.y1; }
      const live = y === X.I.cur && !post ? eraLiveLine(p, X) : null;
      const S = live ? null : await eraSeason(y).catch(() => null);
      lines.push(live || (S ? (post ? S.postById : S.byId).get(p.id) || null : null));
      heads.push(`${eraLabel(y)}${post ? ' Playoffs' : s.mode === 'rookie' ? ' · Rookie' : ' Season'}`);
    }
  }
  if (lines.every(l => !l)) return { text: many ? `I couldn't find those seasons.` : `${esc(subj[0].p.name)} didn't play${subj[0].y ? ` in ${eraLabel(subj[0].y)}` : ''}${post ? ' in the playoffs' : ''}. His career ran from ${subj[0].p.y0 - 1}-${String(subj[0].p.y0).slice(2)} to ${eraLabel(subj[0].p.y1)}.`, miss: true };
  const cols = await Promise.all(subj.map((s, i) => eraCol(s.p, lines[i], X, heads[i], lines[i]?.career ? `${plural(lines[i].seasons, 'season')} · ${lines[i].g.toLocaleString('en-US')} games` : undefined)));
  const keys = subj.length <= 3 ? ['pts', 'trb', 'ast', 'stl', 'blk', 'fgp', 'tpp', 'ftp'] : ['pts', 'trb', 'ast', 'fgp'];
  const foot = [];
  if (lines.some(l => l && !l.career && l.aws?.MVP)) foot.push({ lab: 'MVP finish', vals: lines.map(l => l && !l.career && l.aws?.MVP ? String(l.aws.MVP) : ''), trophy: true });
  if (lines.some(l => l?.career)) { foot.push({ lab: 'MVPs', vals: lines.map(l => l?.career ? String(l.mvp) : '') }); foot.push({ lab: 'All-Star', vals: lines.map(l => l?.career ? String(l.as) : '') }); }
  const same = heads.every(h => h === heads[0]);
  const title = many ? subj.map(s => s.p.name.split(' ').slice(-1)[0].replace(/^(Jr\.?|Sr\.?|II|III)$/, s.p.name.split(' ').slice(-2)[0])).join(' vs ') : subj[0].p.name;
  const kind = subj.every(s => s.mode === 'rookie') ? 'Rookie seasons' : subj.every(s => s.mode === 'career') ? `Careers${post ? ' · playoffs' : ''}` : subj.every(s => s.mode === 'best') ? 'Best seasons' : same ? heads[0] : '';
  const spec = { title, sub: `${many ? (kind ? kind + ' · ' : '') : heads[0] + ' · '}per game`, cols, rows: eraRowsFor(keys, lines), foot };
  const say = (s, l, h) => l ? `${esc(s.p.name)}${l.career ? ' for his career' : ` in ${h.replace(/ Season| · Rookie/, '').replace(' Playoffs', ' (playoffs)')}`}: <b>${eraFmt('pts', l.pts)} points, ${eraFmt('trb', l.trb)} rebounds, ${eraFmt('ast', l.ast)} assists</b>${l.aws?.MVP ? ` (${l.aws.MVP === 1 ? 'won MVP' : `${eraOrd(l.aws.MVP)} in MVP voting`})` : l.career && l.mvp ? ` (${l.mvp} MVP${l.mvp === 1 ? '' : 's'})` : ''}` : `${esc(s.p.name)} didn't play${s.y ? ` in ${eraLabel(s.y)}` : ''}`;
  const text = subj.map((s, i) => say(s, lines[i], heads[i])).join('. ') + '.';
  // one player's career: every season underneath
  let more = '';
  if (!many && lines[0]?.career) { const all = await eraSeasonsOf(subj[0].p, post); more = eraTable(['Season', 'Team', 'GP', 'PTS', 'REB', 'AST', 'Awards'], all.map(r => `<tr><td>${eraLabel(r.y)}</td><td>${esc(r.tm || '')}</td><td>${r.g ?? '–'}</td><td>${eraFmt('pts', r.pts)}</td><td>${eraFmt('trb', r.trb)}</td><td>${eraFmt('ast', r.ast)}</td><td>${esc(eraAwText(r.aw))}</td></tr>`)); }
  return { text, html: card(ecHTML(spec) + more), ctx: {}, src: 'Basketball-Reference' };
}
// one player, several of his seasons side by side ("Jokic MVP seasons", "LeBron 2012 vs 2013")
async function eraOwnSeasons(p, years, post, X, A = ERA_AWARDS[0]) {
  const lines = (await Promise.all(years.map(y => eraSeason(y).then(S => (post ? S.postById : S.byId).get(p.id) || null).catch(() => null)))).filter(Boolean).slice(0, 5);
  if (!lines.length) return null;
  const cols = await Promise.all(lines.map(l => eraCol(p, l, X, `${eraLabel(l.y)}${post ? ' Playoffs' : ' Season'}`)));
  const foot = lines.some(l => l.aws[A.k]) ? [{ lab: `${A.k} finish`, vals: lines.map(l => l.aws[A.k] ? String(l.aws[A.k]) : ''), trophy: true }] : [];
  const spec = { title: p.name, sub: `Per game${post ? ' · playoffs' : ''}`, cols, rows: eraRowsFor(lines.length <= 3 ? [...new Set([...A.rows, 'pts', 'trb', 'ast', 'stl', 'blk', 'fgp'])].slice(0, 6) : ['pts', 'trb', 'ast', 'fgp'], lines), foot };
  const text = `${esc(p.name)}: ${lines.map(l => `<b>${eraFmt('pts', l.pts)} / ${eraFmt('trb', l.trb)} / ${eraFmt('ast', l.ast)}</b> in ${eraLabel(l.y)}`).join(', ')} (points / rebounds / assists).`;
  return { text, html: card(ecHTML(spec)), ctx: {}, src: 'Basketball-Reference' };
}

// this season's numbers come from the live table Ask already has (the era files are refreshed weekly)
function eraLiveLine(p, X) {
  const r = X.rows.find(x => eraFold(x.name) === p.key); if (!r) return null;
  const f = v => Number.isFinite(v) ? v : null, pc = v => Number.isFinite(v) ? v / 100 : null;
  return { y: X.I.cur || null, live: true, id: p.id, name: r.name, tm: r.abbr, g: f(r.gp), mp: f(r.min), pts: f(r.pts), trb: f(r.reb), ast: f(r.ast), stl: f(r.stl), blk: f(r.blk), tp: f(r.tpm), fgp: pc(r.fgp), tpp: pc(r.tpp), ftp: pc(r.ftp), aws: {} };
}
// one player's history with an award: "how many MVPs did Jordan win", "Jokic MVP seasons"
async function eraOwnAward(p, A, X) {
  const all = await eraSeasonsOf(p), got = all.filter(r => r.aws[A.k]), won = got.filter(r => r.aws[A.k] === 1);
  if (!got.length) return { text: `${esc(p.name)} never received a vote for ${A.name}.`, miss: true };
  if (!won.length) { const b = [...got].sort((a, c) => a.aws[A.k] - c.aws[A.k])[0]; const r = await eraOwnSeasons(p, [...got].sort((a, c) => a.aws[A.k] - c.aws[A.k]).slice(0, 4).map(x => x.y).sort(), false, X, A); return { ...r, text: `${esc(p.name)} never won ${A.name}. His best finish was <b>${eraOrd(b.aws[A.k])} in ${eraLabel(b.y)}</b>.` }; }
  const r = await eraOwnSeasons(p, won.slice(-5).map(x => x.y), false, X, A);
  return { ...r, text: `${esc(p.name)} won <b>${won.length} ${A.name} award${won.length === 1 ? '' : 's'}</b>: ${won.map(x => eraLabel(x.y)).join(', ')}.${won.length > 5 ? ' The last five are shown.' : ''}` };
}

/* ---------------- the router ----------------
   Returns null when the question isn't one for this module, so Ask carries on with its this-season answers.
   opts: rows (this season's players), loose (Ask found nothing itself). */
async function eraAnswer(raw, opts = {}) {
  let t = ' ' + deaccent(String(raw)).toLowerCase().replace(/[’`]/g, "'").replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim() + ' ';
  for (const [k, v] of [['sonics', 'supersonics'], ['sixers', '76ers'], ['cavs', 'cavaliers'], ['mavs', 'mavericks'], ['wolves', 'timberwolves'], ['twolves', 'timberwolves'], ['dubs', 'warriors']]) t = t.split(` ${k} `).join(` ${v} `); // team nicknames' nicknames
  let I; try { I = await eraIndex(); } catch (e) { return opts.loose ? null : { text: "I couldn't load the history data just now. Try again in a moment.", miss: true }; }
  const [H] = await Promise.all([lazy('history').catch(() => null), ensureTeamColors()]);
  const Hd = H ? await H.loadHist().catch(() => null) : null;
  const X = { I, H, Hd, rows: opts.rows || [] };
  const yrs = eraYears(t, I.cur);
  let years = yrs.filter(v => v.y), oneYear = years.length === 1 ? years[0].y : null;
  const decade = yrs.find(v => v.decade)?.decade || null;
  const lastSeason = / last (season|year) /.test(t);
  // teams named with a season ("1996 Bulls", "1994 Houston", "2016 Warriors vs 1996 Bulls"): found first, so a city
  // isn't read as a player. Each team belongs to the season named nearest to it.
  let team = null; const teamsHit = [];
  for (const yy of years.filter(v => v.y <= I.cur).slice(0, 5)) {
    const S = await eraSeason(yy.y).catch(() => null); if (!S) continue;
    // the stretch of text this season owns: from the previous connector to the next one
    const a = Math.max(0, ...[...t.slice(0, yy.i).matchAll(/ (?:vs\.?|versus|v\.?|and|or|against) |,/g)].map(m => m.index + m[0].length)), nx = t.slice(yy.i).search(/ (?:vs\.?|versus|v\.?|and|or|against) |,/), b = oneYear ? t.length : nx < 0 ? t.length : yy.i + nx + 1;
    const part = oneYear ? t : ' ' + t.slice(a, b).trim() + ' ';
    const cands = Object.entries(S.teams).map(([ab, v]) => { const w = eraFold(v[0]).split(' '); return { ab, nick: w.at(-1), nick2: w.slice(-2).join(' '), city: w.slice(0, -1).join(' ') }; });
    const inT = x => x && part.includes(' ' + x + ' ');
    const hits = cands.filter(c => (inT(c.nick2) && c.nick2 !== c.nick) || inT(c.nick) || inT(c.nick.replace(/s$/, '')));
    if (!hits.length) { const byCity = cands.filter(c => inT(c.city)); if (byCity.length === 1) hits.push(byCity[0]); }
    for (const hit of hits) { teamsHit.push({ ab: hit.ab, y: yy.y }); for (const x of [hit.nick2, hit.city, hit.nick, hit.nick.replace(/s$/, '')]) if (x) t = t.split(' ' + x + ' ').join(' '.repeat(x.length + 2)); }
  }
  if (teamsHit.length) team = teamsHit[0].ab;
  const has = re => re.test(t);
  const award = ERA_AWARDS.find(a => a.re.test(t));
  const stat = ERA_STATS.find(s => s[1].test(t))?.[0] || null;
  const post = has(/\b(playoffs?|postseason)\b/);
  const wantCard = has(/\b(graphic|image|card|picture|pic)\b/);
  const topGiven = has(/\btop (\d)\b/), topN = Math.max(1, Math.min(5, +(t.match(/\btop (\d)\b/)?.[1] || 0) || 3));
  const allTime = has(/\b(ever|all[- ]time|in (nba )?history|of all time|single season record|in a (single )?season)\b/) || !!decade;
  const ACTIVE = p => p.y1 >= I.cur - 1 && X.rows.some(r => eraFold(r.name) === p.key);

  // the players, each with the season named next to him
  const pieces = []; { const re = /\s+(?:vs\.?|versus|v\.?|and|or|against|compared (?:to|with))\s+|\s*[,&+]\s*/g; let last = 0, m; while ((m = re.exec(t))) { pieces.push([last, m.index]); last = m.index + m[0].length; } pieces.push([last, t.length]); }
  const subj = [];
  for (const [a, b] of pieces) {
    const part = t.slice(a, b).replace(/\b(?:19|20)\d\d\s*[-\/]\s*\d\d\b|\b(?:19|20)\d\ds?\b|'\d\ds?\b|\b\d0s\b/g, ' ');
    const y = years.find(v => v.i >= a && v.i < b)?.y || null;
    const found = eraFindPlayers(part, I, y || oneYear);
    for (const p of found) subj.push({ p, y: y || oneYear });
    // "LeBron 2012 vs 2013": a piece with a season and no name is the previous player again
    if (!found.length && y && subj.length && !eraFold(part).split(' ').some(w => w && !ERA_STOP.has(w) && !/^\d+$/.test(w))) subj.push({ p: subj.at(-1).p, y });
  }
  const uniq = [...new Set(subj.map(s => s.p))];
  // "last season" after a name: an era question unless it's one current player (Ask's own splits answer that)
  if (lastSeason && !years.length && (!subj.length || uniq.length > 1 || subj.some(s => !ACTIVE(s.p)))) { years = [{ y: I.cur - 1, i: 0 }]; oneYear = I.cur - 1; subj.forEach(s => { s.y = s.y || oneYear; }); }

  // 1. awards
  if (award && uniq.length <= 1) {
    if (uniq.length === 1 && !years.length) return eraOwnAward(uniq[0], award, X); // "how many MVPs did Jordan win"
    const y = years[0]?.y;
    if (y && y < I.cur) return eraAwardRace(award, y, topGiven ? topN : 3, X);
    return null; // this season's race belongs to Ask and the Leaders page
  }
  // 2. named players
  if (subj.length) {
    const mode = has(/\brookie (season|year|campaign)s?\b|\bas (a )?rookies?\b|\bfirst (season|year)s?\b/) ? 'rookie' : has(/\b(best|peak|prime|greatest) (season|year)s?\b|\bat (his|their) (peak|best)\b|\bprimes?\b/) ? 'best' : has(/\bcareers?\b/) ? 'career' : null;
    const retired = subj.some(s => !ACTIVE(s.p));
    const gameish = has(/\b\d+ ?\+? ?(points?|pts|rebounds?|assists?|threes|steals?|blocks?)\b|\bgames?\b|double|\b(at home|on the road|wins|losses|last \d+|tonight|last night|yesterday|next|without|odds|props?)\b/);
    // this season's players stay with Ask unless the question is about another season, compares careers, or asks for the card
    if (uniq.length === 1 && gameish && !wantCard) return null; // game logs, props and the like are Ask's
    if (uniq.length === 1 && !retired && !wantCard && !mode && /\b(?:19|20)\d\d\s*[-\/]\s*\d\d\b/.test(t)) return null; // "Luka 2024-25": Ask's season split, with the game log
    if (!retired && !wantCard) {
      if (!years.length && !mode) return null;
      if (uniq.length === 1 && (gameish || mode === 'career' || !years.some(v => v.y < I.cur) && !mode)) return null;
    }
    if (uniq.length === 1 && new Set(subj.filter(s => s.y).map(s => s.y)).size >= 2) return eraOwnSeasons(uniq[0], [...new Set(subj.map(s => s.y).filter(Boolean))], post, X);
    const list = subj.filter((s, i) => subj.findIndex(z => z.p === s.p && z.y === s.y) === i).slice(0, 5)
      .map(s => ({ p: s.p, y: s.y, mode: mode || (s.y ? 'season' : ACTIVE(s.p) && !retired ? 'season' : 'career') }))
      .map(s => s.mode === 'season' && !s.y ? { ...s, y: I.cur } : s);
    return eraPlayers(list, post, X);
  }
  // 3. a team's season, or several side by side
  if (teamsHit.length >= 2 && !stat && !award) { const r = await eraTeams(teamsHit, X); if (r) return r; }
  if (team && teamsHit[0].y < I.cur && !stat && !award) { const r = await eraTeam(team, teamsHit[0].y, post, X); if (r) return r; }
  // 4. a season's leaders, or the best seasons ever
  if (stat && allTime && !oneYear) return eraAllTime(stat, decade, topGiven ? topN : 3, X);
  if (stat && oneYear && oneYear < I.cur) return eraLeaders(stat, oneYear, topGiven ? topN : 3, post, X);
  if (oneYear && oneYear < I.cur && has(/\b(leaders?|scoring champ\w*|scoring title|best players?|top players?)\b/)) return eraLeaders('pts', oneYear, topGiven ? topN : 3, post, X);
  return null;
}
// this season's players side by side, in the same card (Ask's "Luka vs Ant")
async function eraNowCard(names, opts = {}) {
  const nba = !IS_C; // college has no era files: its cards are built from the live table alone
  const I = nba ? await eraIndex() : { cur: 0, byKey: new Map() };
  const [H] = await Promise.all([nba ? lazy('history').catch(() => null) : null, ensureTeamColors()]);
  const X = { I, H, Hd: H ? await H.loadHist().catch(() => null) : null, rows: opts.rows || [] };
  const when = nba ? `${eraLabel(I.cur)} Season` : 'This season';
  const lines = [], cols = [];
  for (const nm of names.slice(0, 5)) {
    const key = eraFold(nm), p = I.byKey.get(key)?.find(x => x.y1 >= I.cur - 1) || { id: 'now-' + key, name: nm, key, y0: I.cur, y1: I.cur, looked: true };
    const l = eraLiveLine(p, X); if (!l) return null;
    lines.push(l); cols.push(await eraCol(p, l, X, when, l.tm ? `${l.tm} · ${l.g ?? 0} games` : ''));
  }
  const spec = { title: names.map(n => n.split(' ').slice(-1)[0]).join(' vs '), sub: `${nba ? eraLabel(I.cur) : 'This season'} · per game`, cols, rows: eraRowsFor(['pts', 'trb', 'ast', 'stl', 'blk', 'fgp', 'tpp', 'ftp'], lines) };
  return ecHTML(spec);
}
// this season's award race (Ask's "MVP race" with no year): the top of Fullcourt's ladder in the same card
async function eraNowAward(title, kind, race, opts = {}) {
  const nba = !IS_C;
  const I = nba ? await eraIndex().catch(() => null) : { cur: 0, byKey: new Map() }; if (!I) return null;
  const [H] = await Promise.all([nba ? lazy('history').catch(() => null) : null, ensureTeamColors()]);
  const X = { I, H, Hd: H ? await H.loadHist().catch(() => null) : null, rows: opts.rows || [] };
  const top = race.list.slice(0, opts.n || 3); if (!top.length) return null;
  const lines = [], cols = [];
  for (const x of top) {
    const key = eraFold(x.r.name), p = I.byKey.get(key)?.find(z => z.y1 >= I.cur - 1) || { id: 'now-' + key, name: x.r.name, key, y0: I.cur, y1: I.cur, looked: true };
    const l = eraLiveLine(p, X) || { tm: x.r.abbr, pts: x.r.pts, trb: x.r.reb, ast: x.r.ast, stl: x.r.stl, blk: x.r.blk, aws: {} };
    lines.push(l); cols.push(await eraCol(p, l, X, nba ? `${eraLabel(I.cur)} Season` : 'This season', [l.tm, x.rec].filter(Boolean).join(' · ')));
  }
  return ecHTML({ title: `${nba ? eraLabel(I.cur) + ' ' : ''}${title} race`, sub: 'Fullcourt ladder · per game', cols, rows: eraRowsFor(kind === 'dpoy' ? ['stl', 'blk', 'trb'] : ['pts', 'trb', 'ast'], lines), foot: [{ lab: 'Ladder', vals: top.map((_, i) => String(i + 1)), trophy: true }] });
}
