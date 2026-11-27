# Configuration

Open Settings from the system tray. Changes save as you make them.

## Settings window

### General

- **Start at login** starts UsageBar when you sign in to Windows.
- **Start minimized** starts UsageBar in the system tray.
- **Keep tray icon visible** asks supported Windows versions to show the icon outside the overflow.

### Updates

The Updates pane shows the installed version. **Update from GitHub** checks for a newer stable release and installs it when a verified installer is available. If UsageBar cannot download an installer directly, the pane can open the release page.

### Provider list in the sidebar

Search for a provider by name, select it and use the **Enabled** switch to include it in the tray panel. The dot shows whether the latest usage refresh succeeded. You can also enable or disable a provider from its row menu.

### Providers

Each provider has a usage summary, refresh button and the connection fields it supports. Choose the appropriate source and sign in from Settings when offered. For other sources, enter the required API key or token, import cookies by selecting a browser, or sign in with the provider’s own CLI.

Use the tray panel to compare enabled providers, see reset times and check reset credit counts where available. The gauge shows the pace marker on supported windows. Hover over the gauge to see the estimate.

## Files and where they live

The app keeps its files in `%APPDATA%\CodexBar` (`dirs::config_dir()` plus `CodexBar`). Print the settings path with `codexbar config path`.

| File | Folder | DPAPI | Holds |
| --- | --- | --- | --- |
| `settings.json` | `%APPDATA%\CodexBar` | Yes | Everything in the Settings window |
| `api_keys.json` | `%APPDATA%\CodexBar` | Yes | API keys entered in the app |
| `manual_cookies.json` | `%APPDATA%\CodexBar` | Yes | Cookie headers pasted by hand |
| `token-accounts.json` | `%APPDATA%\CodexBar` | Yes | Token accounts |
| `claude-accounts\accounts.json` | `%APPDATA%\CodexBar` | Yes | Saved Claude Code logins |
| `grok-accounts\accounts.json` | `%APPDATA%\CodexBar` | Yes | Saved Grok logins |
| `codex-accounts\accounts.json` | `%APPDATA%\CodexBar` | Yes | Codex accounts |
| `codex-accounts\snapshots.json` | `%APPDATA%\CodexBar` | No | Codex account usage snapshots |
| `provider-account-usage-v1.json` | `%APPDATA%\CodexBar` | Yes | Last successful usage per Claude token account: rate windows and update time only, no credentials or identity |
| `claude-swap-usage-v1.json` | `%APPDATA%\CodexBar` | Yes | Last usage read per claude-swap or tcr pool account: pool slot, the account label Settings shows (the email, or the email with its organization name when two accounts share one), rate windows and update time; no tokens or organization IDs |
| `history\quota-burndown-v1.json` | `%APPDATA%\CodexBar` | Yes | Quota history |
| `claude\quota-reset-observations-v1.json`, `codex\quota-reset-observations-v1.json` | `%APPDATA%\CodexBar` | Yes | Observed reset times |
| `<provider>-cookie.json` | `%LOCALAPPDATA%\CodexBar` | Yes | Cached browser cookies |
| `codex-weekly-reset-v1.json` | `%LOCALAPPDATA%\CodexBar` | Yes | Codex weekly reset cache |

- Files marked DPAPI are written through `secure_file` in `rust/src/settings/`. On Windows it wraps them with DPAPI for the current user every time it saves.
- `settings.json` is always wrapped. The app still reads a plain JSON file you edited by hand, but the next save wraps it again. If the file exists but can't be read or parsed (for example DPAPI can't decrypt it), the app runs on the defaults but never overwrites the file: every save fails and logs a warning until the file loads again. Repair or move the file to save settings again. A missing file is a first run and saves normally.
- Browser cookies are read from the browser profiles when a refresh needs them. See [COOKIES.md](./COOKIES.md).
- `token-accounts.json` falls back to `~/.codexbar/` only when Windows reports no config folder.
- **Edit** on a saved token account (Settings > Providers > provider > Token accounts) changes its label and, optionally, its credential. The credential field starts empty and masked. Leave it blank to keep the saved credential; the saved secret is never sent back to the UI. Editing an account keeps the same account ID, timestamps and metadata, and never changes which account is active.
- Don't commit a real `settings.json` or key file to the repo.

## Claude Code accounts

Open **Settings > Providers > Claude > Claude Code accounts**.

