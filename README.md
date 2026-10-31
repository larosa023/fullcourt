# Fullcourt

### ▶ **[Open Fullcourt → nbafullcourty.netlify.app](https://nbafullcourty.netlify.app)**

Live NBA scores, odds, standings, rosters and stats. It's a website, so there's nothing to download or install. Open the link on any phone or computer.

## What's on it

- **Live scores** for NBA and WNBA (switch leagues in the header), refreshing every 15 seconds during games, with timeouts left, bonus and who's on the court
- **Games**: box score, win probability, game flow, shot chart, filterable play-by-play, team stats, leaders, ESPN highlight clips, a written recap, officials, where to watch, odds and line movement, and pre-game previews
- **Scores page extras**: Your players (starred players' live lines), Pick'em, Who's out, top scorers, multi-view and This week
- **Standings** by conference and league, plus the playoff picture
- **Teams**: roster, injury report, schedule strip and month calendar, and league-wide team rankings
- **Players**: averages, last-10 trend chart, splits, recent games, collapsible career stats, and share-as-image
- **Leaders** in 11 categories, plus Fullcourt's own MVP and Rookie races
- **Ask Fullcourt**: stats questions in plain English, and **Compare** for head-to-head players
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

Data comes from ESPN's public feeds. Odds are for reference only.
