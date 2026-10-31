/* ---------------- what's new ---------------- */
// newest first; bump the first entry's id when adding updates so the dot shows again
const UPDATES = [
  { id: '2026-10-31', date: 'Oct 31', items: [
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

