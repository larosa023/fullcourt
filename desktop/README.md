# Fullcourt for Windows

The Windows app is the website packed into a small program (Tauri, using the Edge engine built into Windows).
It pulls the same live data as the site: scores and stats from ESPN, props from the odds file, awards from GitHub.

* **Build a test copy:** push to the `desktop` branch, or run the *desktop* workflow from the Actions tab.
  The installer shows up as a download on that workflow run.
* **Ship a version:** tag it, e.g. `git tag desktop-v1.0.1 && git push origin desktop-v1.0.1`.
  GitHub builds it and publishes `Fullcourt-Setup.exe` on the Releases page. The app checks Releases and
  offers the update to anyone running an older version.

Nothing in this folder is used by the website. The site code knows it's inside the app when `window.__TAURI__` exists.
