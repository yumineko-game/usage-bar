# Architecture

This page shows how UsageBar is put together: the crates, the windows, and how usage data and settings move between them. It covers the Windows port only. The upstream `docs/architecture.md` describes Swift modules, WidgetKit and Sparkle, which this port doesn't use.

## Crates and folders

| Area | Path | Role |
| --- | --- | --- |
| Shared backend and CLI | `rust/` (crate `codexbar`) | Providers, settings, browser cookies, tray icon pixels, the CLI |
| Desktop shell | `apps/desktop-tauri/src-tauri/` (crate `codexbar-desktop-tauri`) | Tauri 2 host: tray, windows, commands and proof harness |
| Frontend | `apps/desktop-tauri/src/` | React 18 and Vite: tray panel and Settings |

The root `Cargo.toml` is a workspace with the members `rust` and `apps/desktop-tauri/src-tauri`. The Tauri crate is the default member. It depends on `codexbar = { path = "../../../rust" }`.

## Entry points

- **Desktop app:** `apps/desktop-tauri/src-tauri/src/main.rs`. It loads settings, reads the proof harness variables, sets up the tray, starts auto refresh and registers the commands. Cargo builds it as `codexbar-desktop-tauri.exe`.
- **CLI:** `rust/src/main.rs`. It has no GUI. Run with no subcommand, it prints a hint and exits with code 64. Cargo builds it as `codexbar.exe`.
- **Frontend:** `apps/desktop-tauri/src/App.tsx` picks the surface from the window label.

