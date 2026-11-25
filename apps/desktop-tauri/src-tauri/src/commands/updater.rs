//! Updater lifecycle commands: check, download, apply, dismiss, and release-page linking.
//!
//! State transitions are mirrored through [`events::emit_update_state_changed`]
//! so the frontend can react without polling.

use std::sync::Mutex;

use tauri::Manager;

use super::open_url_in_browser;
use crate::events;
use crate::state::{AppState, UpdateState, UpdateStatePayload};
use codexbar::updater::UpdateInfo;

#[tauri::command]
pub fn get_update_state(state: tauri::State<'_, Mutex<AppState>>) -> UpdateStatePayload {
    state
        .lock()
        .map(|guard| guard.update_payload())
        .unwrap_or_else(|_| UpdateState::default().to_payload())
}

#[tauri::command]
pub async fn check_for_updates(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<UpdateStatePayload, String> {
    check_update(&app, &state, false).await
}

#[tauri::command]
pub async fn install_github_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<UpdateStatePayload, String> {
    check_update(&app, &state, true).await
}

async fn check_update(
    app: &tauri::AppHandle,
    state: &Mutex<AppState>,
    install: bool,
) -> Result<UpdateStatePayload, String> {
    let checking_payload = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        match guard.update_state {
            UpdateState::Checking | UpdateState::Downloading(_) => {
                guard.install_update_when_ready |= install;
                return Ok(guard.update_payload());
            }
            UpdateState::Ready => {
                if install {
                    drop(guard);
                    install_ready_update(app, state)?;
                    guard = state.lock().map_err(|e| e.to_string())?;
                }
                return Ok(guard.update_payload());
            }
            _ => {}
        }
        guard.update_state = UpdateState::Checking;
        guard.install_update_when_ready = install;
        guard.update_info = None;
        guard.installer_path = None;
        guard.update_payload()
    };
    events::emit_update_state_changed(app, &checking_payload);

    let settings = codexbar::settings::Settings::load();

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        codexbar::updater::try_check_for_updates(settings.update_channel),
    )
    .await;

    let (new_state, new_info) = match result {
        Ok(Ok(Some(info))) => (UpdateState::Available(info.version.clone()), Some(info)),
        Ok(Ok(None)) => (UpdateState::Idle, None),
        Ok(Err(error)) => (UpdateState::Error(error), None),
        Err(_) => (
            UpdateState::Error("Update check timed out".to_string()),
            None,
        ),
    };

    let (payload, download) = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.update_state = new_state;
        guard.update_info = new_info;
        guard.last_update_check_ms = Some(chrono::Utc::now().timestamp_millis());
        let download = guard
            .update_info
            .as_ref()
            .filter(|info| guard.install_update_when_ready && info.supports_auto_download())
            .cloned();
        guard.install_update_when_ready = download.is_some();
        if download.is_some() {
            guard.update_state = UpdateState::Downloading(0.0);
        }
        (guard.update_payload(), download)
    };
    events::emit_update_state_changed(app, &payload);
    if let Some(info) = download {
        spawn_download_task(app.clone(), info);
    }

    Ok(payload)
}

#[tauri::command]
pub async fn download_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<UpdateStatePayload, String> {
    let (payload, info) = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        match &guard.update_state {
            UpdateState::Available(_) | UpdateState::Error(_) => {}
            UpdateState::Downloading(_) => return Ok(guard.update_payload()),
            _ => return Err("No update available to download".to_string()),
        }
        let info = guard
            .update_info
            .as_ref()
            .filter(|info| info.supports_auto_download())
            .cloned()
            .ok_or("No verified installer is available to download")?;
        guard.update_state = UpdateState::Downloading(0.0);
        (guard.update_payload(), info)
    };
    events::emit_update_state_changed(&app, &payload);
    spawn_download_task(app, info);
    Ok(payload)
}

