# Vendored tray-icon 0.21.3 (patched)

This is tray-icon 0.21.3 from crates.io, used through `[patch.crates-io]` in the
root `Cargo.toml`. Tauri 2 requires tray-icon 0.21.x and 0.21.3 is the newest
release, so the fix below cannot come from a version bump yet.

## Changes from the crates.io release

The Windows patches are in `src/platform_impl/windows/`:

1. Every `NOTIFYICONDATAW` passed to `Shell_NotifyIconW` sets
   `cbSize: size_of::<NOTIFYICONDATAW>()`. The release leaves `cbSize` zeroed,
   so Explorer treats the struct as the pre-Windows 2000 layout and shows only
   the first 64 UTF-16 units of the tooltip.
2. The tooltip copy stops at 127 units instead of 128, so `szTip` always keeps
   its terminating NUL.
3. RGBA tray icons are converted to bottom-up BGRA and a matching monochrome
   mask for CreateIcon. This keeps asymmetric icons, including stacked gauges,
   in the same orientation as the renderer output.

The upstream `dev` branch of tauri-apps/tray-icon already sets `cbSize` at these
call sites. Drop this vendored copy and the `[patch.crates-io]` entry once a
tray-icon release with all these fixes is usable by Tauri.

The common icon module also drops the pixel struct that the Windows converter
previously used.
