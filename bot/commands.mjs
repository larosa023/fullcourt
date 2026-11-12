// The slash commands Fullcourt's Discord bot offers. tools/discord.mjs sends this list to Discord; bot/bot.mjs answers them
// (COMMAND there has one entry per name here).
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

const day = { name: 'day', description: 'Which day (today if you leave it out)', type: 3, choices: [{ name: 'Today', value: '0' }, { name: 'Yesterday', value: '-1' }, { name: 'Tomorrow', value: '1' }] };

export const COMMANDS = [
  { name: 'score', description: 'Live scores and finals, or one team\'s game', options: [team(false, 'One team\'s game (leave out for every game)'), day, league] },
  { name: 'game', description: 'One game in full: score, box score, team stats, win probability', options: [
    team(true, 'Start typing a team'),
    { name: 'show', description: 'What to open on (the score if you leave it out)', type: 3, choices: [{ name: 'Score', value: 'score' }, { name: 'Box score', value: 'box' }, { name: 'Team stats', value: 'stats' }, { name: 'Win probability', value: 'wp' }] },
    { ...day, description: 'Which day (their latest game if you leave it out)' }] },
  { name: 'standings', description: 'Conference standings', options: [
    { name: 'conference', description: 'East or West (both if you leave it out)', type: 3, choices: [{ name: 'East', value: 'east' }, { name: 'West', value: 'west' }] },
    league] },
  { name: 'player', description: 'A player\'s season card, game log and career', options: [
    player('Start typing a name'),
    { name: 'show', description: 'What to open on (this season if you leave it out)', type: 3, choices: [{ name: 'This season', value: 'season' }, { name: 'Game log', value: 'log' }, { name: 'Career', value: 'career' }] }] },
  { name: 'compare', description: 'Two players side by side', options: [player('First player'), { ...player('Second player'), name: 'against' }] },
  { name: 'team', description: 'A team\'s record, form and next games', options: [team(true, 'Start typing a team')] },
  { name: 'leaders', description: 'League leaders in a stat', options: [
    { name: 'stat', description: 'Which stat (points if you leave it out)', type: 3, choices: STATS.map(s => ({ name: s[0], value: s[2] })) },
    league] },
  { name: 'props', description: 'A player\'s prop lines and the best price each way (NBA)', options: [player('Start typing a name')] },
  { name: 'odds', description: 'Spreads, totals and moneylines for the day\'s games', options: [day, league] },
  { name: 'injuries', description: 'A team\'s injury report', options: [team(true, 'Start typing a team')] },
  { name: 'highlights', description: 'Full game highlights, newest first', options: [team(false, 'One team\'s latest game (leave out for the newest videos)'), league] },
  { name: 'ask', description: 'Ask in plain words: "did the Knicks win last night", "Curry vs Brunson"', options: [{ name: 'question', description: 'Your question', type: 3, required: true, autocomplete: true, max_length: 200 }] },
  { name: 'help', description: 'What the Fullcourt bot can do' },
].map(c => ({ ...c, type: 1, integration_types: [0, 1], contexts: [0, 1, 2] })); // usable in servers, in DMs and by people who add it to their own account
