//! Alerts while the main window is closed to the tray.
//!
//! Closing to the tray now closes the window for real, so its web view (most of Fullcourt's memory) goes with it.
//! While it's closed, this thread keeps the alerts going: it reads the ESPN feeds itself, runs the same rules as the
//! phone-alert service (alert_engine.rs) and shows what's due as Windows notifications. While the window is open the
//! page sends its own alerts as before, and this thread sleeps, holding nothing.

use crate::alert_engine::Engine;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::Thread;
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

const ESPN: &str = "https://site.api.espn.com/apis/site/v2/sports/basketball/";

#[derive(Default)]
pub struct Alerts {
    /// What the page last sent: the same choices it gives the phone-alert service (teams, game night, players, bets).
    prefs: Mutex<Option<String>>,
    /// The main window is closed: alerts are this thread's job.
    tray: AtomicBool,
    /// Bumped on every change above, so the thread knows to look again.
    gen: AtomicU64,
    thread: Mutex<Option<Thread>>,
}

impl Alerts {
    pub fn start(app: AppHandle) -> Arc<Alerts> {
        let me = Arc::new(Alerts::default());
        let me2 = me.clone();
        let t = std::thread::Builder::new()
            .name("tray-alerts".into())
            .spawn(move || me2.run(app))
            .expect("tray alerts thread");
        *me.thread.lock().unwrap() = Some(t.thread().clone());
        me
    }

    pub fn set_prefs(&self, json: String) {
        let mut p = self.prefs.lock().unwrap();
        if p.as_deref() != Some(json.as_str()) {
            *p = Some(json);
            self.poke();
        }
    }

    /// The main window went to the tray (true) or came back (false).
    pub fn set_tray(&self, on: bool) {
        if self.tray.swap(on, Ordering::SeqCst) != on {
            self.poke();
        }
    }

    fn poke(&self) {
        self.gen.fetch_add(1, Ordering::SeqCst);
        if let Some(t) = self.thread.lock().unwrap().as_ref() {
            t.unpark();
        }
    }

    /// Waits until `until`, or until something changes. True when something changed.
    fn wait(&self, gen: u64, until: Instant) -> bool {
        loop {
            if self.gen.load(Ordering::SeqCst) != gen {
                return true;
            }
            let now = Instant::now();
            if now >= until {
                return false;
            }
            std::thread::park_timeout(until - now);
        }
    }

    fn run(&self, app: AppHandle) {
        let client = reqwest::Client::builder()
            .user_agent("Fullcourt")
            .timeout(Duration::from_secs(8))
            .build()
            .ok();
        // made fresh each time the window goes to the tray (the page covered everything until then) and dropped when
        // it comes back, so nothing is held while the window is open
        let mut engine: Option<(Engine, Option<String>)> = None;
        loop {
            let gen = self.gen.load(Ordering::SeqCst);
            if !self.tray.load(Ordering::SeqCst) {
                engine = None;
                self.wait(gen, Instant::now() + Duration::from_secs(24 * 3600));
                continue;
            }
            let prefs = self.prefs.lock().unwrap().clone();
            let Some(prefs) = prefs else {
                self.wait(gen, Instant::now() + Duration::from_secs(3600));
                continue;
            };
            if engine.is_none() {
                match Engine::new() {
                    Ok(e) => engine = Some((e, None)),
                    Err(e) => {
                        eprintln!("tray alerts: {e}");
                        self.wait(gen, Instant::now() + Duration::from_secs(3600));
                        continue;
                    }
                }
            }
            let (eng, applied) = engine.as_mut().unwrap();
            if applied.as_deref() != Some(prefs.as_str()) {
                let _ = eng.prefs(&prefs);
                *applied = Some(prefs);
            }
            let sleep = match &client {
                Some(c) => self.pass(&app, eng, c).unwrap_or_else(|e| {
                    eprintln!("tray alerts: {e}");
                    60_000.0
                }),
                None => 3_600_000.0,
            };
            // between 45 seconds (a live game, as the page checks) and 30 minutes (nothing on until later)
            let ms = sleep.clamp(45_000.0, 1_800_000.0) as u64;
            self.wait(gen, Instant::now() + Duration::from_millis(ms));
        }
    }

    /// One pass: read the scoreboards, then the game feeds and injury reports the rules ask for, then notify.
    /// Returns how long the rules say to wait (ms).
    fn pass(&self, app: &AppHandle, eng: &Engine, client: &reqwest::Client) -> Result<f64, String> {
        let now = || std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as f64).unwrap_or(0.0);
        let plan: serde_json::Value = serde_json::from_str(&eng.plan(now())?).map_err(|e| e.to_string())?;
        let plan = plan.as_array().cloned().unwrap_or_default();
        if plan.is_empty() {
            return Ok(3_600_000.0); // nothing switched on; a change from the page wakes this up
        }
        let wanted = |list: &[serde_json::Value], key: &str| -> Vec<(String, String)> {
            list.iter()
                .filter_map(|x| Some((x[key].as_str()?.to_string(), x["url"].as_str()?.to_string())))
                .filter(|(_, url)| url.starts_with(ESPN))
                .collect()
        };
        let boards = fetch_all(client, wanted(&plan, "lg"));
        let boards = serde_json::Value::Object(boards.into_iter().map(|(k, v)| (k, v.map_or(serde_json::Value::Null, serde_json::Value::String))).collect());
        let next: serde_json::Value = serde_json::from_str(&eng.boards(&boards.to_string(), now())?).map_err(|e| e.to_string())?;
        let empty = vec![];
        let sums = fetch_all(client, wanted(next["read"].as_array().unwrap_or(&empty), "id"));
        let inj = fetch_all(client, wanted(next["inj"].as_array().unwrap_or(&empty), "lg"));
        let keep = |m: Vec<(String, Option<String>)>| serde_json::Value::Object(m.into_iter().filter_map(|(k, v)| Some((k, serde_json::Value::String(v?)))).collect());
        let extra = serde_json::json!({ "sums": keep(sums), "inj": keep(inj) });
        let out: serde_json::Value = serde_json::from_str(&eng.finish(&extra.to_string(), now())?).map_err(|e| e.to_string())?;
        for m in out["msgs"].as_array().unwrap_or(&empty) {
            let (Some(title), Some(body)) = (m["title"].as_str(), m["body"].as_str()) else { continue };
            let _ = app.notification().builder().title(title).body(body).show();
        }
        Ok(out["sleep"].as_f64().unwrap_or(60_000.0))
    }
}

/// Reads several feeds at once (a pass needs a handful at most). A feed that doesn't answer comes back as None.
fn fetch_all(client: &reqwest::Client, list: Vec<(String, String)>) -> Vec<(String, Option<String>)> {
    if list.is_empty() {
        return vec![];
    }
    tauri::async_runtime::block_on(async {
        let jobs: Vec<_> = list
            .into_iter()
            .map(|(k, url)| {
                let c = client.clone();
                tauri::async_runtime::spawn(async move {
                    let text = async { c.get(&url).header("accept", "application/json").send().await?.error_for_status()?.text().await };
                    (k, text.await.ok())
                })
            })
            .collect();
        let mut out = vec![];
        for j in jobs {
            if let Ok(r) = j.await {
                out.push(r);
            }
        }
        out
    })
}
