use tauri::{
  ipc::{InvokeBody, Request},
  Manager,
};

/// Session diagnostics (TDR-25): the web layer streams each usage's files
/// (take audio, pitch observations, notes, composition, events) here so the
/// developer can replay the user's REAL take. Files stay on this Mac:
/// `<app data dir>/sessoes/<session>/<name>`. Names are restricted to
/// `[A-Za-z0-9._-]` (no path traversal); the body is raw bytes.
fn safe_name(s: &str) -> bool {
  !s.is_empty()
    && s.len() <= 96
    && !s.starts_with('.')
    && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

#[tauri::command]
fn save_session_file(app: tauri::AppHandle, request: Request<'_>) -> Result<String, String> {
  let header = |k: &str| {
    request
      .headers()
      .get(k)
      .and_then(|v| v.to_str().ok())
      .map(str::to_owned)
      .ok_or_else(|| format!("missing header {k}"))
  };
  let session = header("x-session")?;
  let name = header("x-name")?;
  if !safe_name(&session) || !safe_name(&name) {
    return Err("invalid session/file name".into());
  }
  let InvokeBody::Raw(bytes) = request.body() else {
    return Err("expected a raw byte body".into());
  };
  let dir = app
    .path()
    .app_data_dir()
    .map_err(|e| e.to_string())?
    .join("sessoes")
    .join(&session);
  std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  let path = dir.join(&name);
  std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![save_session_file])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // Desktop auto-update (updater) + relaunch after install (process).
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_process::init())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
