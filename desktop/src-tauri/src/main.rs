// no console window behind the app in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

// Where each window sits is written to disk shortly after it's moved or resized, and when it goes to the tray, so the
// app reopens on the same monitor even if Windows shuts down while it's in the tray (the plugin on its own only saves
// when the app quits through Quit). Whether it was hidden isn't kept: the app always opens showing.
fn keep_flags() -> StateFlags {
    StateFlags::all() & !StateFlags::VISIBLE
}
static LAST_MOVE: AtomicU64 = AtomicU64::new(0);
static SAVER: AtomicBool = AtomicBool::new(false);
fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
/// Save once things have been still for about a second (one waiting thread at most, however many move events come in).
fn save_soon(app: &AppHandle) {
    LAST_MOVE.store(now_ms(), Ordering::Relaxed);
    if SAVER.swap(true, Ordering::AcqRel) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(std::time::Duration::from_millis(400));
            if now_ms().saturating_sub(LAST_MOVE.load(Ordering::Relaxed)) >= 900 {
                break;
            }
        }
        SAVER.store(false, Ordering::Release);
        let _ = app.save_window_state(keep_flags());
    });
}

// closing the main window hides it to the tray (on by default; Settings can turn it off)
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

// a game to open that came in on the command line (`--league nba --game 401…`, e.g. from Isle)
static LAUNCH: Mutex<Option<(String, String)>> = Mutex::new(None);

/// Reads `--league <lg> --game <id>` from command-line arguments. Both must be short and alphanumeric.
fn game_args(args: &[String]) -> Option<(String, String)> {
    let mut league = String::from("nba");
    let mut game: Option<String> = None;
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match a.as_str() {
            "--league" => {
                if let Some(v) = it.next() {
                    league = v.to_lowercase();
                }
            }
            "--game" => game = it.next().cloned(),
            _ => {}
        }
    }
    let ok = |s: &str| !s.is_empty() && s.len() <= 32 && s.chars().all(|c| c.is_ascii_alphanumeric());
    game.filter(|g| ok(g) && ok(&league)).map(|g| (league, g))
}

/// The page asks once at startup whether it was opened to show a particular game.
#[tauri::command]
fn launch_target() -> Option<serde_json::Value> {
    let (league, game) = LAUNCH.lock().ok()?.take()?;
    Some(serde_json::json!({ "league": league, "game": game }))
}

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Built-in updater: download the new installer from this repo's GitHub Releases, check it against the
/// SHA-256 GitHub publishes for it, then close, install silently and reopen.
#[tauri::command]
async fn install_update(app: tauri::AppHandle, url: String, sha256: Option<String>) -> Result<(), String> {
    if !url.starts_with("https://github.com/larosa023/fullcourt/releases/download/") {
        return Err("That update link isn't from Fullcourt's releases.".into());
    }
    let client = reqwest::Client::builder().user_agent("Fullcourt-updater").build().map_err(err)?;
    let mut resp = client.get(&url).send().await.map_err(err)?.error_for_status().map_err(err)?;
    let total = resp.content_length().unwrap_or(0);
    let mut buf: Vec<u8> = Vec::with_capacity(total as usize);
    let mut last = u64::MAX;
    while let Some(chunk) = resp.chunk().await.map_err(err)? {
        buf.extend_from_slice(&chunk);
        let pct = if total > 0 { buf.len() as u64 * 100 / total } else { 0 };
        if pct != last {
            last = pct;
            let _ = app.emit("fc-update-progress", pct);
        }
    }
    if buf.len() < 1_000_000 {
        return Err("The download came back incomplete.".into());
    }
    if let Some(want) = sha256.filter(|s| !s.is_empty()) {
        let got = format!("{:x}", Sha256::digest(&buf));
        if !got.eq_ignore_ascii_case(want.trim_start_matches("sha256:")) {
            return Err("The download didn't match GitHub's checksum, so it wasn't installed.".into());
        }
    }
    let setup = std::env::temp_dir().join("Fullcourt-Setup-update.exe");
    std::fs::write(&setup, &buf).map_err(err)?;
    let exe = std::env::current_exe().map_err(err)?;
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // wait for this window to close, install silently over the current version, then reopen
        let script = format!(
            "/C ping -n 3 127.0.0.1 >nul & \"{}\" /S & start \"\" \"{}\"",
            setup.display(),
            exe.display()
        );
        std::process::Command::new("cmd")
            .raw_arg(script)
            .creation_flags(0x0800_0000) // no console window
            .spawn()
            .map_err(err)?;
    }
    #[cfg(not(windows))]
    {
        let _ = exe;
        return Err("Updating in place only works on Windows.".into());
    }
    #[allow(unreachable_code)]
    {
        app.exit(0);
        Ok(())
    }
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// The mini scoreboard: a small always-on-top window with today's games and tracked bets.
/// Opening it again brings it forward.
fn open_mini_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return;
    }
    // built hidden, moved to where it was last time, then shown (no flash in the default spot first)
    let built = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
        .visible(false)
        .title("Fullcourt mini")
        .inner_size(380.0, 640.0)
        .min_inner_size(300.0, 260.0)
        .always_on_top(true)
        .use_https_scheme(true)
        .background_color(tauri::window::Color(12, 14, 18, 255))
        .build();
    if let Ok(w) = built {
        let _ = w.restore_state(keep_flags());
        let _ = w.show();
        let _ = w.set_focus();
    }
}

