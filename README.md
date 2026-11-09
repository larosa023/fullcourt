# Fullcourt

### ▶ **[Open Fullcourt → nbafullcourty.netlify.app](https://nbafullcourty.netlify.app)**

## Where to open it

The same site is published in three places while we compare hosts (November 2026). They all show the same thing and pull the same live data. Only the address and the host differ.

| | Link | Host | Notes |
|---|---|---|---|
| **1. Netlify** (main) | [nbafullcourty.netlify.app](https://nbafullcourty.netlify.app) | Netlify (paid) | The original. Updates on every site change. Also hosts `/api/scores` for the desktop widget |
| **2. Cloudflare** | [fullcourt-46z.pages.dev](https://fullcourt-46z.pages.dev) | Cloudflare Pages (free) | Updates on every push to `main` |
| **3. GitHub Pages** | [larosa023.github.io/fullcourt](https://larosa023.github.io/fullcourt/) | GitHub Pages (free) | Updates on every site change, plus once a day |
| **Windows app** | [Download Fullcourt-Setup.exe](https://github.com/larosa023/fullcourt/releases/latest) | GitHub Releases | Installs Fullcourt as a Windows program; updates itself (Settings → Check for updates) |

Each copy saves your bets, stars and favorites separately (they're different addresses). To move them: **Settings → Your data → Export my data** on one, then **Import data** on the other.

Live NBA scores, odds, standings, rosters and stats. It's a website, so there's nothing to download or install. Open the link on any phone or computer.

## What's on it

- **Live scores** for NBA and WNBA (switch leagues in the header), refreshing every 15 seconds during games, with timeouts left, bonus and who's on the court
- **Games**: box score, win probability, game flow, shot chart, filterable play-by-play, team stats, leaders, ESPN highlight clips, a written recap, officials, where to watch, odds and line movement, pre-game previews, and head to head (the last few seasons of meetings, from both teams' schedules)
- **Scores page extras**: Your players (starred players' live lines), Pick'em, Who's out, top scorers, multi-view and This week. Upcoming games show Fullcourt's own win chance (from the Playoff Odds and Bracketology models, `wp.json` on the `sim-data` and `march-data` branches); live games without ESPN's win probability show a live estimate built from that pregame number, the score and the time left
- **Standings** by conference and league, plus the playoff picture
- **Playoff odds** (Standings → Odds): the rest of the season simulated 20,000 times on GitHub every 3 hours (`tools/sim.mjs` running `src/m/simengine.js`, `sim-data` branch). Ratings blend ESPN's BPI with an opponent-adjusted, recency-weighted margin; injuries come off until each player's expected return; today's games use the betting line; NBA tiebreakers decide seeds. Per-team sheets show seed range, odds over time, next-game swing and the rating breakdown; "Sim the season" plays one full outcome on the page with the same engine
- **Bracketology** (college Rankings → Bracketology, men's and women's): the rest of the season, every conference tournament, Selection Sunday (68 teams by an S-curve) and the tournament simulated 10,000 times twice a day (`tools/march.mjs` running `src/m/marchengine.js`, `march-data` branch). Ratings: opponent- and home-adjusted margin pulled toward last season, blended with ESPN's BPI for the men. Projected bracket, odds table, bubble, conference favorites, per-team sheets and "Sim the tournament"
- **Health check** every 6 hours (`tools/health.mjs`): data files fresh and complete, background jobs passing, ESPN feeds still shaped as expected, all three sites on the current build, Replay still finding new game videos, and GitHub Pages' CORS header for the Windows app. Opens a GitHub issue while something's wrong and closes it when fixed; results are in Settings → Data status (`health-data` branch)
- **Teams**: roster, depth chart (ESPN's for the NBA; built from recent starters and minutes for the WNBA and college), injury report, schedule strip and month calendar, and league-wide team rankings
- **Players**: averages, last-10 trend chart, splits, recent games, career highs (worked out from every season's game log), collapsible career stats, and share-as-image
- **Leaders** in 11 categories, plus Fullcourt's own MVP and Rookie races
- **Replay**: a feed of every finished game's highlights, newest first, filterable by team and date, with each game's top plays. YouTube game videos are matched to games every 30 minutes by `tools/yt.mjs` (`yt-data` branch): the NBA's nightly full game highlights (and extended cuts), the WNBA's full game highlights (season, playoffs and Finals playlists), and for men's and women's college the ACC (full game replays, condensed games, highlights), Big 12 (extended highlights, highlights) and Big East (highlights) playlists. It uses the YouTube Data API when the `YT_KEY` secret works (and then also finds each new season's playlists by name), otherwise YouTube's public playlist feeds
- **Coaches and front offices**: tap a head coach on a team page for their record, seasons, awards and path, plus the front office's record and the team's recent trades (`tools/coach.mjs`, weekly, `coach-data` branch)
- **Mock Draft**: NBA and WNBA mock drafts with a lottery simulator, team needs, a big board, prospect profiles and a share card. Order, needs and the prospect board refresh daily (`tools/draft.mjs`, published to the `draft-data` branch)
- **History** (NBA and WNBA): games on this date back to 2001, every champion and MVP, past standings and leaders, all-time career leader boards with a milestone watch, and profiles for any player past or present. Career leaders and legend profiles refresh weekly from Basketball-Reference (`tools/hist.mjs`, published to the `hist-data` branch)
- **Capsheet** (Cap tab): every NBA team's cap sheet, contract details, options and guarantees, payroll vs the cap, tax and aprons. Contracts refresh weekly from Basketball-Reference and ESPN (`tools/cap.mjs`, published to the `cap-data` branch)
- **Deadline** (Cap → Trade machine): build 2–4 team trades and check them against 2026-27 salary matching, aprons and roster rules; save or share them
- **Chalk** (game sheet → Court): a live or replayed 2D court with shots, a running shot chart and a synced play log
- **Ask Fullcourt**: stats questions in plain English, including career game searches ("Luka 40-point games"), player and team splits (opponent, home/road, wins/losses, back-to-backs, a season, a month, the playoffs) and with/without a teammate; and **Compare** for head-to-head players
- Favorite team with game alerts, Settings to hide parts you don't use, What's new, light/dark mode, keyboard shortcuts, and a home-screen app that keeps your last scores when you lose signal
- All dates and times in Eastern (ET). "Today" switches to the next day at 4 AM ET, so late West Coast games stay on the night they were played.

## Add it to your iPhone home screen

1. Open **[nbafullcourty.netlify.app](https://nbafullcourty.netlify.app)** in **Safari**.
2. Tap **Share** (the square with an up arrow), then **Add to Home Screen**, then **Add**.

It opens full-screen like an app. Updates show up the next time you open it.

## How updates work

Every change pushed to `main` is published automatically by Netlify within about a minute.

The site's code lives in `src/` and is built into the published files before each push:

- `src/shell.html`: the page markup
- `src/core.js` and `src/core.css`: everything the first screen needs
- `src/m/*.js` and `src/m/*.css`: extras that load the first time they're opened (Ask, Compare, multi-view, playoff picture, award races, team rankings, share images, mini scoreboard, What's new)

To build (one-time setup, then the build itself):

```
npm i --prefix /tmp/fc-tools acorn acorn-walk esbuild
NODE_PATH=/tmp/fc-tools/node_modules node tools/build.mjs
```

That writes `index.html` and `assets/`. Each module automatically imports what it uses from core. File names include a content hash, so browsers keep them until they change (see `_headers`).

### Scores API

`/api/scores` is a small JSON scoreboard (a Netlify Function in `netlify/functions/scores.mjs`), used by the [Mantel](https://github.com/larosa023/Mantel) desktop widget:

```
https://nbafullcourty.netlify.app/api/scores?league=nba
```

- `league`: `nba`, `wnba`, `ncaam` or `ncaaw`
- `date`: `YYYYMMDD` (default: today in ET, rolling over at 4 AM)
- `teams`: only these teams, e.g. `BOS,NY`
- `scope`: college only; `top25` (default, games with a ranked team) or `all`

Games come back live first, then upcoming, then finals, each with a `url` that opens it on the site in the right league (`?league=…&game=…`). Responses are cached at Netlify's edge for 15 seconds during games and longer otherwise, so it barely uses function runs.

Data comes from ESPN's public feeds. Odds are for reference only.
