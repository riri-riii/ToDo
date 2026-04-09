# ToDo (Frappe Gantt ベース)

このプロジェクトは `frappe-gantt` を使ったシンプルな ToDo / ガントチャート表示アプリです。

## 改善内容（今回）

- GitHub Pages 前提の運用から、Cloudflare Pages へデプロイできる構成を追加
- GitHub Actions で `main` ブランチ push 時に Cloudflare Pages へ自動デプロイ
- デプロイ時に必要な設定項目（Secrets / Variables）を README に明記

## ローカル確認

このリポジトリはビルド不要な静的サイト構成です。

```bash
python3 -m http.server 8080
```

起動後、`http://localhost:8080` にアクセスしてください。

## Cloudflare Pages での公開手順

### 1. Cloudflare 側で Pages プロジェクトを作成

- Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages**
- プロジェクト名（例: `todo-app`）を作成
- フレームワークプリセットは不要（静的サイト）

### 2. GitHub リポジトリに Secrets / Variables を設定

GitHub の `Settings > Secrets and variables > Actions` で以下を設定します。

#### Secrets

- `CLOUDFLARE_API_TOKEN`（Pages デプロイ権限付き）
- `CLOUDFLARE_ACCOUNT_ID`

#### Variables

- `CLOUDFLARE_PAGES_PROJECT`（Cloudflare Pages のプロジェクト名）

### 3. デプロイ

`main` ブランチへ push すると、自動で Cloudflare Pages にデプロイされます。

手動実行したい場合は GitHub Actions の `Deploy to Cloudflare Pages` を `workflow_dispatch` から実行できます。

---

This was created using frappe-gantt.

Copyright (c) 2024 Frappe Technologies Pvt. Ltd.
Licensed under the MIT License.
