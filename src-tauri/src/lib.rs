use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, Runtime,
};
use tauri_plugin_store::StoreExt;

const WINDOW_WIDTH: f64 = 440.0;
const PADDING: f64 = 8.0;
const MAX_CONVERSATIONS: usize = 20;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Conversation {
    id: String,
    title: String,
    messages: Vec<Message>,
    mode: Option<String>,
    created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Message {
    role: String,
    content: String,
}

#[tauri::command]
fn get_api_key(app: tauri::AppHandle) -> Option<String> {
    let store = app.store("store.json").ok()?;
    store
        .get("api_key")
        .and_then(|v| v.as_str().map(String::from))
}

#[tauri::command]
fn set_api_key(app: tauri::AppHandle, key: String) {
    if let Ok(store) = app.store("store.json") {
        store.set("api_key", serde_json::Value::String(key));
        let _ = store.save();
    }
}

#[tauri::command]
fn get_conversations(app: tauri::AppHandle) -> Vec<Conversation> {
    if let Ok(store) = app.store("store.json") {
        if let Some(v) = store.get("conversations") {
            if let Ok(convs) = serde_json::from_value::<Vec<Conversation>>(v.clone()) {
                return convs;
            }
        }
    }
    Vec::new()
}

#[tauri::command]
fn save_conversation(app: tauri::AppHandle, conversation: Conversation) {
    if let Ok(store) = app.store("store.json") {
        let mut conversations: Vec<Conversation> = if let Some(v) = store.get("conversations") {
            serde_json::from_value(v.clone()).unwrap_or_default()
        } else {
            Vec::new()
        };

        if let Some(pos) = conversations.iter().position(|c| c.id == conversation.id) {
            conversations[pos] = conversation;
        } else {
            conversations.insert(0, conversation);
        }

        if conversations.len() > MAX_CONVERSATIONS {
            conversations.truncate(MAX_CONVERSATIONS);
        }

        store.set(
            "conversations",
            serde_json::to_value(&conversations).unwrap(),
        );
        let _ = store.save();
    }
}

#[tauri::command]
fn delete_conversation(app: tauri::AppHandle, id: String) {
    if let Ok(store) = app.store("store.json") {
        let mut conversations: Vec<Conversation> = if let Some(v) = store.get("conversations") {
            serde_json::from_value(v.clone()).unwrap_or_default()
        } else {
            Vec::new()
        };

        conversations.retain(|c| c.id != id);

        store.set(
            "conversations",
            serde_json::to_value(&conversations).unwrap(),
        );
        let _ = store.save();
    }
}

fn toggle_window<R: Runtime>(app: &tauri::AppHandle<R>, tray_rect: &tauri::Rect) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let (tray_x, tray_y, tray_width, tray_height) =
                match (&tray_rect.position, &tray_rect.size) {
                    (tauri::Position::Physical(pos), tauri::Size::Physical(size)) => (
                        pos.x as f64,
                        pos.y as f64,
                        size.width as f64,
                        size.height as f64,
                    ),
                    (tauri::Position::Logical(pos), tauri::Size::Logical(size)) => {
                        (pos.x, pos.y, size.width, size.height)
                    }
                    _ => (0.0, 0.0, 0.0, 0.0),
                };

            let tray_center_x = tray_x + (tray_width / 2.0);
            let tray_bottom_y = tray_y + tray_height;
            let window_x = tray_center_x - (WINDOW_WIDTH / 2.0);
            let window_y = tray_bottom_y + PADDING;

            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: window_x as i32,
                y: window_y as i32,
            }));
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            get_conversations,
            save_conversation,
            delete_conversation
        ])
        .setup(|app| {
            let _ = app.store("store.json")?;

            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

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
                        rect,
                        ..
                    } = event
                    {
                        toggle_window(&handle, &rect);
                    }
                })
                .build(app)?;

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
