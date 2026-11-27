use super::*;

/// The partial patch accepted by the desktop Settings window.
#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct SettingsUpdate {
    enabled_providers: Option<Vec<String>>,
    start_at_login: Option<bool>,
    start_minimized: Option<bool>,
    promote_tray_icon: Option<bool>,
    claude_allow_reading_claude_code_credentials: Option<bool>,
    claude_desktop_cookies_enabled: Option<bool>,
    codex_external_oauth_sources_allowed: Option<bool>,
    antigravity_additional_profile_homes: Option<Vec<String>>,
}

fn normalize_custom_sessions_dirs(dirs: Vec<String>) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for dir in dirs {
        let trimmed = dir.trim();
        if trimmed.is_empty() {
            continue;
        }
        let key = trimmed.replace('/', "\\").to_ascii_lowercase();
        if seen.insert(key) {
            out.push(trimmed.to_string());
        }
    }

    out
}

static UPDATE_SETTINGS_LOCK: Mutex<()> = Mutex::new(());

/// Hold [`UPDATE_SETTINGS_LOCK`] around a settings load -> change -> save made
/// outside `update_settings`. Drop it before follow-up work that may save again.
pub(crate) fn lock_settings_writes() -> std::sync::MutexGuard<'static, ()> {
    UPDATE_SETTINGS_LOCK
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

#[tauri::command]
pub async fn update_settings(
    app: tauri::AppHandle,
    patch: SettingsUpdate,
) -> Result<SettingsSnapshot, String> {
    let write_guard = lock_settings_writes();
    let mut settings = Settings::load();
    let previous_promoted = settings.promote_tray_icon;
    let providers_changed = patch.enabled_providers.is_some();
    let refresh_provider_data = providers_changed
        || patch.claude_allow_reading_claude_code_credentials.is_some()
        || patch.codex_external_oauth_sources_allowed.is_some();

    if let Some(enabled) = patch.enabled_providers {
        settings.enabled_providers = enabled.into_iter().collect();
    }
    if let Some(enabled) = patch.start_at_login {
        settings
            .set_start_at_login(enabled)
            .map_err(|error| error.to_string())?;
    }
    if let Some(minimized) = patch.start_minimized {
        settings.start_minimized = minimized;
    }
    if let Some(promoted) = patch.promote_tray_icon {
        settings.promote_tray_icon = promoted;
    }
    if let Some(allowed) = patch.claude_allow_reading_claude_code_credentials {
        settings.claude_allow_reading_claude_code_credentials = allowed;
    }
    if let Some(enabled) = patch.claude_desktop_cookies_enabled {
        settings.set_claude_desktop_cookies_enabled(enabled);
    }
    if let Some(allowed) = patch.codex_external_oauth_sources_allowed {
        settings.codex_external_oauth_sources_allowed = allowed;
    }
    if let Some(homes) = patch.antigravity_additional_profile_homes {
        settings.antigravity_additional_profile_homes = normalize_custom_sessions_dirs(homes);
    }

    settings.save().map_err(|error| error.to_string())?;
    drop(write_guard);

    if let Some(promoted) = patch.promote_tray_icon
        && (promoted || crate::tray_visibility::should_write_demotion(previous_promoted, promoted))
    {
        crate::tray_visibility::apply_promotion(promoted);
    }
    if refresh_provider_data {
        let enabled_ids = settings.get_enabled_provider_ids();
        let state = app.state::<Mutex<AppState>>();
        let _ = invalidate_provider_refresh_and_prune_disabled(&state, &enabled_ids);
    }
    if providers_changed {
        crate::tray_bridge::refresh_tray_presentation(&app);
    }
    events::emit_settings_changed(&app);
    if refresh_provider_data {
        tauri::async_runtime::spawn(async move {
            let _ = do_refresh_providers(&app).await;
        });
    }

    Ok(SettingsSnapshot::from(settings))
}
