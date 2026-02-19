# Fork Operations (webkaz/superset)

このドキュメントは `webkaz/superset` の fork 運用ルールを記録するためのものです。

## Purpose

- upstream (`superset-sh/superset`) を週次で取り込む
- Intel macOS 向けリリースを自動作成する
- fork で不要な Actions 実行を止める

## Active Workflows

- `.github/workflows/sync-upstream.yml`
  - 毎週月曜 `03:00 UTC` に実行
  - `upstream/main` を `origin/main` にマージ
  - 変更があれば push 後に `release-desktop-fork-x64.yml` を dispatch

- `.github/workflows/release-desktop-fork-x64.yml`
  - `workflow_dispatch` のみ
  - Intel ランナー (`macos-15-intel`) で x64 macOS zip を作成
  - GitHub Release を作成

## Disabled Workflows (fork では無効)

以下は `if: false` を設定し、実行されない。

- `.github/workflows/build-desktop.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/cleanup-preview.yml`
- `.github/workflows/deploy-preview.yml`
- `.github/workflows/deploy-production.yml`
- `.github/workflows/generate-changelog.yml`
- `.github/workflows/release-desktop-canary.yml`
- `.github/workflows/release-desktop.yml`
- `.github/workflows/update-docs.yml`

## Upstream Conflict Policy

`sync-upstream.yml` のマージで競合した場合:

1. 競合ファイルが **すべて `.github/workflows/` 配下**なら自動解決する
2. 解決方法は `--ours`（fork 側の workflow 定義を優先）
3. それ以外の競合が含まれる場合は workflow を失敗で停止する

## Performance Choices (release-desktop-fork-x64)

- `dmg` は作らず `zip` のみ生成（mise 配布用途）
- リリースタグ重複をビルド前に検査して早期失敗
- `concurrency` と `timeout-minutes` で無駄実行を抑制

## Manual Run Commands

ローカルからの手動実行:

```bash
gh workflow run sync-upstream.yml -R webkaz/superset
gh workflow run release-desktop-fork-x64.yml -R webkaz/superset -f set_latest=false
```

最新実行確認:

```bash
gh run list -R webkaz/superset --limit 10
```

## Release Naming and mise Update

- 自動リリースタグ形式:
  - `desktop-v<version>-x64-auto-<run_number>`
  - 例: `desktop-v0.0.78-x64-auto-1234`
- 手動リリース時は `release_tag` を明示指定してもよい

mise 更新手順:

```bash
mise ls-remote github:webkaz/superset | tail -n 20
mise install github:webkaz/superset@<tag>
mise use -g github:webkaz/superset@<tag>
```

`latest` を使う場合:

```bash
mise install github:webkaz/superset@latest
mise use -g github:webkaz/superset@latest
```

## Incident Playbook

### 1) Sync Upstream が失敗したとき

1. 最新 run を確認
   - `gh run list -R webkaz/superset --workflow sync-upstream.yml --limit 1`
2. 失敗ログを確認
   - `gh run view -R webkaz/superset <run_id> --log-failed`
3. よくある原因
   - workflow 以外のマージ競合（仕様どおり停止）
   - GitHub 側一時エラー/権限エラー
4. 競合時の復旧
   - ローカルで `upstream/main` を取り込み、手動解決して `main` に push
   - push 後に `sync-upstream.yml` を手動再実行して確認

### 2) Intel Release が失敗したとき

1. run を確認
   - `gh run list -R webkaz/superset --workflow release-desktop-fork-x64.yml --limit 1`
2. 失敗ログを確認
   - `gh run view -R webkaz/superset <run_id> --log-failed`
3. よくある原因
   - リリースタグ重複（早期失敗）
   - 依存解決や Electron build のタイムアウト
4. 復旧
   - 新しい `release_tag` を指定して `workflow_dispatch` で再実行

## Notes

- `sync-upstream.yml` は `gh workflow run` 実行時に `-R "${{ github.repository }}"` を明示している
  - fork ではなく upstream を参照して 404 になる事故を防ぐため
- fork の運用方針を変える場合は、まずこのファイルを更新する
