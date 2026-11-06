// no console window behind the app in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

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
        .run(tauri::generate_context!())
        .expect("error while running Fullcourt");
}
