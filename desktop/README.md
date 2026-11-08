# Fullcourt for Windows

The Windows app is the website packed into a small program (Tauri, using the Edge engine built into Windows).
It pulls the same live data as the site: scores and stats from ESPN, props from the odds file, awards from GitHub.

* **Build a test copy:** push to the `desktop` branch, or run the *desktop* workflow from the Actions tab.
  The installer shows up as a download on that workflow run.
* **Ship a version:** change the number in `desktop/VERSION` (e.g. `1.0.1`) and push to main. GitHub builds it
  and publishes `Fullcourt-Setup.exe` as release `desktop-v1.0.1`. (Pushing a `desktop-v…` tag works too.)
  The app checks Releases and offers the update to anyone running an older version. Changes inside `desktop/`
  don't trigger a Netlify deploy.
* **Website changes don't need a new version** (since 1.3.0). The main window opens through `loader.html`, which loads
  the newest site from GitHub Pages into the app's own address (so saved data stays), falling back to the copy built
  into the app (`app.html`) when offline. Ship a new version only for changes to the app itself (this folder).

Nothing in this folder is used by the website. The site code knows it's inside the app when `window.__TAURI__` exists.
