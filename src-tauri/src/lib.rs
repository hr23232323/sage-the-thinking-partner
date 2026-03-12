use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};
use tauri_plugin_store::StoreExt;

#[tauri::command]
fn get_api_key(app: tauri::AppHandle) -> Option<String> {
    let store = app.store("store.json").ok()?;
    store.get("api_key").and_then(|v| v.as_str().map(String::from))
}

#[tauri::command]
fn set_api_key(app: tauri::AppHandle, key: String) {
    if let Ok(store) = app.store("store.json") {
        let _ = store.set("api_key", serde_json::Value::String(key));
        let _ = store.save();
    }
}

fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![get_api_key, set_api_key])
        .setup(|app| {
            // Hide dock icon on macOS — pure menu bar app
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // Build tray icon — embedded at compile time so it always works
            let icon = Image::from_bytes(include_bytes!("../icons/tray-icon.png"))
                .expect("tray icon missing");

            let handle = app.handle().clone();
            TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .on_tray_icon_event(move |_tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_window(&handle);
                    }
                })
                .build(app)?;

            // Hide window when it loses focus
            let window = app.get_webview_window("main").unwrap();
            window.on_window_event({
                let window = window.clone();
                move |event| {
                    if let tauri::WindowEvent::Focused(false) = event {
                        let _ = window.hide();
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