The release script packages the desktop binary as a Windows installer and portable executable. See the [release instructions](../README.md#ビルドとリリース).

## Windows

The app runs one hidden window and opens the others on demand.

| Label | Page | What it shows |
| --- | --- | --- |
| `main` | `index.html` | Nothing. It stays hidden and hosts app state. Proof mode `trayPanel` draws the tray panel here. |
| `flyout` | `index.html?window=flyout` | The tray panel |
| `settings` | `index.html?window=settings&tab=<tab>` | Settings |

### Tray panel

The tray panel is the only dashboard layout. Tray left-click and a visible app launch open the `flyout` window. `shell/flyout_window.rs` owns it.

- Its square frame fits the usage rows and follows the app theme, including the Windows app theme under `auto`. The default width is 310 px. Each quota row shows its period, percentage, pace marker when available, and reset time.
- It paints `#DEDEE2` before the page loads, so it never flashes white.
- The panel opens next to the tray. App shortcuts that open a visible panel can anchor it at the cursor.
- It closes when it loses focus. Proof mode and `CODEXBAR_START_VISIBLE` keep it open.

The panel shows one card per provider. A card has metric rows for each usage window, with a bar, the reset time and, when the provider supports it, a pace line. [PROVIDERS.md](./PROVIDERS.md) lists the windows and pace support per provider.

The older PopOut layout on `main` is retired. `SurfaceMode::PopOut` remains only as a key in stored data.

### Settings

Settings is a separate window with a sidebar. `shell/settings_window.rs` owns it. The pane ids are `general`, `providers` and `about`. `surface_target.rs` in the shell and `TAB_META` in `apps/desktop-tauri/src/surfaces/settings/settingsTabs.ts` must list the same ids. An unknown id opens General. [CONFIGURATION.md](./CONFIGURATION.md) describes each pane.

## Data flow

### Provider refresh

1. `codexbar::core::instantiate_provider` in `rust/src/core/provider_factory.rs` builds each provider. It is the only provider factory.
2. `commands/providers.rs` in the shell calls `Provider::fetch_usage`. It runs at most 8 fetches at once.
3. Each fetch has a timeout: 75 seconds for Claude, Codex and Copilot, and 35 seconds for the others. LiteLLM gets 40 seconds when optional details are on. A longer web timeout in settings (plus 5 seconds) can raise the 35-second and 40-second timeouts, but never above 65 seconds. It doesn't change the 75-second timeout for Claude, Codex and Copilot.
4. Results go into `AppState.provider_cache`.
5. The shell sends `provider-updated` for each provider and `refresh-complete` at the end. The React hook `useProviders` listens and redraws.

`auto_refresh.rs` starts refreshes on a timer. The adaptive mode also checks for running coding agents (`coding_activity.rs`). Without a running agent process, a Codex rollout modified recently counts as coding activity: `coding_activity.rs` reads the modification times of today's and yesterday's `rollout-*.jsonl` files under the Codex sessions directory. It reads no file contents, caps the entries it inspects, and clamps future mtimes to the first value seen. The signal is skipped under Low Power Mode.

### Settings

1. The desktop shell's `Settings::load` reads `%APPDATA%\CodexBar\settings.json`. Other stores, such as `api_keys.json`, `manual_cookies.json` and `hooks.json`, sit in the same folder. `settings.json`, `api_keys.json` and `manual_cookies.json` are written through `secure_file`, which wraps them with DPAPI on Windows. `hooks.json` is plain JSON and always stays at its default path. The CLI's `CODEXBAR_CONFIG` variable moves the settings, API key, manual cookie and token account files, but not `hooks.json`. See [CONFIGURATION.md](./CONFIGURATION.md#files-and-where-they-live).
2. The frontend calls `updateSettings` with a patch.
3. The shell saves the file and sends `settings-changed`. In the page, the DOM event `codexbar:settings-updated` tells other parts of the UI to reload.

### Events

The shell sends these Tauri events (`events.rs`): `surface-mode-changed`, `provider-updated`, `refresh-started`, `refresh-complete`, `update-state-changed`, `locale-changed`, `settings-changed`, `codex-accounts-updated`, `login-phase`.

### Tray icon

- `tray_bridge.rs` owns the icon and `tray_menu.rs` builds the right-click menu.
- `tray_presentation.rs` decides what the icon shows. The pixels come from `codexbar::tray` in `rust/src/tray/render.rs`.
- The pace for the tint is scored on one window. A provider can name that window with `Provider::menu_bar_pace_lane()`. When it returns `None`, the app uses the window the icon draws for the selected metric.

### Pace

Pace compares how much of a window you have used with how much time of it has passed. `commands/bridge/pace.rs` scores it into seven stages, from `far_behind` to `far_ahead`.

Session and weekly windows get pace from their length and reset time. Providers that refill on a billing date opt in to reset-window pace: each declares a `PACE_CAPABILITY` in its own module, and `pace_capability()` in `provider_factory.rs` maps every `ProviderId` to it or to `ProviderPaceCapability::UNSUPPORTED`. The match is exhaustive, so a new provider must state its pace support to compile. [PROVIDERS.md](./PROVIDERS.md#pace) lists the rules.

### CLI

The source-built CLI uses the same provider factory and the same settings stores as the app. Use it for scripts without a UI, for example `usage`, `cost`, `guard` and `serve`. See [CLI.md](./CLI.md).

## Proof harness

`proof_harness.rs` reads `CODEXBAR_PROOF_MODE` and `CODEXBAR_SEED_USAGE_JSON` at startup. Proof mode opens one surface and keeps it open for automation. The seed fills the provider cache with synthetic data. See [WINDOWS_PROOF.md](./WINDOWS_PROOF.md).

## Platform notes

- Rust edition 2024. The CLI and the shell use Tokio.
- Windows-only parts: DPAPI cookie decryption, the dark DWM caption, tray icon promotion, start at login under `HKCU\...\Run`, and WebView2.
- Test tray, DPAPI and cookie behavior on Windows. WSL can't decrypt DPAPI data. See [WSL.md](./WSL.md).

## Related docs

- [README](../README.md#ビルドとリリース): build and release.
- [CLI.md](./CLI.md): the command-line tool.
- [CONFIGURATION.md](./CONFIGURATION.md): settings files and the Settings window.
- [PROVIDERS.md](./PROVIDERS.md): providers, sign-in sources, windows and pace.
- [COOKIES.md](./COOKIES.md): browser cookie import.
- [WINDOWS_PROOF.md](./WINDOWS_PROOF.md): proving UI changes.
- [AGENTS.md](../AGENTS.md): rules for agents and contributors.
