// no console window behind the app in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use tauri::{Emitter, Manager};

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

fn main() {
    tauri::Builder::default()
        // opening Fullcourt again focuses the window that's already open
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build()) // remembers size and position
        .plugin(tauri_plugin_opener::init()) // outside links open in the normal browser
        .plugin(tauri_plugin_notification::init()) // alerts as Windows notifications
        .invoke_handler(tauri::generate_handler![install_update])
        .run(tauri::generate_context!())
        .expect("error while running Fullcourt");
}
