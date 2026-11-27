# UsageBar 運用メモ

## 設定と認証

トレイの **設定 → プロバイダー** で使うサービスを有効にし、画面に表示される方法で認証します。CLI を利用するサービスは、その CLI で先にログインします。API キーが必要な場合はプロバイダーの設定画面に入力します。

ブラウザー認証に対応するサービスでは、ブラウザーでログインしてから、設定のブラウザー Cookie 欄で取り込みます。自動で取得できない場合は、手動入力に対応するサービスなら、そのサイトの開発者ツールのネットワーク欄からリクエストヘッダーの `Cookie` の値をコピーし、設定に貼り付けます。セッションが切れたら再ログインして取り込み直します。

Windows の設定は通常 `%APPDATA%\CodexBar`、キャッシュは `%LOCALAPPDATA%\CodexBar` にあります。別 PC では、Windows のユーザーにひも付いて保護される認証情報を設定し直します。

## CLI

Windows ではリポジトリのルートから Git Bash で実行します。

```bash
cargo run --locked -p codexbar -- --help
cargo run --locked -p codexbar -- usage
cargo run --locked -p codexbar -- usage -p codex -f json
cargo run --locked -p codexbar -- config path
```

CLI とトレイアプリは同じ Windows の設定を使います。CLI を単体で使う場合は `cargo build --locked -p codexbar --release` でビルドし、通常は `target/release/codexbar.exe` に出力されます。

## WSL

WSL 内で Rust と利用するプロバイダーの CLI を用意し、プロバイダーには WSL 内からログインします。リポジトリのルートで上記の Cargo コマンドを使えます。

デスクトップ版を WSL で試す場合は、WSLg などのグラフィカル環境で `bash scripts/dev.sh` を実行します。Windows の DPAPI で暗号化されたブラウザー Cookie を WSL から取得できない場合は、CLI 認証か、対応するサービスでの手動 Cookie 入力を使います。
