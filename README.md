# 詩生態回路 (Shiseitaikairo)

ブラウザだけで動く「詩の人工生命」プロトタイプです。  
個体群が詩を生成し、診断スコアで淘汰され、交叉・突然変異で世代交代します。

言葉を資源にして、生存競争する詩の群れ。

## 何を実装しているか

### 詩方面

- 遺伝子にもとづく詩生成（行数、目標字数、断定度、余韻度、具体度、反復率、栄養混入率、免疫）。
- 栄養語＋語彙プールから行を生成し、最低1語の栄養語を混入。
- 助詞挿入（`の/に/へ/で/と`）と接続詞挿入（`ただ/そして`）を可変で挿入（パラメータ調整）。
- 末尾は句読点なしで、断定系/余韻系の語尾バリエーションを付与。
- 栄養語プリセット（庭園、仕事、宇宙、身体、港湾、儀式）。
- 毒語は初期値でランダム2語を自動投入（任意で固定入力も可能）。

### 人工生命方面

- 個体ID・親IDを持つ世代進化（選択、交叉、突然変異）。
- 健康診断スコアによる生存判定（代謝・構造・反復・毒語）。
- 季節環境（春夏秋冬）による代謝係数の変動。
- 資源枯渇/回復（使われすぎ語の一時弱体化、休眠語の回復ボーナス）。
- 可変個体数（世代ごとに生存状態から次世代個体数を調整）。
- エネルギー収支（獲得・消費・継承）とエネルギー枯渇死。
- 種分化ビュー（断定-余韻 × 具体度の散布図）。
- 世代勝者の標本箱、履歴保存、親子差分表示。

## 世界観対応表

- 栄養語: 資源
- 毒語: 汚染
- 断定 / 余韻: 性格軸（行動傾向）
- 健康診断スコア: 適応度
- 標本箱: 系統保存

## 実行方法

Astro 開発サーバーで起動します。

```bash
cd /Users/yo4e/GitHub/shiseitaikairo
npm install
npm run dev
```

ブラウザで `http://localhost:4321` を開きます。

- サイトトップ: `/`
- 公共標本箱: `/cabinet`
- 標本詳細: `/specimen/?id=<specimen_id>`
- 使い方: `/how-to`
- プライバシーポリシー: `/privacy-policy`
- 既存シミュレータ本体: `/app/index.html`

API込みで一発起動する場合は以下を使います。

```bash
cd /Users/yo4e/GitHub/shiseitaikairo
npm run dev:all
```

`dev:all` はローカルD1マイグレーション実行後に、`astro dev` と `wrangler dev` を同時起動します。

## API（Workers + D1）

公共標本箱向けの最小APIを `workers/api` に追加しています。

```bash
cd /Users/yo4e/GitHub/shiseitaikairo
npm run db:migrate:local
npm run api:dev
```

ローカルAPI: `http://127.0.0.1:8787`

- `GET /api/health`
- `POST /api/specimens`
- `GET /api/specimens`
- `GET /api/specimens/:specimen_id`
- `POST /api/specimens/:specimen_id/like`
- `POST /api/specimens/:specimen_id/report`

補足:
- `/cabinet` と `/specimen` は API優先で表示し、失敗時はモックにフォールバックします。
- Astro開発時は `astro.config.mjs` のプロキシで `/api` を `http://127.0.0.1:8787` へ転送します。
- `wrangler.toml` の `database_id` は実環境用のIDに置き換えてください。
- 投稿APIはレート制限付きです（超過時 `429 rate_limited` / `Retry-After`）。
- 投稿総数が上限（`SPECIMEN_MAX_COUNT`）を超えた場合、`likes` が少ない古い標本から自動間引きします。

## 保存と再現

- 実行履歴は IndexedDB に保存されます。
- 保存対象は実行設定（個体数、世代数、シード、栄養語、毒語、進化設定、詩設定、環境設定、生命設定）。
- 保存対象は各世代の全個体記録（詩、遺伝子、親ID、診断、環境、エネルギー）。
- 同じシード＋同じ設定なら、同じ進化系列を再現できます。

## 利用例

- 気に入った系統を「標本箱」から抜き取り、歌詞や創作の種として再利用できます。
- 同じシードで再実行すると、同じ詩の系譜に戻れます（観測の再現性）。

## 主要ファイル

- `src/layouts/BaseLayout.astro`: サイト共通レイアウトとSEOメタ。
- `src/pages/index.astro`: トップページ。
- `src/pages/how-to.astro`: 使い方ページ。
- `src/pages/privacy-policy.astro`: プライバシーポリシー。
- `src/pages/cabinet.astro`: 公共標本箱ページ（API優先 + モックfallback）。
- `src/pages/specimen/index.astro`: 標本詳細ページ（`?id=` 指定で表示）。
- `src/scripts/cabinet-client.ts`: 標本一覧のクライアント取得ロジック。
- `src/scripts/specimen-client.ts`: 標本詳細のクライアント取得ロジック。
- `workers/api/src/index.ts`: Workers API本体。
- `workers/api/migrations/0001_init.sql`: D1スキーマ定義。
- `public/app/index.html`: 既存シミュレータのエントリ。
- `public/app/styles.css`: シミュレータUIスタイル。
- `public/app/app.js`: シミュレータUI制御。
- `public/app/domain/evolution.js`: 世代シミュレーション、季節環境、資源循環、生命ダイナミクス。
- `public/app/domain/poem.js`: 詩生成ロジック。
- `public/app/domain/health.js`: 健康診断スコア。
- `public/app/storage/db.js`: IndexedDB 永続化。

## 現在の位置づけ

「弱い意味の人工生命」は十分満たしています。  
今後さらに強めるなら、個体間相互作用（引用/共生/競合）や、環境を個体が直接変えるループを増やすとより生態系らしくなります。
