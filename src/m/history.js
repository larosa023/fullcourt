/* History: the NBA's past, from two places.
   - ESPN (live, in the browser): games on this date in past seasons (2001 on), past seasons' standings and leaders
     (2001-02 on), and profiles for any player ESPN has (bio, awards, career by season; strongest from the 1990s on).
   - history.json, built weekly on GitHub from Basketball-Reference (tools/hist.mjs, branch hist-data): career
     leaders, every champion and Finals MVP, every MVP, and full profiles of the all-time greats (back to the 1940s). */

// the WNBA's history lives in its own file (history-wnba.json), built the same way
const HW = LGK === 'wnba';
const HIST_URL = `https://raw.githubusercontent.com/larosa023/fullcourt/hist-data/${HW ? 'history-wnba' : 'history'}.json`;
const HIST_LS = HW ? 'fc-histdata-w' : 'fc-histdata';
const LGN = HW ? 'WNBA' : 'NBA';
// a season's name: the NBA's run across two years (2003-04), the WNBA's are one summer (2004)
const sLabel = yy => HW ? String(yy) : `${yy - 1}-${String(yy).slice(2)}`;
let histP = null;
function loadHist() {
  if (histP) return histP;
  let c = null; try { c = JSON.parse(localStorage.getItem(HIST_LS) || 'null'); } catch (e) {}
  const fresh = () => fetch(`${HIST_URL}?t=${Math.floor(Date.now() / 3600e3)}`).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => { try { localStorage.setItem(HIST_LS, JSON.stringify({ at: Date.now(), d })); } catch (e) {} return d; });
  if (c?.d) { histP = Promise.resolve(c.d); if (Date.now() - c.at > 24 * 3600e3) fresh().then(d => { histP = Promise.resolve(d); }).catch(() => {}); }
  else histP = fresh().catch(e => { histP = null; throw e; });
  histP = histP.then(d => { Object.values(d.legends || {}).forEach(L => { if (!L.hof && (L.bling || []).includes('Hall of Fame')) L.hof = 'yes'; }); return d; }); // the WNBA's pages list the Hall of Fame as an accolade
  return histP;
}
// Basketball-Reference team codes -> ESPN's (for logos); old franchises (SEA, NJN, VAN...) show as text
// Basketball-Reference's WNBA codes -> ESPN's; old franchises (Comets, Monarchs, Shock, Silver Stars...) show as text
const H_TEAM = HW ? { LVA: 'LV', LAS: 'LA', NYL: 'NY', PHO: 'PHX', WAS: 'WSH', GSV: 'GS', CON: 'CON', TOR: 'TOR', POR: 'POR' } : { BRK: 'BKN', CHO: 'CHA', CHH: 'CHA', GSW: 'GS', NOP: 'NO', NOH: 'NO', NOK: 'NO', NYK: 'NY', PHO: 'PHX', SAS: 'SA', UTA: 'UTAH', WAS: 'WSH', WSB: 'WSH' };
const H_KNOWN = new Set(HW ? ['ATL', 'CHI', 'CON', 'DAL', 'IND', 'LV', 'LA', 'MIN', 'NY', 'PHX', 'SEA', 'WSH', 'GS', 'TOR', 'POR'] : ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DAL', 'DEN', 'DET', 'GS', 'HOU', 'IND', 'LAC', 'LAL', 'MEM', 'MIA', 'MIL', 'MIN', 'NO', 'NY', 'OKC', 'ORL', 'PHI', 'PHX', 'POR', 'SAC', 'SA', 'TOR', 'UTAH', 'WSH']);
const hAbbr = a => H_TEAM[a] || a;
const hTm = a => /^\dTM$/.test(a || '') ? `${a[0]} teams` : (a || '');
const hLogo = (a, sz = 40) => H_KNOWN.has(hAbbr(a)) ? logo(hAbbr(a), sz) : '';
// current franchise for a team name (by nickname), for logos on champions; old names (SuperSonics, Bullets, Royals...) get none
const H_NICK = HW ? { Dream: 'ATL', Sky: 'CHI', Sun: 'CON', Wings: 'DAL', Fever: 'IND', Aces: 'LV', Sparks: 'LA', Lynx: 'MIN', Liberty: 'NY', Mercury: 'PHX', Storm: 'SEA', Mystics: 'WSH', Valkyries: 'GS', Tempo: 'TOR' } : { Hawks: 'ATL', Celtics: 'BOS', Nets: 'BKN', Hornets: 'CHA', Bulls: 'CHI', Cavaliers: 'CLE', Mavericks: 'DAL', Nuggets: 'DEN', Pistons: 'DET', Warriors: 'GS', Rockets: 'HOU', Pacers: 'IND', Clippers: 'LAC', Lakers: 'LAL', Grizzlies: 'MEM', Heat: 'MIA', Bucks: 'MIL', Timberwolves: 'MIN', Pelicans: 'NO', Knicks: 'NY', Thunder: 'OKC', Magic: 'ORL', '76ers': 'PHI', Suns: 'PHX', 'Trail Blazers': 'POR', Kings: 'SAC', Spurs: 'SA', Raptors: 'TOR', Jazz: 'UTAH', Wizards: 'WSH' };
const nickAbbr = n => { n = String(n || ''); const k = Object.keys(H_NICK).find(x => n.endsWith(' ' + x)); return k ? H_NICK[k] : null; };
const hColor = a => a && H_KNOWN.has(hAbbr(a)) ? teamColor(hAbbr(a)) : null;
// a legend's main team: the one they played the most games for
const mainTeam = L => { const m = {}; (L?.seasons || []).forEach(x => { if (x[2] && !/TM$/.test(x[2])) m[x[2]] = (m[x[2]] || 0) + (x[3] || 1); }); return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
// a player's photo (ESPN's headshot). Where ESPN has none: a card in their main team's colours with their initials and the team logo
function hyMono(name, cls, team) { const c = hColor(team); return `<div class="${cls} hy-mono"${c ? ` style="--mc:${c}"` : ''}><span>${esc(initials(name))}</span>${team && H_KNOWN.has(hAbbr(team)) ? logo(hAbbr(team), 40, 'lg hy-mlg') : ''}</div>`; }
// photos added by hand (data/photos/<Basketball-Reference id>.webp): cut-outs, framed like ESPN's headshots
const H_OWN = new Set(["abdulka01", "adamsal01", "aguirma01", "anderke01", "baileth01", "barklch01", "barrybr01", "barryri01", "bayloel01", "bellawa01", "benjabe01", "bingda01", "birdla01", "blackro01", "blaylmo01", "boguemu01", "bolma01", "bradlsh01", "brandte01", "bridgbi01", "brownfr01", "brownpj01", "bucknqu01", "cagemi01", "campbel01", "carrojo01", "cassesa01", "chambto01", "chambwi01", "cheekma01", "chrisdo01", "colemde01", "coopewa01", "corbity01", "cousybo01", "cowenda01", "cummite01", "dantlad01", "davisbr01", "davisda01", "daviswa03", "debusda01", "divacvl01", "donalja01", "douglsh01", "drexlcl01", "dumarjo01", "eatonma01", "edwarja01", "ellisda01", "ellisle01", "embrywa01", "englial01", "ervinju01", "ewingpa01", "finlemi01", "floydsl01", "foustla01", "foylead01", "fraziwa01", "freewo01", "gervige01", "gillke01", "gilmoar01", "goodrga01", "grantho01", "greenac01", "greenri01", "greerha01", "hairsha01", "hardati01", "harpede01", "harpero01", "havlijo01", "hawkihe01", "hayesel01", "hornaje01", "horryro01", "houstal01", "howelba01", "hudsolo01", "iversal01", "jacksma01", "johnsav01", "johnsde01", "johnsed03", "johnser02", "johnske02", "johnsma02", "jonesca01", "jonesed02", "jordami01", "kempsh01", "kerseje01", "kingbe01", "knighbr01", "laimbbi01", "langan01", "laniebo01", "leverfa01", "listeal01", "lucasje01", "lucasjo01", "lucasma01", "mahorri01", "majerda01", "malonka01", "malonmo01", "marbust01", "maxwece01", "maxweve01", "mcadobo01", "mchalke01", "mcmilna01", "millere01", "monroea01", "mournal01", "mullich01", "murphca01", "mutomdi01", "nancela01", "newmajo01", "nixonno01", "oaklech01", "olajuha01", "ostergr01", "outlabo01", "parisro01", "paytoga01", "perkisa01", "pettibo01", "porteke01", "portete01", "pricema01", "reedwi01", "ricegl01", "richami01", "richmmi01", "riverdo01", "roberal01", "roberos01", "robincl02", "robinda01", "rodgegu01", "rodmade01", "rollitr01", "roundda01", "russebi01", "schaydo01", "schrede01", "scottby01", "sikmaja01", "silaspa01", "smithra01", "smitsri01", "sprewla01", "stockjo01", "stoudda01", "stricro02", "theusre01", "thomais01", "thompmy01", "thorpot01", "thurmna01", "tylerte01", "unselwe01", "vanexni01", "vanlino01", "walkean02", "walkech01", "waltobi01", "webbech01", "wesleda01", "westje01", "westma01", "whitejo01", "wilkele01", "wilkido01", "willibu01", "willigu01", "willihe01", "williho01", "willike02", "worthja01"]);
const H_OWN_ESPN = {"4145": "abdulka01", "4417": "adamsal01", "3621": "aguirma01", "15": "anderke01", "3633": "baileth01", "37": "barklch01", "42": "barrybr01", "4122": "barryri01", "4135": "bayloel01", "4510": "bellawa01", "51": "benjabe01", "4146": "bingda01", "2335": "birdla01", "3640": "blackro01", "68": "blaylmo01", "3642": "bolma01", "88": "bradlsh01", "92": "brandte01", "99": "brownpj01", "127": "campbel01", "4670": "carrojo01", "138": "cassesa01", "3662": "chambto01", "4142": "chambwi01", "4694": "cheekma01", "147": "chrisdo01", "156": "colemde01", "4737": "coopewa01", "163": "corbity01", "4133": "cousybo01", "4132": "cowenda01", "171": "cummite01", "4777": "dantlad01", "187": "davisda01", "4800": "daviswa03", "4124": "debusda01", "205": "divacvl01", "3684": "donalja01", "210": "douglsh01", "3686": "drexlcl01", "3689": "dumarjo01", "3693": "eatonma01", "228": "ellisda01", "4892": "ellisle01", "4895": "embrywa01", "4900": "englial01", "4130": "ervinju01", "237": "ewingpa01", "242": "finlemi01", "3703": "floydsl01", "4955": "foustla01", "254": "foylead01", "4129": "fraziwa01", "4961": "freewo01", "4131": "gervige01", "269": "gillke01", "5008": "gilmoar01", "5022": "goodrga01", "279": "grantho01", "284": "greenac01", "5049": "greenri01", "4143": "greerha01", "2528210": "hardati01", "3609": "harpede01", "4397251": "harpero01", "4120": "havlijo01", "317": "hawkihe01", "4134": "hayesel01", "346": "hornaje01", "347": "horryro01", "349": "houstal01", "5203": "howelba01", "5206": "hudsolo01", "366": "iversal01", "393": "johnser02", "2334": "johnsma02", "5283": "jonesca01", "402": "jonesed02", "1035": "jordami01", "420": "kempsh01", "426": "kerseje01", "5352": "kingbe01", "440": "knighbr01", "3759": "laimbbi01", "455": "langan01", "5410": "laniebo01", "3763": "leverfa01", "3769": "listeal01", "4137": "lucasje01", "5473": "lucasjo01", "5472": "lucasma01", "3774": "mahorri01", "500": "majerda01", "501": "malonka01", "3776": "malonmo01", "509": "marbust01", "5524": "maxwece01", "521": "maxweve01", "5533": "mcadobo01", "4144": "mchalke01", "2679": "mcmilna01", "552": "millere01", "4136": "monroea01", "580": "mournal01", "582": "mullich01", "5668": "murphca01", "588": "mutomdi01", "2580365": "nancela01", "602": "newmajo01", "616": "oaklech01", "619": "olajuha01", "622": "ostergr01", "623": "outlabo01", "3814": "parisro01", "3134903": "paytoga01", "650": "perkisa01", "4140": "pettibo01", "4397140": "porteke01", "668": "portete01", "3822": "pricema01", "4141": "reedwi01", "702": "ricegl01", "704": "richmmi01", "3829": "roberal01", "4119": "roberos01", "714": "robincl02", "715": "robinda01", "5926": "rodgegu01", "726": "rodmade01", "3832": "rollitr01", "4152": "russebi01", "4128": "schaydo01", "757": "schrede01", "3483": "scottby01", "6040": "sikmaja01", "6042": "silaspa01", "795": "smitsri01", "800": "sprewla01", "812": "stockjo01", "817": "stoudda01", "818": "stricro02", "6165": "theusre01", "3507": "thomais01", "6180": "thompmy01", "855": "thorpot01", "4139": "thurmna01", "6225": "tylerte01", "4148": "unselwe01", "868": "vanexni01", "881": "walkean02", "6263": "walkech01", "4127": "waltobi01", "897": "webbech01", "904": "wesleda01", "4151": "westje01", "906": "westma01", "4121": "wilkele01", "3532": "wilkido01", "3534": "willibu01", "6352": "willigu01", "3536": "willihe01", "937": "willike02", "3547": "worthja01"};
const ownKey = k => H_OWN.has(k) ? k : H_OWN_ESPN[k] || null;
const ownPhoto = (key, name, cls, team) => { const f = ownKey(key); if (!f) return ''; const c = hColor(team); return `<img class="${cls} hy-own" src="${new URL(`data/photos/${f}.webp`, document.baseURI).href}" alt="${esc(name)}" loading="lazy" draggable="false"${c ? ` style="--mc:${c}"` : ''}>`; };
function hyFace(id, name, cls, w, team, photo) {
  if (id && ownKey(id)) return ownPhoto(id, name, cls, team);
  if (!id || photo === false) return hyMono(name, cls, team);
  const fb = hyMono(name, cls, team).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<img class="${cls}" src="${headSrc(id, w)}" alt="${esc(name)}" loading="lazy" draggable="false" onerror="this.outerHTML=this.dataset.fb" data-fb="${fb}">`;
}
const legFace = (H, id, name, cls, w) => { if (ownKey(id)) return ownPhoto(id, name, cls, mainTeam(H?.legends?.[id])); const L = H?.legends?.[id], e = L?.espn || H?.espn?.[id]; return hyFace(e, name, cls, w, mainTeam(L), L ? L.photo : (H?.nophoto || []).includes(e) ? false : undefined); };
const H_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
const H_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
const hNum = (v, d = 1) => v == null ? '–' : Number(v).toFixed(d);
const hPct = v => v == null ? '–' : (v * 100).toFixed(1);
const hInt = v => v == null ? '–' : Number(v).toLocaleString('en-US');
const hDob = s => { const m = String(s || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : (s || ''); };
const STAT_ONE = { pts: 'point', trb: 'rebound', ast: 'assist', stl: 'steal', blk: 'block', fg3: '3-pointer', g: 'game' };
const STAT_NAME = { pts: 'Points', trb: 'Rebounds', ast: 'Assists', stl: 'Steals', blk: 'Blocks', fg3: '3-pointers', g: 'Games' };
async function hyPool(items, k, fn) { const out = new Array(items.length); let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const j = i++; out[j] = await fn(items[j]).catch(() => []); } })); return out; }
let HS0 = 'day'; try { HS0 = localStorage.getItem('fc-histtab') || 'day'; } catch (e) {}
const HS = { tab: HS0, sort: 'pts', day: null, season: null, rec: 'pts', era: 'all', q: '' };

async function renderHistory() {
  const root = $('#histBody'); if (!root) return;
  if (!root._wired) { root._wired = true; wireHistory(root); }
  root.innerHTML = `<div class="seg hy-seg" id="histSeg"><span class="knob"></span>${[['day', 'On this day'], ['seasons', 'Seasons'], ['records', 'Records'], ['legends', 'Legends']].map(([k, t]) => `<button data-htab="${k}" aria-pressed="${HS.tab === k}">${t}</button>`).join('')}</div><div id="histPane"><div class="sk" style="height:420px;border-radius:16px"></div></div>`;
  requestAnimationFrame(() => placeKnob($('#histSeg')));
  if (LGK !== 'nba' && LGK !== 'wnba') { $('#histPane').innerHTML = `<div class="empty"><b>History covers the NBA and WNBA</b><span>Pick a league to see its past games, seasons, records and legends.</span><button class="btn" data-lg="wnba">WNBA history</button><button class="btn" data-lg="nba">Switch to NBA</button></div>`; return; }
  const pane = $('#histPane');
  try {
    if (HS.tab === 'day') await histDay(pane);
    else if (HS.tab === 'seasons') await histSeasons(pane);
    else if (HS.tab === 'records') await histRecords(pane);
    else await histLegends(pane);
  } catch (e) { if (pane.isConnected) pane.innerHTML = `<div class="empty"><b>History didn't load</b><button class="btn" data-hretry>Try again</button></div>`; }
  wireDrag(pane);
}

/* ---------- On this day ---------- */
const otdKey = ymd => `fc-otd:${ymd}`;
async function otdGames(ymd) {
  try { const c = localStorage.getItem(otdKey(ymd)); if (c) return JSON.parse(c); } catch (e) {}
  const d = await getJSON(`${API}/scoreboard?dates=${ymd}`, { retries: 1 }).catch(() => null);
  if (!d) return [];
  const games = (d.events || []).filter(e => e.status?.type?.completed).map(e => {
    const c = e.competitions[0], side = ha => { const x = c.competitors.find(y => y.homeAway === ha); const L = (x.leaders || []).find(l => /^points/.test(l.name)) || x.leaders?.[0]; const a = L?.leaders?.[0]; return { abbr: x.team.abbreviation, name: x.team.shortDisplayName || x.team.name, score: +x.score, win: !!x.winner, lead: a ? { id: String(a.athlete?.id || ''), name: a.athlete?.displayName || '', v: +a.value || +a.displayValue || 0 } : null }; };
    return { id: e.id, ymd, away: side('away'), home: side('home'), ot: (c.status?.period || 4) > 4, note: c.notes?.[0]?.headline || '' };
  });
  try { localStorage.setItem(otdKey(ymd), JSON.stringify(games)); } catch (e) {}
  return games;
}
async function histDay(pane) {
  // the WNBA plays May to early October: in its off-season, start on a midsummer day instead of today
  const offW = HW && !HS.day && !(+S.today.slice(4, 6) >= 5 && +S.today.slice(4, 6) <= 9);
  const md = HS.day || (offW ? '0715' : S.today.slice(4)), y0 = +S.today.slice(0, 4); HS.shown = md;
  const years = []; for (let y = md < S.today.slice(4) ? y0 : y0 - 1; y >= 2001; y--) years.push(y);
  pane.innerHTML = `<div class="hy-dctl"><div class="hy-step"><button class="hy-sb" data-hdstep="-1" aria-label="Day before">${H_PREV}</button><label class="hy-date"><input type="date" data-hday value="${y0}-${md.slice(0, 2)}-${md.slice(2)}" aria-label="Date"></label><button class="hy-sb" data-hdstep="1" aria-label="Day after">${H_NEXT}</button></div>${HS.day && HS.day !== S.today.slice(4) ? '<button class="chip" data-hdstep="0">Back to today</button>' : ''}<span class="hy-note">${offW ? 'The WNBA is between seasons, so here\'s July 15. Pick any date.' : `Every ${LGN} game on this date since ${HW ? 2002 : 2001}`}</span></div><div class="sk" style="height:360px;border-radius:16px"></div>`;
  const [lists, H] = await Promise.all([hyPool(years, 6, y => otdGames(`${y}${md}`)), loadHist().catch(() => null)]);
  if (!pane.isConnected) return;
  const all = lists.flat();
  const perf = all.flatMap(g => [g.away, g.home].map(s => s.lead && { ...s.lead, team: s.abbr, opp: s === g.away ? g.home.abbr : g.away.abbr, g, yr: g.ymd.slice(0, 4) })).filter(Boolean).sort((a, b) => b.v - a.v).slice(0, 8);
  const close = all.filter(g => Math.abs(g.away.score - g.home.score) <= 3 || g.ot).sort((a, b) => Math.abs(a.away.score - a.home.score) - Math.abs(b.away.score - b.home.score)).slice(0, 6);
  const born = H ? Object.entries(H.legends).filter(([, L]) => L.born && L.born.slice(5).replace('-', '') === md).map(([id, L]) => ({ id, ...L })) : [];
  const dayName = fmtDay(`${y0}${md}`, { month: 'long', day: 'numeric' });
  const gRow = g => `<button class="hy-g" data-game="${g.id}"><span>${hLogo(g.away.abbr, 40)}<b class="${g.away.win ? 'w' : ''}">${esc(g.away.abbr)} ${g.away.score}</b></span><i>@</i><span>${hLogo(g.home.abbr, 40)}<b class="${g.home.win ? 'w' : ''}">${esc(g.home.abbr)} ${g.home.score}</b></span>${g.ot ? '<em>OT</em>' : ''}${(g.away.win ? g.away : g.home).lead ? `<small>${esc((g.away.win ? g.away : g.home).lead.name)} ${(g.away.win ? g.away : g.home).lead.v}</small>` : ''}</button>`;
  pane.querySelector('.sk')?.remove();
  pane.insertAdjacentHTML('beforeend', `
    ${perf.length ? `<button class="hy-spot" data-game="${perf[0].g.id}" style="--tc:${hColor(perf[0].team) || 'var(--accent)'}">${hyFace(perf[0].id, perf[0].name, 'hy-spf', 400, perf[0].team)}<span class="hy-spt"><span class="eyebrow">${esc(dayName)}, ${perf[0].yr} · the biggest night on this date</span><b>${esc(perf[0].name)}</b><em><strong>${perf[0].v}</strong> points</em><small>${hLogo(perf[0].team, 40)}${esc(perf[0].g.away.abbr)} ${perf[0].g.away.score} @ ${esc(perf[0].g.home.abbr)} ${perf[0].g.home.score}${perf[0].g.ot ? ' (OT)' : ''} · tap for the box score</small></span></button>
    ${perf.length > 1 ? `<section class="hy-sec"><h3>More big nights</h3><div class="hy-perf">${perf.slice(1).map(p => `<button class="hy-pf" data-game="${p.g.id}">${hyFace(p.id, p.name, 'hy-pff', 160, p.team)}<span><b>${esc(p.name)}</b><small><strong>${p.v} pts</strong> · ${esc(p.team)} vs ${esc(p.opp)} · ${p.yr}</small></span></button>`).join('')}</div></section>` : ''}` : ''}
    ${born.length ? `<section class="hy-sec"><h3>Born on ${esc(dayName)}</h3><div class="hy-born">${born.map(L => `<button class="hy-chip" data-hleg="${esc(L.id)}">${legFace(H, L.id, L.name, 'hy-bf', 80)}<span><b>${esc(L.name)}</b><small>${L.born.slice(0, 4)}${L.hof ? ' · Hall of Fame' : ''}</small></span></button>`).join('')}</div></section>` : ''}
    ${close.length ? `<section class="hy-sec"><h3>Down to the wire</h3><div class="hy-gl">${close.map(g => `<div class="hy-gy"><span>${g.ymd.slice(0, 4)}</span>${gRow(g)}</div>`).join('')}</div></section>` : ''}
    <section class="hy-sec"><h3>Every year on ${esc(dayName)}</h3>${years.map((y, i) => lists[i].length ? `<details class="hy-yr"${i < 2 ? ' open' : ''}><summary><b>${y}</b><span>${lists[i].length} game${lists[i].length === 1 ? '' : 's'}</span></summary><div class="hy-gl">${lists[i].map(gRow).join('')}</div></details>` : '').join('') || '<p class="hy-note">No games on this date in the years we have. Try another day.</p>'}</section>
    <p class="hy-src">Games and box scores from ESPN. Tap any game for its box score.</p>`);
}

/* ---------- Seasons ---------- */
async function histSeasons(pane) {
  const H = await loadHist(); if (!pane.isConnected) return;
  const ch = H.champions.slice().sort((a, b) => b.y - a.y);
  if (!HS.season) HS.season = ch[0].y;
  const y = HS.season, c = ch.find(x => x.y === y), m = H.mvp.find(x => x.y === y);
  const counts = {}; ch.forEach(x => { counts[x.champ] = (counts[x.champ] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const label = sLabel;
  const ca = nickAbbr(c?.champ), ra = nickAbbr(c?.runner), lo = ch.at(-1).y, hi = ch[0].y;
  const fName = c?.fmvpId && H.legends[c.fmvpId]?.name || c?.fmvp;
  pane.innerHTML = `<div class="hy-dctl"><div class="hy-step"><button class="hy-sb" data-hsstep="-1" data-min="${lo}" data-max="${hi}" aria-label="Season before"${y <= lo ? ' disabled' : ''}>${H_PREV}</button><select class="hy-sel" data-hseason aria-label="Season">${ch.map(x => `<option value="${x.y}"${x.y === y ? ' selected' : ''}>${label(x.y)}</option>`).join('')}</select><button class="hy-sb" data-hsstep="1" data-min="${lo}" data-max="${hi}" aria-label="Season after"${y >= hi ? ' disabled' : ''}>${H_NEXT}</button></div><span class="hy-note">${ch.length} seasons, ${label(lo)} to ${label(hi)}</span></div>
    <div class="hy-champ">
      <div class="hy-cc" style="--tc:${hColor(ca) || '#C9A227'}">${ca ? logo(ca, 160, 'lg hy-ccl') : ''}<div><span class="eyebrow">${esc(label(y))} ${LGN} champion</span><h2>${esc(c?.champ || '–')}</h2><p>Beat the ${ra ? logo(ra, 40, 'lg hy-ril') : ''}<b>${esc(c?.runner || '–')}</b> in the Finals</p></div></div>
      <div class="hy-awd">
        ${c?.fmvp ? `<button class="hy-mvp" ${c.fmvpId ? `data-hleg="${esc(c.fmvpId)}"` : ''}>${legFace(H, c.fmvpId, fName, 'hy-mvpf', 160)}<span><span class="eyebrow">Finals MVP</span><b>${esc(fName)}</b><small>${esc(c.champ)}</small></span></button>` : ''}
        ${m ? `<button class="hy-mvp" data-hleg="${esc(m.id)}">${legFace(H, m.id, m.name, 'hy-mvpf', 160)}<span><span class="eyebrow">Regular-season MVP</span><b>${esc(m.name)}</b><small>${esc(m.team || '')}</small></span></button>` : ''}
      </div>
    </div>
    <div id="hsSeasonBody">${y >= (HW ? 2003 : 2002) ? '<div class="sk" style="height:320px;border-radius:16px"></div>' : `<p class="hy-note">Standings and stat leaders here go back to ${HW ? '2003' : '2001-02'}. Champions and MVPs go back to the start.</p>`}</div>
    <section class="hy-sec"><h3>Most titles</h3><div class="hy-titles">${top.map(([t, n]) => { const a = nickAbbr(t); return `<div style="--tc:${hColor(a) || '#C9A227'}">${a ? logo(a, 64, 'lg') : ''}<b>${n}</b><span>${esc(t)}</span></div>`; }).join('')}</div></section>
    <details class="hy-yr"><summary><b>Every champion</b><span>${ch.length} seasons</span></summary><div class="box-wrap"><table class="box hy-tbl hy-ctbl"><thead><tr><th>Season</th><th>Champion</th><th>Runner-up</th><th>Finals MVP</th><th>MVP</th></tr></thead><tbody>${ch.map(x => { const mv = H.mvp.find(z => z.y === x.y); return `<tr data-hseasongo="${x.y}"${x.y === y ? ' class="cur"' : ''}><td>${esc(label(x.y))}</td><td><span class="hy-tm">${nickAbbr(x.champ) ? logo(nickAbbr(x.champ), 40) : ''}<b>${esc(x.champ)}</b></span></td><td>${esc(x.runner)}</td><td>${esc(x.fmvp || '')}</td><td>${esc(mv?.name || '')}</td></tr>`; }).join('')}</tbody></table></div></details>`;
  if (y < 2002) return;
  const sq = `&season=${y}&seasontype=2`;
  const cats = [['offensive.avgPoints', 'Points', 'offensive', 'avgPoints'], ['general.avgRebounds', 'Rebounds', 'general', 'avgRebounds'], ['offensive.avgAssists', 'Assists', 'offensive', 'avgAssists'], ['defensive.avgSteals', 'Steals', 'defensive', 'avgSteals'], ['defensive.avgBlocks', 'Blocks', 'defensive', 'avgBlocks']];
  const [std, ...leads] = await Promise.all([getJSON(`${API2}/standings?season=${y}`).catch(() => null), ...cats.map(([k]) => getJSON(`${WEB}/statistics/byathlete?region=us&lang=en&contentorigin=espn&isqualified=true&page=1&limit=5&sort=${k}:desc${sq}`).catch(() => null))]);
  const body = $('#hsSeasonBody'); if (!body) return;
  const confs = (std?.children || []).map(cf => ({ name: cf.name, rows: (cf.standings?.entries || []).map(e => { const st = n => e.stats?.find(s => s.name === n || s.type === n); return { t: e.team, w: +st('wins')?.value || 0, l: +st('losses')?.value || 0 }; }).sort((a, b) => (b.w - b.l) - (a.w - a.l) || b.w - a.w) }));
  const lead = (d, [, name, cat, stat]) => { const idx = d?.categories?.find(x => x.name === cat)?.names?.indexOf(stat) ?? -1; return `<div class="hy-lc"><h4>${name}</h4>${(d?.athletes || []).map(a => { const v = a.categories?.find(x => x.name === cat)?.values?.[idx]; return `<button class="hy-lr" data-hespn="${a.athlete.id}">${hyFace(a.athlete.id, a.athlete.displayName, 'hy-lf', 80, a.athlete.teamShortName || null)}<span>${esc(a.athlete.displayName)}</span><b>${hNum(v)}</b></button>`; }).join('') || '<p class="hy-note">–</p>'}</div>`; };
  body.innerHTML = `${confs.length ? `<section class="hy-sec"><h3>Final standings</h3><div class="hy-std">${confs.map(cf => `<div><h4>${esc(cf.name)}</h4><table class="box hy-tbl hy-stbl"><tbody>${cf.rows.map((r, i) => `<tr><td>${i + 1}</td><td><span class="hy-tm">${hLogo(r.t.abbreviation, 40)}${esc(r.t.shortDisplayName || r.t.name || r.t.abbreviation)}</span></td><td>${r.w}-${r.l}</td></tr>`).join('')}</tbody></table></div>`).join('')}</div></section>` : ''}
    <section class="hy-sec"><h3>Stat leaders <span>per game</span></h3><div class="hy-leads">${cats.map((c, i) => lead(leads[i], c)).join('')}</div></section>
    <button class="btn ghost" data-hgo="${y}${HW ? '0715' : '0115'}">Browse ${esc(label(y))} games on Scores</button>`;
}

/* ---------- Records ---------- */
async function histRecords(pane) {
  const H = await loadHist(); if (!pane.isConnected) return;
  const k = HS.rec, L = H.leaders[k] || [];
  const photo = (r, cls = 'hy-rf', w = 80) => legFace(H, r.id, r.name, cls, w);
  // milestone watch: active players and the next name above them, across every board
  const watch = Object.entries(H.leaders).flatMap(([kk, list]) => list.slice(0, 50).map((r, i) => r.active && i > 0 ? { k: kk, r, above: list[i - 1], gap: list[i - 1].v - r.v, rank: i + 1 } : null).filter(Boolean)).filter(x => x.gap > 0).sort((a, b) => a.gap / a.above.v - b.gap / b.above.v).slice(0, 8);
  pane.innerHTML = `<div class="chips hy-rchips">${Object.keys(H.leaders).map(kk => `<button class="chip" data-hrec="${kk}" aria-pressed="${kk === k}">${esc(STAT_NAME[kk] || kk)}</button>`).join('')}</div>
    ${watch.length ? `<section class="hy-sec"><h3>Milestone watch <span>active players closing in</span></h3><div class="hy-watch">${watch.map(w => `<button class="hy-w" data-hleg="${esc(w.r.id)}">${photo(w.r)}<span><b>${esc(w.r.name)}</b><small>${hInt(w.gap)} ${esc(w.gap === 1 ? (STAT_ONE[w.k] || w.k) : (STAT_NAME[w.k] || w.k).toLowerCase())} from passing ${esc(w.above.name)} for #${w.rank - 1}</small></span></button>`).join('')}</div></section>` : ''}
    <section class="hy-sec"><h3>Career ${esc(STAT_NAME[k] || k)} <span>${LGN}, regular season</span></h3>
    <div class="hy-pod">${L.slice(0, 3).map((r, i) => `<button class="hy-pd p${i + 1}" data-hleg="${esc(r.id)}" style="--tc:${hColor(mainTeam(H.legends[r.id])) || 'var(--accent)'}"><i>${i + 1}</i>${photo(r, 'hy-pdf', 260)}<b>${esc(r.name)}</b><strong>${hInt(r.v)}</strong><small>${esc((STAT_NAME[k] || k).toLowerCase())}${r.active ? ' · active' : ''}</small></button>`).join('')}</div>
    <div class="hy-rlist">${L.slice(3, 50).map((r, i) => `<button class="hy-rr${r.active ? ' act' : ''}" data-hleg="${esc(r.id)}"><span class="hy-rn">${r.r || i + 4}</span>${photo(r)}<span class="hy-rnm"><b>${esc(r.name)}</b>${r.active ? '<em>Active</em>' : ''}${r.hof ? '<i title="Hall of Fame">HOF</i>' : ''}</span><span class="hy-rbar"><s style="width:${(r.v / L[0].v * 100).toFixed(1)}%"></s></span><strong>${hInt(r.v)}</strong></button>`).join('')}</div></section>
    <p class="hy-src">Career totals from Basketball-Reference, updated ${esc(new Date(H.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))} (every Tuesday). Active players' totals include this season up to then.</p>`;
}

/* ---------- Legends + search ---------- */
async function histLegends(pane) {
  const H = await loadHist(); if (!pane.isConnected) return;
  const rank = id => { const i = H.leaders.pts.findIndex(r => r.id === id); return i < 0 ? 999 : i; };
  const era = L => { const y = +(L.seasons[0]?.[0] || '0000').slice(0, 4); return HW ? (y < 2005 ? 'w97' : y < 2013 ? 'w05' : y < 2020 ? 'w13' : 'w20') : y < 1980 ? 'pre80' : y < 1990 ? '80s' : y < 2000 ? '90s' : y < 2010 ? '00s' : '10s'; };
  const isAct = id => Object.values(H.leaders).some(l => l.some(r => r.id === id && r.active));
  const cnt = (L, re) => { const x = (L.bling || []).find(b => re.test(b)); return x ? (+(x.match(/^(\d+)x/) || [])[1] || 1) : 0; };
  const SORTS = { pts: (a, b) => rank(a.id) - rank(b.id), rings: (a, b) => cnt(b, /W?NBA Champ/) - cnt(a, /W?NBA Champ/) || rank(a.id) - rank(b.id), mvp: (a, b) => cnt(b, /^(\d+x )?MVP$|^\d{4}(-\d{2})? MVP$/) - cnt(a, /^(\d+x )?MVP$|^\d{4}(-\d{2})? MVP$/) || rank(a.id) - rank(b.id), ppg: (a, b) => (b.career?.[5] || 0) - (a.career?.[5] || 0), az: (a, b) => a.name.split(' ').at(-1).localeCompare(b.name.split(' ').at(-1)) };
  let list = Object.entries(H.legends).map(([id, L]) => ({ id, ...L })).sort(SORTS[HS.sort] || SORTS.pts);
  if (HS.era === 'hof') list = list.filter(L => L.hof); else if (HS.era === 'active') list = list.filter(L => isAct(L.id)); else if (HS.era !== 'all') list = list.filter(L => era(L) === HS.era);
  const tag = L => { const b = L.bling || [], pick = re => b.find(x => re.test(x)); return [pick(/W?NBA Champ/), pick(/^(\d+x )?MVP$|^\d{4}(-\d{2})? MVP$/), pick(/All Star/)].filter(Boolean).map(x => x.replace(/W?NBA Champ/, 'Champ').replace('All Star', 'All-Star')).join(' · '); };
  const span = L => L.seasons.length ? `${L.seasons[0][0].slice(0, 4)}–${(+L.seasons.at(-1)[0].slice(0, 4) + (HW ? 0 : 1))}` : '';
  pane.innerHTML = `<div class="hy-search"><input class="hy-q" type="search" data-hq placeholder="Search any player, past or present" value="${esc(HS.q)}" autocomplete="off" spellcheck="false" aria-label="Search any player"><div class="hy-res" id="hsRes"></div></div>
    <div class="chips hy-rchips">${[['all', 'All'], ['hof', 'Hall of Fame'], ['active', 'Active'], ...(HW ? [['w97', '1997-2004'], ['w05', '2005-2012'], ['w13', '2013-2019'], ['w20', '2020s']] : [['pre80', 'Before 1980'], ['80s', '1980s'], ['90s', '1990s'], ['00s', '2000s'], ['10s', '2010s+']])].map(([k, t]) => `<button class="chip" data-hera="${k}" aria-pressed="${HS.era === k}">${t}</button>`).join('')}</div>
    <div class="hy-lbar"><span class="hy-note">${list.length} player${list.length === 1 ? '' : 's'}</span><div class="hy-sort">Sort <div class="seg hy-sortseg">${[['pts', 'All-time points'], ['rings', 'Titles'], ['mvp', 'MVPs'], ['ppg', 'Career PPG'], ['az', 'A–Z']].map(([k, t]) => `<button data-hsort="${k}" aria-pressed="${HS.sort === k}">${t}</button>`).join('')}</div></div></div>
    <div class="hy-lgrid">${list.map(L => { const tm = mainTeam(L); return `<button class="hy-lg" data-hleg="${esc(L.id)}" style="--tc:${hColor(tm) || 'var(--surface-3)'}">${hyFace(L.espn, L.name, 'hy-lgf', 260, tm, L.photo)}<b>${esc(L.name)}</b><small>${esc(span(L))}${L.hof ? ' · <span class="hof">HOF</span>' : ''}</small>${L.career?.[5] != null ? `<span class="hy-lgs"><span><strong>${hNum(L.career[5])}</strong>PTS</span><span><strong>${hNum(L.career[6])}</strong>REB</span><span><strong>${hNum(L.career[7])}</strong>AST</span></span>` : ''}<em>${esc(tag(L))}</em></button>`; }).join('')}</div>
    <p class="hy-src">${Object.keys(H.legends).length} all-time greats: the top of the career leader boards and every MVP. Search finds anyone else ESPN has.</p>`;
  if (HS.q) histSearch(HS.q);
}
let hsT = 0;
async function histSearch(q) {
  const box = $('#hsRes'); if (!box) return;
  q = q.trim(); if (q.length < 2) { box.innerHTML = ''; return; }
  const my = ++hsT;
  const [d, H] = await Promise.all([getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(q)}&limit=12&type=player`).catch(() => null), loadHist().catch(() => null)]);
  if (my !== hsT || !box.isConnected) return;
  const hits = (d?.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).filter(c => c.description === LGN).slice(0, 8);
  const brOf = espn => H ? Object.entries(H.legends).find(([, L]) => L.espn === espn)?.[0] : null;
  box.innerHTML = hits.length ? hits.map(c => { const id = c.uid?.match(/a:(\d+)/)?.[1]; const br = id && brOf(id); return id ? `<button class="hy-hit" ${br ? `data-hleg="${esc(br)}"` : `data-hespn="${id}"`}>${br ? legFace(H, br, c.displayName, 'hy-lf', 80) : hyFace(id, c.displayName, 'hy-lf', 80)}<span><b>${esc(c.displayName)}</b><small>${esc(c.subtitle || '')}</small></span></button>` : ''; }).join('') : `<p class="hy-note">No ${LGN} players found.</p>`;
}

/* ---------- player profile (legend from history.json, or anyone from ESPN) ---------- */
async function openLegend({ br, espn }) {
  if (br && !espn && !(await loadHist().catch(() => null))?.legends[br]) { const H0 = await loadHist().catch(() => null); espn = H0?.espn?.[br]; if (!espn) { const n = Object.values(H0?.leaders || {}).flat().find(r => r.id === br)?.name; if (n) { const d = await getJSON(`https://site.web.api.espn.com/apis/search/v2?query=${encodeURIComponent(n)}&limit=6&type=player`).catch(() => null); espn = (d?.results || []).flatMap(r => r.type === 'player' ? r.contents || [] : []).find(c => c.description === 'NBA')?.uid?.match(/a:(\d+)/)?.[1]; } } }
  const sheet = openSheet('Player'); sheet.el.classList.add('hy-sheet');
  sheet.body.innerHTML = '<div class="sk" style="height:520px;border-radius:16px"></div>';
  const H = await loadHist().catch(() => null);
  let P = null;
  if (br && H?.legends[br]) { const L = H.legends[br]; P = { ...L, br, espn: L.espn, src: 'br' }; }
  else if (espn) {
    const [a, st, ov] = await Promise.all([getJSON(`${WEB}/athletes/${espn}`).catch(() => null), getJSON(`${WEB}/athletes/${espn}/stats`).catch(() => null), getJSON(`${WEB}/athletes/${espn}/overview`).catch(() => null)]);
    const A = a?.athlete || a || {};
    const cat = st?.categories?.find(c => c.name === 'averages'), lab = cat?.labels || [], ix = k => lab.indexOf(k);
    const seasons = (cat?.statistics || []).map(r => { const s = r.stats || [], n = k => (ix(k) >= 0 ? +s[ix(k)] : null), pct = k => (ix(k) >= 0 ? +s[ix(k)] / 100 : null); return [r.season?.displayName || '', null, (Object.values(S.teams).find(t => String(t.id) === String(r.teamId))?.abbr) || r.teamSlug?.split('-').map(x => x[0]).join('').toUpperCase() || '', n('GP'), n('MIN'), n('PTS'), n('REB'), n('AST'), n('STL'), n('BLK'), pct('FG%'), pct('3P%'), pct('FT%')]; });
    const tot = cat?.totals || [], tn = k => (ix(k) >= 0 ? +tot[ix(k)] : null);
    P = { src: 'espn', espn, name: A.displayName || 'Player', pos: A.position?.displayName || '', ht: A.displayHeight || '', born: hDob(A.displayDOB), died: hDob(A.displayDOD), college: A.college?.name || '', draft: A.displayDraft || '', active: A.active, seasons, career: tot.length ? [`${seasons.length} Yrs`, null, null, tn('GP'), tn('MIN'), tn('PTS'), tn('REB'), tn('AST'), tn('STL'), tn('BLK'), tn('FG%') / 100, tn('3P%') / 100, tn('FT%') / 100] : null, bling: (ov?.awards || []).map(x => `${x.displayCount && x.displayCount !== '1x' ? x.displayCount + ' ' : ''}${x.name}`) };
    const br2 = H && Object.entries(H.legends).find(([, L]) => L.espn === String(espn))?.[0]; if (br2) { const L = H.legends[br2]; P = { ...L, br: br2, espn: L.espn, src: 'br', active: P.active }; }
  }
  if (!P) { sheet.body.innerHTML = '<div class="empty"><b>Couldn\'t load that player</b></div>'; return; }
  setTitle(sheet, P.name);
  const ranks = H ? Object.entries(H.leaders).map(([k, l]) => { const i = l.findIndex(r => r.id === P.br); return i >= 0 ? `#${i + 1} in ${(STAT_NAME[k] || k).toLowerCase()}` : null; }).filter(Boolean) : [];
  const active = P.active ?? (H ? Object.values(H.leaders).some(l => l.some(r => r.id === P.br && r.active)) : false);
  const team = P.seasons.map(s => s[2]).filter(Boolean).reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {}), main = Object.entries(team).sort((a, b) => b[1] - a[1])[0]?.[0];
  const tc = main && H_KNOWN.has(hAbbr(main)) ? teamColor(hAbbr(main)) : 'var(--accent)';
  // career line: from the source, or worked out from the seasons (per-game numbers weighted by games)
  let C = P.career && P.career[5] != null ? P.career : null;
  if (!C && P.seasons.length) { const G = P.seasons.reduce((t, x) => t + (x[3] || 0), 0); const avg = i => { const ok = P.seasons.filter(x => x[i] != null && x[3]); const g = ok.reduce((t, x) => t + x[3], 0); return g ? ok.reduce((t, x) => t + x[i] * x[3], 0) / g : null; }; C = [`${P.seasons.length} Yrs`, null, null, G, ...[4, 5, 6, 7, 8, 9, 10, 11, 12].map(avg)]; }
  const pos = String(P.pos || '').replace(/ and /g, ', ').split(/,\s*/).filter(Boolean).slice(0, 2).join(' / ');
  const maxP = Math.max(1, ...P.seasons.map(s => s[5] || 0)), peak = P.seasons.find(s => (s[5] || 0) === maxP && maxP > 1);
  // stints: runs of seasons with one team (traded seasons, shown as "2TM", are skipped)
  const stints = []; P.seasons.forEach(s => { const a = s[2]; if (!a || /TM$/.test(a)) return; const yr = +s[0].slice(0, 4), last = stints.at(-1); if (last && last.a === a) { last.y1 = yr + (HW ? 0 : 1); last.g += s[3] || 0; } else stints.push({ a, y0: yr, y1: yr + (HW ? 0 : 1), g: s[3] || 0 }); });
  const age = P.born && /^\d{4}-\d{2}-\d{2}$/.test(P.born) ? Math.floor((Date.now() - new Date(P.born)) / 31557600000) : null;
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(P.name + ' career highlights')}`;
  sheet.body.innerHTML = `<div class="hy-hero" style="--tc:${tc}">${P.br && ownKey(P.br) ? ownPhoto(P.br, P.name, 'hy-hf', main) : hyFace(P.espn, P.name, 'hy-hf', 400, main, P.photo)}<div><span class="eyebrow">${esc([pos, P.ht].filter(Boolean).join(' · '))}</span><h2>${esc(P.name)}</h2>
      <p>${esc([P.born ? `Born ${/^\d{4}-/.test(P.born) ? new Date(P.born + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : P.born}${P.died ? '' : age ? ` (${age})` : ''}` : '', P.died ? `died ${/^\d{4}-/.test(P.died) ? new Date(P.died + 'T12:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : P.died}` : '', P.college].filter(Boolean).join(' · '))}</p>
      ${P.draft ? `<p class="hy-dr">${esc(P.draft)}</p>` : ''}${P.hof ? `<p class="hy-hof">Hall of Fame${/^\d{4}$/.test(P.hof) ? `, ${esc(P.hof)}` : ''}</p>` : ''}</div></div>
    ${C ? `<div class="hy-big">${[['PTS', C[5]], ['REB', C[6]], ['AST', C[7]], ['STL', C[8]], ['BLK', C[9]]].map(([l, v]) => `<div><b>${hNum(v)}</b><span>${l}</span></div>`).join('')}<div><b>${hInt(C[3])}</b><span>Games</span></div></div>` : ''}
    ${P.bling?.length ? `<div class="hy-bling">${P.bling.map(b => `<span>${esc(b)}</span>`).join('')}</div>` : ''}
    ${ranks.length ? `<p class="hy-ranks"><b>All-time</b> ${ranks.map(x => `<span>${esc(x)}</span>`).join('')}</p>` : ''}
    ${stints.length ? `<section class="hy-sec"><h3>Teams</h3><div class="hy-stints">${stints.map(t => `<div style="--tc:${hColor(t.a) || 'var(--surface-3)'}">${hLogo(t.a, 64)}<span><b>${esc(hAbbr(t.a))}</b><small>${esc(t.y0 === t.y1 ? String(t.y0) : `${t.y0}–${t.y1}`)} · ${t.g} games</small></span></div>`).join('')}</div></section>` : ''}
    ${peak ? `<p class="hy-peak">Best season: <b>${esc(peak[0])}</b>, ${hNum(peak[5])} points, ${hNum(peak[6])} rebounds and ${hNum(peak[7])} assists a game${peak[2] && !/TM$/.test(peak[2]) ? ` for ${esc(hAbbr(peak[2]))}` : ''}.</p>` : ''}
    <div class="hy-acts"><a class="btn" href="${esc(yt)}" target="_blank" rel="noopener">${PLAY_ICON}Watch career highlights</a>${active && P.espn ? `<button class="btn ghost" data-player="${esc(P.espn)}">Full player page</button>` : ''}</div>
    ${P.seasons.length ? `<section class="hy-sec"><h3>Points per game, season by season</h3><div class="hy-bars">${P.seasons.map(s => `<div title="${esc(s[0])}: ${hNum(s[5])} PPG"${(s[5] || 0) === maxP ? ' class="pk"' : ''}><em>${hNum(s[5])}</em><i style="height:${((s[5] || 0) / maxP * 100).toFixed(1)}%"></i><span>${esc(s[0].slice(2, 4))}</span></div>`).join('')}</div></section>
    <section class="hy-sec"><h3>Season by season <span>per game</span></h3><div class="box-wrap drag-x" data-drag><table class="box hy-tbl hy-ptbl"><thead><tr><th>Season</th><th>Team</th><th>G</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th></tr></thead>
      <tbody>${P.seasons.map(s => `<tr${(s[5] || 0) === maxP ? ' class="best"' : ''}><td>${esc(s[0])}</td><td><span class="hy-tm">${hLogo(s[2], 40)}${esc(hTm(s[2]))}</span></td><td>${hInt(s[3])}</td><td>${hNum(s[4])}</td><td><b>${hNum(s[5])}</b></td><td>${hNum(s[6])}</td><td>${hNum(s[7])}</td><td>${hNum(s[8])}</td><td>${hNum(s[9])}</td><td>${hPct(s[10])}</td><td>${hPct(s[11])}</td><td>${hPct(s[12])}</td></tr>`).join('')}</tbody>
      ${C ? `<tfoot><tr><td>Career</td><td></td><td>${hInt(C[3])}</td><td>${hNum(C[4])}</td><td>${hNum(C[5])}</td><td>${hNum(C[6])}</td><td>${hNum(C[7])}</td><td>${hNum(C[8])}</td><td>${hNum(C[9])}</td><td>${hPct(C[10])}</td><td>${hPct(C[11])}</td><td>${hPct(C[12])}</td></tr></tfoot>` : ''}</table></div></section>`
      : `<p class="hy-note">ESPN doesn't have season stats for this player (its numbers mostly start in the 1990s).</p>`}
    <p class="hy-src">${P.src === 'br' ? 'Bio, accolades and stats from Basketball-Reference' : 'From ESPN'}. ${HW ? '' : 'Steals and blocks became official in 1973-74, 3-pointers in 1979-80.'}</p>`;
  wireDrag(sheet.body);
}

function wireHistory(root) {
  root.addEventListener('click', e => {
    const t = e.target.closest('[data-htab]'); if (t) { HS.tab = t.dataset.htab; try { localStorage.setItem('fc-histtab', HS.tab); } catch (e2) {} renderHistory(); return; }
    const ds = e.target.closest('[data-hdstep]'); if (ds) { const base = HS.shown || HS.day || S.today.slice(4), d = new Date(Date.UTC(2024, +base.slice(0, 2) - 1, +base.slice(2) + +ds.dataset.hdstep)); HS.day = ds.dataset.hdstep === '0' ? null : `${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`; renderHistory(); return; }
    const ss = e.target.closest('[data-hsstep]'); if (ss) { HS.season = Math.max(+ss.dataset.min, Math.min(+ss.dataset.max, HS.season + +ss.dataset.hsstep)); renderHistory(); return; }
    const so = e.target.closest('[data-hsort]'); if (so) { HS.sort = so.dataset.hsort; renderHistory(); return; }
    if (e.target.closest('[data-hretry]')) { histP = null; renderHistory(); return; }
    const r = e.target.closest('[data-hrec]'); if (r) { HS.rec = r.dataset.hrec; renderHistory(); return; }
    const er = e.target.closest('[data-hera]'); if (er) { HS.era = er.dataset.hera; renderHistory(); return; }
    const hg = e.target.closest('[data-hgo]'); if (hg) { go('scores'); pickDate(hg.dataset.hgo); return; }
    const sg = e.target.closest('[data-hseasongo]'); if (sg) { HS.season = +sg.dataset.hseasongo; renderHistory(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  });
  root.addEventListener('change', e => {
    if (e.target.matches('[data-hday]') && e.target.value) { HS.day = e.target.value.slice(5).replace('-', ''); renderHistory(); }
    if (e.target.matches('[data-hseason]')) { HS.season = +e.target.value; renderHistory(); }
  });
  root.addEventListener('input', e => { if (!e.target.matches('[data-hq]')) return; HS.q = e.target.value; clearTimeout(root._qt); root._qt = setTimeout(() => histSearch(HS.q), 250); });
}
// profiles open from anywhere in the History tab (and its sheets)
document.addEventListener('click', e => {
  const l = e.target.closest('[data-hleg]'); if (l) { e.preventDefault(); openLegend({ br: l.dataset.hleg }); return; }
  const s = e.target.closest('[data-hespn]'); if (s) { e.preventDefault(); openLegend({ espn: s.dataset.hespn }); }
});
