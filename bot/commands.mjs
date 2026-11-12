// The slash commands Fullcourt's Discord bot offers. tools/discord.mjs sends this list to Discord; bot/bot.mjs answers them.
// Option types: 3 = text. "autocomplete" means Discord asks the bot for suggestions while the person types.
const league = { name: 'league', description: 'NBA or WNBA (NBA if you leave it out)', type: 3, choices: [{ name: 'NBA', value: 'nba' }, { name: 'WNBA', value: 'wnba' }] };
const team = (required, description) => ({ name: 'team', description, type: 3, autocomplete: true, ...(required ? { required: true } : {}) });
const player = description => ({ name: 'player', description, type: 3, autocomplete: true, required: true });

export const STATS = [
  ['Points', 'offensive', 'avgPoints', 'PPG'], ['Rebounds', 'general', 'avgRebounds', 'RPG'], ['Assists', 'offensive', 'avgAssists', 'APG'],
  ['Steals', 'defensive', 'avgSteals', 'SPG'], ['Blocks', 'defensive', 'avgBlocks', 'BPG'], ['3-pointers made', 'offensive', 'avgThreePointFieldGoalsMade', '3PM'],
  ['Field goal %', 'offensive', 'fieldGoalPct', 'FG%'], ['3-point %', 'offensive', 'threePointFieldGoalPct', '3P%'], ['Free throw %', 'offensive', 'freeThrowPct', 'FT%'],
  ['Minutes', 'general', 'avgMinutes', 'MPG'], ['Double-doubles', 'general', 'doubleDouble', 'DD2'],
];

export const COMMANDS = [
  { name: 'score', description: 'Live scores and finals, or one team\'s game', options: [
    team(false, 'One team\'s game (leave out for every game)'),
    { name: 'day', description: 'Which day (today if you leave it out)', type: 3, choices: [{ name: 'Today', value: '0' }, { name: 'Yesterday', value: '-1' }, { name: 'Tomorrow', value: '1' }] },
    league] },
  { name: 'standings', description: 'Conference standings', options: [
    { name: 'conference', description: 'East or West (both if you leave it out)', type: 3, choices: [{ name: 'East', value: 'east' }, { name: 'West', value: 'west' }] },
    league] },
  { name: 'player', description: 'A player\'s season averages, last five games and next game', options: [player('Start typing a name')] },
  { name: 'team', description: 'A team\'s record, recent results and next games', options: [team(true, 'Start typing a team')] },
  { name: 'leaders', description: 'League leaders in a stat', options: [
    { name: 'stat', description: 'Which stat', type: 3, required: true, choices: STATS.map(s => ({ name: s[0], value: s[2] })) },
    league] },
  { name: 'props', description: 'A player\'s prop lines at each sportsbook (NBA)', options: [player('Start typing a name')] },
  { name: 'injuries', description: 'A team\'s injury report', options: [team(true, 'Start typing a team')] },
  { name: 'highlights', description: 'Full game highlights, newest first', options: [team(false, 'One team\'s latest game (leave out for the newest videos)'), league] },
].map(c => ({ ...c, type: 1, integration_types: [0, 1], contexts: [0, 1, 2] })); // usable in servers, in DMs and by people who add it to their own account
