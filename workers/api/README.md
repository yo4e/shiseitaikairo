# Public Cabinet API (Workers + D1)

Cloudflare Workers + D1 で動く、公共標本箱APIの最小実装です。

## 事前準備

1. `wrangler.toml` の `database_id` を実際の D1 ID に置き換える。
2. 必要なら以下の運用パラメータを調整する。
   - `REPORT_THRESHOLD`（既定: `3`）
   - `SUBMIT_LIMIT_MAX`（既定: `6`）
   - `SUBMIT_LIMIT_WINDOW_SEC`（既定: `300`）
   - `SUBMISSION_LOG_RETENTION_DAYS`（既定: `30`）
   - `SPECIMEN_MAX_COUNT`（既定: `5000`）
   - `SPECIMEN_TRIM_BATCH`（既定: `80`）
   - `SPECIMEN_MIN_AGE_HOURS`（既定: `24`）

## ローカル実行

```bash
cd /Users/yo4e/GitHub/shiseitaikairo
npm install
npm run db:migrate:local
npm run api:dev
```

起動後: `http://127.0.0.1:8787`

## 主要エンドポイント

- `GET /api/health`
- `POST /api/specimens`
- `GET /api/specimens?sort=new|hot&cursor=...&biome=...&season=...`
- `GET /api/specimens/:specimen_id`
- `POST /api/specimens/:specimen_id/like`
- `POST /api/specimens/:specimen_id/report`

補足:
- `POST /api/specimens` は投稿レート制限を実施し、超過時は `429 rate_limited` を返します（`Retry-After` ヘッダ付き）。
- 投稿総数が `SPECIMEN_MAX_COUNT` を超えた場合、`likes` が少ない古い標本から自動間引きします。

## データ構造

- `workers/api/migrations/0001_init.sql`
  - `specimens`
  - `likes`
  - `reports`
- `workers/api/migrations/0002_submission_rate_limit.sql`
  - `submissions`（投稿レート制限用）

## デプロイ

```bash
npm run db:migrate:remote
npm run api:deploy
```
