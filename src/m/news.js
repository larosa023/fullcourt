/* ---------------- what's new ---------------- */
// newest first; bump the first entry's id when adding updates so the dot shows again
const UPDATES = [
  { id: '2026-11-03b', date: 'Nov 3', items: [
    ['Faster loading', 'Fonts now come from Fullcourt itself instead of Google, today\'s scores and standings start downloading the moment the page opens, and team logos are fetched once and reused everywhere (about half as many image downloads on a full night).'],
    ['College polish', 'Ask understands "Top 25" and polls, uses college-style answers ("The Gamecocks play next…", "leads Division I"), and has college example questions. College days only load the Top 25 games in the Pick\'em and injury panels, and saved scores work offline for college too.'],
    ['Header fit', 'The top bar now lines up with the page edges at every screen size, with or without a favorite team chip.'],
  ] },
  { id: '2026-11-03a', date: 'Nov 3', items: [
    ['College basketball', 'Tap NCAA in the league switch (or the menu on your phone) for women\'s and men\'s college hoops, with a Women | Men toggle beside it. Scores open on games with a ranked team, with every Division I game and each conference a pick away. Rankings has the AP and Coaches polls plus all 32 conference standings, Teams lists every school by conference, and games, box scores, play-by-play, win probability and team pages all work like they do for the pros.'],
  ] },
  { id: '2026-11-01d', date: 'Nov 1', items: [
    ['More sportsbooks', 'The Bet desk now pulls lines from FanDuel, ESPN BET and other books a few times a day. A new Best column shows the friendliest line and price across books, and when DraftKings hasn\'t posted a prop yet you get the real FanDuel (or other book) line instead of an estimate. The prop breakdown has a By book card to compare every book at a glance.'],
  ] },
  { id: '2026-11-01c', date: 'Nov 1', items: [
    ['Matchup card', 'Every prop breakdown now has a Matchup card: with/without numbers when a key teammate is out (his per-36 with that player on vs off the floor), game pace, rest, blowout risk, and for scoring props his shot zones against what tonight\'s defense allows there. Free data from PBPStats and ESPN.'],
    ['Minutes overlay', 'Tap MIN on the game-by-game chart to lay his minutes over every bar.'],
    ['New Bet desk flags', 'Rows now flag back-to-backs, 3 games in 4 nights, fast or slow matchups, and blowout risk for starters.'],
    ['First basket', 'Each game on the Game lines tab has a First basket section: how often each team gets the first possession and scores first, and who usually makes their first basket.'],
    ['Export to your book', 'The parlay slip has an Export button for DraftKings, FanDuel, Fanatics, Hard Rock, theScore Bet, bet365, PrizePicks and Sleeper. It copies your picks in that app\'s wording and opens it.'],
  ] },
  { id: '2026-11-01b', date: 'Nov 1', items: [
    ['New prop charts', 'The prop breakdown has a new game-by-game chart: green and red bars against your line, a dotted bar for games he sat, and L5 / L10 / L15 / Season / vs-opponent hit rates you can tap to change the range. Filter by home/away or opponent.'],
    ['Rebound and assist detail', 'Rebound bars now split offensive and defensive boards, with his share of available rebounds, and assist props show assist points, 3-point assists and at-rim assists, from PBPStats play-by-play.'],
  ] },
  { id: '2026-11-01a', date: 'Nov 1', items: [
    ['Share your bets', 'A share button on every bet card and on the parlay slip makes a clean image of the bet. On a phone it opens the share sheet; on a computer it copies the image so you can paste it straight into a chat.'],
    ['Live props', 'Once a game tips, every prop in the Bet desk shows his number so far and where he\'s pacing, green when it\'s on track and a check once it hits.'],
    ['Under the radar', 'A new Bet desk filter that shows only role players (under 15 a game) whose minutes have climbed lately, where lines tend to lag.'],
  ] },
  { id: '2026-10-31h', date: 'Oct 31', items: [
    ['Bet desk upgrades', 'Star a prop to pin it to the top and get an alert if its line moves a point or the book posts it. New DvP column (how players at his position do against tonight\'s defense), minutes-up/down and teammate-out flags, and your market and sort are remembered.'],
    ['Alt lines and compare', 'The prop breakdown now shows the DraftKings alt-line ladder with each rung\'s implied odds against his real hit rate, and a Compare picker to put two players\' last 10 games side by side.'],
    ['My bets and Record', 'Two new Bet desk tabs: My bets (record, profit, ROI, by week, leg hit rate by market, best win, closest call) and Record, which grades Fullcourt\'s top-Score props and game-line leans after the games.'],
    ['Live parlays', 'Live parlay cards now say what they still need, and you get a heads-up the moment a leg hits or misses.'],
    ['Win probability', 'Live score cards show a win-probability bar.'],
  ] },
  { id: '2026-10-31g', date: 'Oct 31', items: [
    ['Bet desk', 'A new Bets tab: today\'s DraftKings player props for every market with each player\'s hit rate on that exact line (last 5, last 10, season, vs tonight\'s opponent), averages, opponent defense and line moves, plus a Game lines view with projections. Tap a row for the full breakdown or + to track it.'],
    ['Themes', 'The palette button at the top now opens a theme menu: Midnight, Pure black, Hardwood, Forest, Paper, Clean white, Ice and more.'],
  ] },
  { id: '2026-10-31f', date: 'Oct 31', items: [
    ['Prop ideas in Ask', 'Ask "best props tonight", "Knicks game picks" or "Wembanyama props" for players who keep clearing their marks, matchup and injury notes, and how each game line compares with the teams\' scoring. Tap + to track one.'],
    ['Game log totals', 'The season game log now has a Totals row, and shooting percentages in the averages.'],
  ] },
  { id: '2026-10-31e', date: 'Oct 31', items: [
    ['Award races', 'MVP, Rookie, Defensive Player and Sixth Man races now blend sportsbook odds, the ESPN panel and staff picks from The Ringer, SI and Bleacher Report with Fullcourt\'s stats model, with stats on every row and sources listed.'],
    ['Track your bets', 'Type a bet or paste a slip screenshot into Ask to follow it live under My bets on Scores.'],
  ] },
  { id: '2026-10-31d', date: 'Oct 31', items: [
    ['Advanced stats', 'An Advanced switch on box scores (TS%, eFG%, usage, game score), team stats (ratings, pace, four factors), player splits, game logs and career stats (efficiency, shot profile, per 36), team rankings and Leaders. It remembers your choice everywhere.'],
    ['Team leaders', "Team pages show the team's top 5 in any stat. Tap Points, Rebounds, Assists, Steals, Blocks, 3-pointers, FG% or Minutes to switch."],
    ['Recent form', 'Team pages chart the last 10 games. Tap Margin, Points scored or Points allowed; tap a bar to open that game.'],
    ['Season game log', 'Player pages have an expandable log of every game this season, filterable by wins, losses, home, away, 20+ point games and double-doubles.'],
    ['Roster moves', 'A new Moves tab on Teams lists signings, trades and waivers league-wide, filterable by type and team. Team pages show their own recent moves.'],
    ['Settings', 'New Settings panel (sliders icon in the header, or the phone menu): switch off odds, Pick\'em, Who\'s out, Your players, Top scorers or the ticker, pick a theme, and reset your data.'],
    ['This week', "Every game for the next 7 days on one page, with national TV and lines. Filter to just your team."],
    ['Where to watch', 'Upcoming and live games list their channels, with links to the official ESPN, Prime Video, Peacock and League Pass pages.'],
    ['Cleanup', 'Removed leftover code from earlier features and tidied styles.'],
    ['Career stats', 'Player pages have a Career stats section: tap to expand season-by-season numbers, with playoffs and a show-all for long careers.'],
    ['Game header fits', 'Scores and team names no longer overlap at the top of a game.'],
  ] },
  { id: '2026-10-30c', date: 'Oct 30', items: [
    ['Mini scoreboard removed', 'The pop-out mini scoreboard has been taken out.'],
    ['Faster loading', 'The site now loads about 40% less up front. Extras like Ask, Compare, rankings and sharing load the first time you open them, and updates only re-download what changed.'],
    ['Big nights moved into the game', "40-point games, triple-doubles and comebacks now show inside the game (under the recap) instead of as a tag on the score cards."],
  ] },
  { id: '2026-10-29d', date: 'Oct 29', items: [
    ['Team-colored leader bars', "Bars on the Leaders page (and the MVP and Rookie races) use each player's team color."],
    ['Injured section', "Injured players sit in their own section at the bottom of the box score instead of with the bench."],
    ['Mini scoreboard', "Pop today's scores into a small window. In Chrome and Edge it stays on top of your other apps."],
    ['Your players', 'Star any player to follow their live stat line in a strip at the top of Scores.'],
    ["Who's out", "Injury report for every game on the day, in one panel on the Scores page."],
    ['Line movement', 'Arrows on game cards show how the spread and total moved since opening. Previews get a full line movement card.'],
    ["Pick'em", 'Pick the winners of each game. Picks lock at tip-off and your record and streak are tracked.'],
    ['Game recaps', 'Every finished game opens with a short summary written from the box score.'],
    ['Team rankings', 'Teams page has a Rankings tab: every team ranked in 14 stats, sortable by column.'],
    ['Copy as image', 'On a computer the share button now copies the picture, ready to paste.'],
    ["What's new", 'This list.'],
  ] },
  { id: '2026-10-29a', date: 'Oct 29 (overnight)', items: [
    ['Win probability', 'Biggest swings are marked, and you can hover the chart to read any moment.'],
    ['Play-by-play filters', 'Scoring plays only, either team, any quarter.'],
    ['Game previews', 'Win chance, last 5 games, season series and the stats where teams differ most.'],
    ['Highlights', 'ESPN clips inside finished games. They start muted.'],
    ['Officials', 'The referee crew for every game.'],
    ['Big-night badges', '40-point games, triple-doubles and big comebacks are flagged on the score cards.'],
    ['Team alerts', 'Notifications for your team at tip-off, overtime, close finishes and the final.'],
    ['Player trends', 'Last 10 games chart plus home/away and win/loss splits.'],
    ['Team calendar', 'Month view with back-to-backs and road trips marked.'],
    ['MVP and Rookie races', "Fullcourt's own estimate, under Leaders."],
    ['Home screen app', 'New icon and loading screen, and saved scores when you have no signal.'],
    ['Share images', 'Share a final score or a player card as a picture.'],
  ] },
  { id: '2026-10-28', date: 'Oct 28', items: [
    ['WNBA mode', 'Switch between NBA and WNBA from the header or the menu (shortcut L). Each league is its own mode.'],
    ['Timeouts and bonus', 'Live games show timeouts left, when a team is in the bonus, and when a timeout is on.'],
    ['Jersey numbers', 'Shown next to every player in the box score.'],
    ["Who's on the court", 'Live box scores list the five players on the floor first.'],
    ['Injuries', 'Injury report on team pages, and injured players in red at the bottom of box scores.'],
  ] },
  { id: '2026-10-27', date: 'Oct 27', items: [
    ['Tan light mode', 'Easier on the eyes than bright white.'],
    ['Back button', 'Mouse, keyboard and swipe Back close the open panel.'],
    ['Ask Fullcourt', 'Type stats questions in plain English.'],
    ['Desktop upgrades', 'Score ticker, multi-view, shot charts, game flow, search, keyboard shortcuts, favorite team, Compare and the playoff picture.'],
    ['Phone menu', 'A side menu replaces the bottom tab bar.'],
    ['Full-screen games', 'Expand any game to the whole screen.'],
    ['Shooting splits', 'Made/attempted and percentages for FG, 3PT and FT in box scores.'],
    ['Odds', 'Moneyline, spread and total on every game.'],
    ['Eastern time', "Times in ET, and the day rolls over at 4 AM so late games stay on last night's slate."],
    ['Fullcourt launched', 'Live scores, standings, teams, rosters, stats and light/dark mode.'],
  ] },
];
function openNews() {
  const sheet = openSheet("What's new");
  sheet.body.innerHTML = `<div class="news">${UPDATES.map((u, i) => `
    <section class="news-day enter" style="--i:${i}">
      <div class="news-date"><span>${esc(u.date)}</span>${i === 0 ? '<em>Latest</em>' : ''}</div>
      <ul>${u.items.map(([t, d]) => `<li><b>${esc(t)}</b><span>${esc(d)}</span></li>`).join('')}</ul>
    </section>`).join('')}</div>`;
  lsSet(NEWS_KEY, UPDATES[0].id);
  markNews();
}

