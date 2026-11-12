// /ask: a question in plain words -> the view that answers it. No AI model behind it: it looks for a team, a player,
// a day and a handful of telling words ("standings", "injuries", "vs", "leads", "props"...), which covers what people
// actually type at a scores bot. When nothing fits it says so and shows what it understands.
import { norm, findTeam, findPlayer, allTeams, teamGame, dayET, Say } from './espn.mjs';

// names people use that the team list doesn't have
const TEAM_ALIAS = { sixers: '76ers', cavs: 'cavaliers', mavs: 'mavericks', wolves: 'timberwolves', twolves: 'timberwolves', blazers: 'trail blazers', dubs: 'warriors', clips: 'clippers', grizz: 'grizzlies', pels: 'pelicans', nugs: 'nuggets', knickerbockers: 'knicks', philly: '76ers', lakeshow: 'lakers' };
const PLAYER_ALIAS = { wemby: 'victor wembanyama', steph: 'stephen curry', sga: 'shai gilgeous-alexander', shai: 'shai gilgeous-alexander', giannis: 'giannis antetokounmpo', luka: 'luka doncic', jokic: 'nikola jokic', joker: 'nikola jokic', kd: 'kevin durant', ant: 'anthony edwards', antman: 'anthony edwards', bron: 'lebron james', lebron: 'lebron james', ad: 'anthony davis', cp3: 'chris paul', dame: 'damian lillard', kat: 'karl-anthony towns', pg: 'paul george', spida: 'donovan mitchell', book: 'devin booker', trae: 'trae young', ja: 'ja morant', zion: 'zion williamson', lamelo: 'lamelo ball', cade: 'cade cunningham', chet: 'chet holmgren', paolo: 'paolo banchero', hali: 'tyrese haliburton', bam: 'bam adebayo', kawhi: 'kawhi leonard', kyrie: 'kyrie irving', klay: 'klay thompson', draymond: 'draymond green', russ: 'russell westbrook', flagg: 'cooper flagg', jb: 'jaylen brown', jt: 'jayson tatum', cc: 'caitlin clark', aja: "a'ja wilson", stewie: 'breanna stewart', sabrina: 'sabrina ionescu' };
const STAT_WORDS = [[/3 ?p(oin)?t(er)?s? ?(%|pct|percent)|three point (%|pct|percent)|best (3 ?point |three point )?shooters?/, 'threePointFieldGoalPct'], [/field goal|fg ?(%|pct)|shooting (%|pct|percent)/, 'fieldGoalPct'], [/free throws?|ft ?(%|pct)/, 'freeThrowPct'],
  [/threes|three pointers|3 ?pointers|3pm|\b3s\b|from three|from deep/, 'avgThreePointFieldGoalsMade'], [/double doubles?/, 'doubleDouble'], [/rebound|boards|rpg/, 'avgRebounds'], [/assist|dimes|apg|passers?/, 'avgAssists'], [/steals?|spg/, 'avgSteals'], [/blocks?|bpg|rim protect/, 'avgBlocks'], [/minutes|mpg/, 'avgMinutes'], [/points|scor|ppg|buckets/, 'avgPoints']];
const STOP = new Set(('a an the of in on at to for is are was were be do does did how what whats who whos when where which why and or vs versus me my show tell give get about with his her their him them they he she it its this that these those has have had will would can could should stats stat statline numbers averages average season year game games score scores tonight today now yesterday tomorrow last night next play plays playing played ' +
  'win won wins lose lost loses beat result final team player nba wnba league against please much many doing going been look looks like good bad best top most leaders leader leads leading highest injury injuries injured hurt out report status healthy props prop line lines odds spread moneyline over under betting bet schedule upcoming highlights highlight replay recap standings standing seed conference east west eastern western log gamelog career recent compare better than box boxscore per so far right any there up points pts rebounds reb assists ast steals blocks threes minutes shooting percentage percent pct tell').split(' '));

// the longest team name, city or nickname in the question (whole words)
function teamIn(q, lgHint) {
  const words = ' ' + q.split(' ').map(w => TEAM_ALIAS[w] || w).join(' ') + ' ';
  let best = null;
  for (const t of allTeams(lgHint)) for (const name of [norm(t.name), norm(t.full), norm(t.loc)]) {
    if (name.length < 3 || !words.includes(` ${name} `)) continue;
    const score = name.length + (name === norm(t.name) || name === norm(t.full) ? 100 : 0) - (t.lg === 'wnba' && !lgHint ? 1 : 0);
    if (!best || score > best.score) best = { t, score, name };
  }
  return best;
}
const leftover = (q, drop) => q.split(' ').filter(w => w && !STOP.has(w) && !drop.includes(w) && !/^\d+$/.test(w)).map(w => PLAYER_ALIAS[w] || w).join(' ').trim();

export const EXAMPLES = ['did the knicks win last night', 'wemby stats', 'curry vs brunson', 'who leads the league in assists', 'east standings', 'lakers injuries', 'booker props', 'odds tonight', 'celtics box score', 'when do the suns play next'];

