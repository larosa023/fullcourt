// no console window behind the app in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// closing the main window hides it to the tray (on by default; Settings can turn it off)
static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

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
    let _ = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("mini.html".into()))
        .title("Fullcourt mini")
        .inner_size(380.0, 640.0)
        .min_inner_size(300.0, 260.0)
        .always_on_top(true)
        .use_https_scheme(true)
        .background_color(tauri::window::Color(12, 14, 18, 255))
        .build();
}

#[tauri::command]
fn open_mini(app: AppHandle) {
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
    tauri::Builder::default()
        // opening Fullcourt again focuses the window that's already open
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_window_state::Builder::default().build()) // remembers size and position
        .plugin(tauri_plugin_opener::init()) // outside links open in the normal browser
        .plugin(tauri_plugin_notification::init()) // alerts as Windows notifications
        .invoke_handler(tauri::generate_handler![install_update, open_mini, focus_main, set_mini_on_top, set_close_to_tray, save_export])
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
                    "mini" => open_mini_window(app),
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
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && CLOSE_TO_TRAY.load(Ordering::Relaxed) {
                    api.prevent_close();
                    let _ = window.hide();
                    let _ = window.emit("fc-to-tray", ());
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Fullcourt");
}
