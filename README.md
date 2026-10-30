# Fullcourt

### ▶ **[Open Fullcourt → nbafullcourty.netlify.app](https://nbafullcourty.netlify.app)**

Live NBA scores, odds, standings, rosters and stats. It's a website, so there's nothing to download or install. Open the link on any phone or computer.

## What's on it

- **Live scores** that refresh every 15 seconds during games, with a progress bar and score flashes
- **Odds** for upcoming games: moneyline, spread and over/under (DraftKings, via ESPN), with line movement since open
- **Game details**: linescore, win probability, box score, team stats, play-by-play and leaders
- **Standings** for the East, the West and the whole league, with playoff and play-in lines
- **Teams**: roster with photos, schedule and results, and team stats
- **Players**: season and career averages, recent games and bio
- **League leaders** in 11 categories
- Light and dark mode, and drag-to-scroll on anything that moves sideways
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