- **Save current account** keeps the login the CLI uses now.
- **Add account** signs in to another Claude subscription in your browser. The current CLI login stays active. The native Claude Code executable must be installed.
- **Switch** makes a saved account the CLI login. Close running Claude Code CLI sessions first and reopen them after. The app saves the outgoing login, with its latest refresh token, before it switches.
- **Remove** forgets the saved copy. It doesn't log out an active CLI session.
- **Refresh login** and **Cancel sign-in** are also on this page.


Saved logins are in `%APPDATA%\CodexBar\claude-accounts\accounts.json`, protected with DPAPI.

- Sign-in runs with a temporary `CLAUDE_CONFIG_DIR`. The app removes that folder whether the sign-in succeeds, fails, is cancelled or times out.
- On Windows the sign-in process belongs to a job object, so it ends if Win-CodexBar exits. At startup the app also removes abandoned sign-in folders. It skips links and reparse points.
- Switching updates `claudeAiOauth` in the CLI credentials file and `oauthAccount` in the CLI configuration. Other settings and MCP secrets stay as they are.
- An absolute `CLAUDE_CONFIG_DIR` that Win-CodexBar inherits selects a custom CLI home.
- The feature uses the [Windows Claude Code credentials file](https://code.claude.com/docs/en/authentication), `.claude\.credentials.json`. It doesn't manage macOS Keychain logins or custom keyring setups.

These controls switch the **Claude Code CLI** only, not Claude Desktop or a browser session.

- Usage monitoring still follows the provider's source settings and **Allow reading Claude Code's credentials**.
- Remove API-key or OAuth-token environment overrides before you use saved subscription logins.
- With credential reading off, the active account is unknown and every saved account can be switched to.
- The list doesn't open ambient credential or identity files.
- Choosing the account that is already active does nothing.

## Grok accounts

Open **Settings > Providers > Grok > Grok accounts**.

- **Save current account** keeps the login in `~/.grok/auth.json`.
- **Add account** runs `grok login --oauth` in a separate `GROK_HOME`. Finish the sign-in in the browser profile of the second SuperGrok account. The current CLI login stays active until you choose **Switch**.
- **Switch** saves the outgoing login, then replaces it. Restart running Grok CLI sessions afterwards.
- **Remove** forgets the saved copy. It doesn't log out the active CLI session.
- **Sign in again** and **Cancel sign-in** are also on this page.


Saved logins are in `%APPDATA%\CodexBar\grok-accounts\accounts.json`, protected with DPAPI.

- Sign-in uses a temporary `GROK_HOME`, which the app removes however the sign-in ends.
- Switching replaces only `~/.grok/auth.json`, or `$GROK_HOME/auth.json` when that variable is set. Sessions, skills and other Grok files stay in place.
- The app unsets `XAI_API_KEY` and `GROK_OAUTH_TOKEN` for the sign-in, so the browser OAuth flow runs.

## Codex accounts

Open **Settings > Providers > Codex > Codex Accounts**. It has **Add account**, **Refresh login**, **Switch**, **Remove** and **Restart Codex Desktop**. Each account carries an **Ambient** or **Managed** badge. The accounts are in `%APPDATA%\CodexBar\codex-accounts\accounts.json`, protected with DPAPI.

## Antigravity CLI path

When neither the Antigravity desktop app nor a signed-in `agy` session is running, the Antigravity provider can use the `agy` CLI. Win-CodexBar looks for it in this order:

1. on `PATH`
2. `%LOCALAPPDATA%\agy\bin\agy.exe`
3. `%USERPROFILE%\.local\bin\agy.exe`

If `agy.exe` is somewhere else, set `ANTIGRAVITY_CLI_PATH` to its full path.

When `ANTIGRAVITY_CLI_PATH` is set, the app uses only that path.

- If the variable is empty or doesn't point to a file, the app skips the CLI source and names the variable in the provider error. It doesn't search `PATH` or the install folders. This keeps a background refresh from starting another `agy` that might ask you to sign in.
- A running desktop app still answers first, and offline conversation history still shows when it exists.
- Unset the variable to go back to automatic discovery.

Each `agy` process that Win-CodexBar starts (the version check, the usage report and the short-lived managed session) gets `AGY_CLI_DISABLE_AUTO_UPDATE=true`, even if your environment sets it to `false`. Passive refreshes then don't start agy's background updater. Your own `agy` sessions and agy's saved settings are not changed. agy ignores `1`, so the value must be lowercase `true`.

Other providers keep their own override rules.

## Related docs

- [Supported providers and pace](./PROVIDERS.md)
- [Browser cookie import](./COOKIES.md)
- [Build from source](../README.md#ビルドとリリース)