fn spawn_download_task(app_handle: tauri::AppHandle, info: UpdateInfo) {
    tokio::spawn(async move {
        let (tx, rx) = tokio::sync::watch::channel(codexbar::updater::UpdateState::Available);
        let progress_handle = spawn_download_progress_task(app_handle.clone(), rx);
        let result =
            tokio::spawn(async move { codexbar::updater::download_update(&info, tx).await })
                .await
                .map_err(|error| format!("Download task failed: {error}"))
                .and_then(|result| result);
        progress_handle.abort();
        let _progress_finished = progress_handle.await;
        finish_download(&app_handle, result);
    });
}

fn spawn_download_progress_task(
    app: tauri::AppHandle,
    mut rx: tokio::sync::watch::Receiver<codexbar::updater::UpdateState>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        while rx.changed().await.is_ok() {
            let backend_state = rx.borrow().clone();
            if let codexbar::updater::UpdateState::Downloading(progress) = backend_state {
                emit_download_progress(&app, progress);
            }
        }
    })
}

fn emit_download_progress(app: &tauri::AppHandle, progress: f32) {
    let st = app.state::<Mutex<AppState>>();
    let payload = {
        let mut guard = st.lock().unwrap();
        guard.update_state = UpdateState::Downloading(progress);
        guard.update_payload()
    };
    events::emit_update_state_changed(app, &payload);
}

fn finish_download(app: &tauri::AppHandle, result: Result<std::path::PathBuf, String>) {
    let state = app.state::<Mutex<AppState>>();
    let (payload, install) = {
        let mut guard = state.lock().unwrap();
        match result {
            Ok(path) => {
                guard.update_state = UpdateState::Ready;
                guard.installer_path = Some(path);
            }
            Err(error) => guard.update_state = UpdateState::Error(error),
        }
        let install =
            std::mem::take(&mut guard.install_update_when_ready) && guard.installer_path.is_some();
        (guard.update_payload(), install)
    };
    if install {
        let _install_result = install_ready_update(app, &state);
    } else {
        events::emit_update_state_changed(app, &payload);
    }
}

#[tauri::command]
pub fn apply_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<(), String> {
    install_ready_update(&app, &state)
}

fn install_ready_update(app: &tauri::AppHandle, state: &Mutex<AppState>) -> Result<(), String> {
    if let Err(error) = apply_ready_update(state) {
        let payload = {
            let mut guard = state.lock().map_err(|e| e.to_string())?;
            guard.update_state = UpdateState::Error(error);
            guard.update_payload()
        };
        events::emit_update_state_changed(app, &payload);
    }
    Ok(())
}

pub(crate) fn apply_ready_update(state: &Mutex<AppState>) -> Result<(), String> {
    let (path, expected_sha256) = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        let expected_sha256 = guard
            .update_info
            .as_ref()
            .and_then(|info| info.expected_sha256.clone())
            .ok_or("Missing SHA256 digest for downloaded update")?;
        let path = guard
            .installer_path
            .take()
            .ok_or("No downloaded update available to apply")?;
        (path, expected_sha256)
    };
    codexbar::updater::verify_installer_hash(&path, &expected_sha256)?;
    codexbar::updater::apply_update(&path)
}

#[tauri::command]
pub fn dismiss_update(
    app: tauri::AppHandle,
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<UpdateStatePayload, String> {
    let payload = {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        if matches!(
            guard.update_state,
            UpdateState::Checking | UpdateState::Downloading(_)
        ) {
            return Ok(guard.update_payload());
        }
        guard.update_state = UpdateState::Idle;
        guard.update_info = None;
        guard.installer_path = None;
        guard.update_payload()
    };
    events::emit_update_state_changed(&app, &payload);
    Ok(payload)
}

#[tauri::command]
pub fn open_release_page(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let url = {
        let guard = state.lock().map_err(|e| e.to_string())?;
        guard
            .update_info
            .as_ref()
            .map(|info| info.release_url.clone())
            .ok_or("No update information available")?
    };
    open_url_in_browser(&url)
}