// -> a view, or throws Say with what to try
export async function ask(question) {
  const raw = String(question || '').toLowerCase().replace(/[-–—]/g, ' ').replace(/[?!.,'’"]/g, m => (m === "'" || m === '’' ? '' : ' ')).replace(/\s+/g, ' ').trim();
  const q = norm(raw), has = re => re.test(raw);
  if (!q) throw new Say('Ask me something like "did the Knicks win last night" or "who leads the league in assists".');
  const lgHint = /\bwnba\b/.test(q) ? 'wnba' : /\bnba\b/.test(q) ? 'nba' : undefined;
  const day = has(/yesterday|last night/) ? -1 : has(/tomorrow/) ? 1 : has(/\b(today|tonight|right now|now)\b/) ? 0 : null;
  const team = teamIn(q, lgHint), t = team?.t, teamWords = team ? [...team.name.split(' '), ...Object.keys(TEAM_ALIAS).filter(k => TEAM_ALIAS[k] === team.name)] : [];
  const lg = t?.lg || lgHint || 'nba', rest = leftover(q, teamWords);
  // the words left over, as a name; failing that, any one of them (so a stray word doesn't hide the surname)
  const player = async text => {
    if (!text || text.replace(/ /g, '').length < 3) return null;
    const hit = await findPlayer(text, lgHint); if (hit) return hit;
    for (const w of text.split(' ').filter(x => x.length > 3).sort((x, y) => y.length - x.length).slice(0, 3)) { const one = await findPlayer(w, lgHint); if (one) return one; }
    return null;
  };
  const stat = STAT_WORDS.find(([re]) => re.test(raw))?.[1];

  if (has(/^(help|commands)\b|what can you do|how do (i|you) (use|work)/)) return { k: 'help' };
  // two players side by side
  if (has(/\b(vs|versus|compared? (to|with)|better)\b/) || has(/^compare\b/)) {
    const parts = raw.replace(/^compare\b/, '').replace(/\bwho(s| is)? better\b/, '').split(/\b(?:vs|versus|or|and|compared? (?:to|with)|than)\b|,/).map(s => leftover(norm(s || ''), [])).filter(Boolean);
    if (parts.length >= 2) { const [a, b] = await Promise.all([player(parts[0]), player(parts[1])]); if (a && b) return { k: 'compare', lg: a.lg, a: a.id, b: b.id, ...(b.lg !== a.lg ? { lb: b.lg } : {}) }; }
  }
  if (has(/highlight|replay|recap/)) return { k: 'highlights', lg, ...(t ? { id: t.id } : {}) };
  if (has(/standing|\bseeds?\b|playoff (picture|race)|\bconference\b|first place|\bin first\b|\bwho is first\b/)) return { k: 'standings', lg, conf: has(/\beast/) ? 'east' : has(/\bwest/) ? 'west' : 'both' };
  if (has(/injur|\bhurt\b|\bis .* (out|playing|healthy)\b|questionable|injury report|\bwho is out\b|whos out/)) {
    if (t) return { k: 'injuries', lg: t.lg, id: t.id };
    const p = await player(rest), pt = p && findTeam(p.team, p.lg); if (pt) return { k: 'injuries', lg: pt.lg, id: pt.id };
    throw new Say('Whose injuries? Try "Lakers injuries" or "is Embiid playing".');
  }
  if (has(/\bprops?\b|over under|\bo u\b|\blines?\b/) && rest) { const p = await player(rest); if (p) return { k: 'props', id: p.id, n: p.name }; }
  if (has(/\bodds\b|spread|moneyline|favou?rites?|favou?red|betting|\blines?\b|over under/)) return { k: 'odds', lg, d: dayET(day ?? 0) };
  if (has(/leader|\bleads?\b|leading|\bmost\b|\btop\b|\bbest\b|highest|scorers?|rebounders?/) && (stat || !rest)) return { k: 'leaders', lg, stat: stat || 'avgPoints' };
  if (t && has(/box ?score/)) { const g = await teamGame(t, day); if (!g) throw new Say(`I couldn't find a ${t.name} game for that day.`); return { k: 'game', lg: t.lg, id: g.id, d: g.d, tab: 'box', side: 'team:' + t.id }; }
  if (t && has(/schedule|next game|upcoming|play next|\bwhen (do|does|is|are)\b|\bwho (do|does)\b|record/)) return { k: 'team', lg: t.lg, id: t.id };
  if (has(/\bscores?\b|\bgames?\b|\bw[io]n\b|\bwins?\b|\blos[te]\b|\bbeat\b|result|\bfinal\b|tonight|today|yesterday|last night|tomorrow|\bplay(ing|ed)?\b|\bdo\b|\bdid\b/)) {
    if (t) { const g = await teamGame(t, day); if (g) return { k: 'game', lg: t.lg, id: g.id, d: g.d, tab: 'score' }; if (day != null) throw new Say(`No ${t.name} game ${day === 0 ? 'today' : day < 0 ? 'yesterday' : 'tomorrow'}. Try "${t.name.toLowerCase()} schedule".`); return { k: 'team', lg: t.lg, id: t.id }; }
    if (!rest) return { k: 'score', lg, d: dayET(day ?? 0) };
  }
  if (rest) {
    const p = await player(rest);
    if (p) return { k: 'player', lg: p.lg, id: p.id, tab: has(/game ?log|last (5|10|five|ten|few)|recent/) ? 'log' : has(/career|season by season|seasons|by year/) ? 'career' : 'season' };
  }
  if (t) return { k: 'team', lg: t.lg, id: t.id };
  if (stat) return { k: 'leaders', lg, stat };
  throw new Say(`I didn't catch that. Try something like:\n${EXAMPLES.slice(0, 6).map(e => `• ${e}`).join('\n')}`);
}