// async on purpose: building a window inside a synchronous command deadlocks on Windows (both windows freeze)
#[tauri::command]
async fn open_mini(app: AppHandle) {
    open_mini_window(&app);
}

#[tauri::command]
fn focus_main(app: AppHandle) {
    show_main(&app);
}

#[tauri::command]
fn set_mini_on_top(app: AppHandle, on: bool) {
    if let Some(w) = app.get_webview_window("mini") {
        let _ = w.set_always_on_top(on);
    }
}

#[tauri::command]
fn set_close_to_tray(on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
}

/// Export my data: write the file straight to Downloads and say where it went.
#[tauri::command]
fn save_export(app: AppHandle, name: String, text: String) -> Result<String, String> {
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c)).collect();
    let dir = app.path().download_dir().map_err(err)?;
    let path = dir.join(if safe.is_empty() { "fullcourt-data.json".into() } else { safe });
    std::fs::write(&path, text).map_err(err)?;
    Ok(path.display().to_string())
}

fn main() {
    if let Some(t) = game_args(&std::env::args().collect::<Vec<_>>()) {
        if let Ok(mut l) = LAUNCH.lock() {
            *l = Some(t);
        }
    }
    tauri::Builder::default()
        // opening Fullcourt again focuses the window that's already open (and opens a game if one was passed)
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            show_main(app);
            if let Some((league, game)) = game_args(&args) {
                let _ = app.emit_to("main", "fc-open", serde_json::json!({ "league": league, "game": game }));
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(keep_flags()).build()) // remembers size, position, monitor
        .plugin(tauri_plugin_opener::init()) // outside links open in the normal browser
        .plugin(tauri_plugin_notification::init()) // alerts as Windows notifications
        .invoke_handler(tauri::generate_handler![install_update, open_mini, focus_main, set_mini_on_top, set_close_to_tray, save_export, launch_target])
        .setup(|app| {
            // tray icon: click to open, right-click for the menu
            let open = MenuItem::with_id(app, "open", "Open Fullcourt", true, None::<&str>)?;
            let mini = MenuItem::with_id(app, "mini", "Mini scoreboard", true, None::<&str>)?;
            let bets = MenuItem::with_id(app, "bets", "Bet desk", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Fullcourt", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &mini, &bets, &sep, &quit])?;
            let mut tray = TrayIconBuilder::with_id("fullcourt")
                .tooltip("Fullcourt")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "open" => show_main(app),
                    "mini" => {
                        // off the event loop, for the same reason as open_mini
                        let a = app.clone();
                        tauri::async_runtime::spawn(async move { open_mini_window(&a) });
                    }
                    "bets" => {
                        show_main(app);
                        let _ = app.emit_to("main", "fc-nav", "#bets");
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            // the main window starts hidden (tauri.conf.json): put it back where it was, then show it, so it doesn't
            // flash on the main monitor first. Waits briefly in case the window isn't made yet.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                for _ in 0..100 {
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.restore_state(keep_flags());
                        let _ = w.show();
                        let _ = w.set_focus();
                        return;
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) => save_soon(window.app_handle()),
            tauri::WindowEvent::CloseRequested { api, .. } => {
                if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    // remember where it was before it goes to the tray
                    let _ = window.app_handle().save_window_state(keep_flags());
                    let _ = window.hide();
                    let _ = window.emit("fc-to-tray", ());
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running Fullcourt");
}
