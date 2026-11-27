# UsageBar

AI コーディングサービスの使用量を Windows のシステムトレイに表示する個人用アプリです。

## 構成

- [apps/desktop-tauri/](apps/desktop-tauri/) — Windows トレイと設定画面
- [rust/](rust/) — 使用量取得、CLI、更新処理、インストーラー設定
- [scripts/](scripts/) — ローカル開発と GitHub Releases への発行
- [docs/](docs/) — 設定、認証、CLI、WSL の運用メモ
- [vendor/](vendor/) — Windows トレイで使う依存ライブラリの修正版

## インストールと更新

1. [GitHub Releases](https://github.com/yumineko-game/usage-bar/releases/latest) から `UsageBar-<version>-Setup.exe` を取得して実行します。
2. 各 PC に [GitHub CLI](https://cli.github.com/) をインストールし、リポジトリへのアクセス権があるアカウントで `gh auth login --hostname github.com` を実行します。
3. トレイの設定から利用するプロバイダーを有効にします。アプリの更新は **設定 → UsageBar について → GitHub から更新** で行います。ダウンロードしたインストーラーは SHA-256 で検証されます。

旧版を使っている PC では、GitHub CLI ログインに対応した最初の版を Releases から手動でインストールします。

## ビルドとリリース

Windows に Node.js と pnpm を用意し、Git Bash で実行します。

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev.ps1
```

リリースする場合は Inno Setup と GitHub CLI も用意します。`scripts/version.env`、`rust/Cargo.toml`、`apps/desktop-tauri/src-tauri/Cargo.toml`、`apps/desktop-tauri/package.json`、`apps/desktop-tauri/src-tauri/tauri.conf.json` を同じ新バージョンにそろえ、`Cargo.lock` を更新してコミットします。リリースノートを用意して、書き込み権限のあるアカウントで次を実行します。

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/release-usagebar.ps1 -PublishUnsigned -NotesFile /path/to/release-notes.md
```

設定・認証、CLI、WSL の手順は [運用メモ](docs/USAGE.md) にまとめています。
