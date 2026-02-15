公共標本箱 仕様書 v0.1（Codex渡し用）（案）
0. 概要

「詩生態回路」で生成された“個体（詩＋遺伝子＋診断）”を、公共の標本箱に投稿・閲覧・共有できる機能を追加する。
掲示板的な新着一覧と、標本単体ページ（共有URL）を提供する。

1. ゴール

ユーザーが「公共標本箱へ送る」で個体を投稿できる

公共標本箱で新着/人気/タグ別に閲覧できる

標本単体URLをコピー/共有できる

投稿者の“名前入力”は不要（荒れ要因を減らす）

投稿者の同一性は「採取者キー → 採取者ID（ゆるトリップ）」で任意に出せる

2. 非ゴール（v0.1ではやらない）

ログイン/アカウント

完全な本人性（採取者キーは知っていれば誰でも再現できる設計）

画像添付、コメントスレ、検索（あとから）

3. 用語

個体（Individual）：詩本文＋遺伝子パラメータ＋診断スコア＋環境情報＋親IDなど

標本（Specimen）：公共標本箱へ投稿された個体のスナップショット

採取者キー（Collector Key）：任意入力の文字列。これから採取者IDを生成する

採取者ID（Collector ID）：表示用の匿名ID（例：C-7F3A2K9M9Q2D）

標本ID（Specimen ID）：公開URL用の短いID（例：S-20260215-0Q3D7K）

4. 採取者ID生成（ゆるトリップ）
UI/仕様

入力欄：採取者キー（任意）

入力すると 採取者ID を即時表示

注意書き：

「短い/単純なキーの場合、IDが被る可能性があります」

「被りを避けたい場合は、長めのフレーズ（例：3〜7語）推奨」

アルゴリズム（簡易でOK）

collector_id = "C-" + base64url( sha256("shiseitaikairo|collector|" + normalize(key)) ).slice(0, 12)

normalizeは trim + NFKC

※暗号強度目的ではなく“同一性ラベル”目的。衝突確率はキー運用で回避する（長め推奨）。

5. 画面（UI）要件
5.1 公共標本箱トップ /cabinet

タブ/フィルタ

新着（default）

人気（いいね順）

バイオーム（庭園/儀式…）フィルタ

季節（春夏秋冬）フィルタ

各カード表示

詩（先頭N行 or 折りたたみ）

バイオーム / 季節

採取者ID

スコア（総合/内訳は詳細へ）

いいね数

「詳細」「共有」「コピー」

5.2 標本詳細 /specimen/:specimen_id

全文表示

メタ情報（採取者ID、作成日時、スコア、遺伝子サマリ、バイオーム、季節、親IDがあれば）

ボタン

共有（Web Share API対応端末ならOS共有、なければURLコピー）

いいね

通報

5.3 投稿導線（アプリ側）

勝者カード/個体詳細に 公共標本箱へ送る

送信後：

成功トースト＋標本URL表示＋「共有」ボタン

6. API（Cloudflare Workers想定）

ベースURL例：/api/*（同一オリジンでPagesから叩く）

返却：JSON

CORS：同一オリジン前提（外部公開APIにしない）

6.1 POST /api/specimens

目的：標本の投稿

Request JSON（MVP）

{
  "collector_id": "C-7F3A2K9M9Q2D",
  "collector_key_used": true,
  "poem_text": "……",
  "biome": "ritual",
  "season": "winter",
  "score_total": 0.8123,
  "score_breakdown": { "metabolism": 0.2, "structure": 0.3, "repeat": 0.1, "tox": 0.2123 },
  "genome": {
    "lines": 6,
    "target_len": 48,
    "assertiveness": 0.4,
    "afterglow": 0.6,
    "concreteness": 0.5,
    "repeat_rate": 0.3,
    "nutrition_mix": 0.2,
    "immune": 0.7
  },
  "parent_ids": ["...optional..."],
  "run_hash": "optional"
}


Response

{
  "ok": true,
  "specimen_id": "S-20260215-0Q3D7K",
  "url": "/specimen/S-20260215-0Q3D7K"
}


サーバ側バリデーション

poem_text：1〜1500文字（MVPはこれで十分）

biome/season：許可リスト

連投制限（後述）

NGワード（後述、雑でOK）

6.2 GET /api/specimens?sort=new|hot&cursor=...&biome=...&season=...

目的：一覧取得（ページング）

Response

{
  "ok": true,
  "items": [
    {
      "specimen_id": "S-20260215-0Q3D7K",
      "poem_preview": "先頭N文字…",
      "collector_id": "C-...",
      "biome": "ritual",
      "season": "winter",
      "score_total": 0.8123,
      "likes": 12,
      "created_at": "2026-02-15T07:55:00Z"
    }
  ],
  "next_cursor": "..."
}

6.3 GET /api/specimens/:specimen_id

目的：詳細取得

6.4 POST /api/specimens/:specimen_id/like

目的：いいね（スパム対策あり）

MVP：IP + UAなどで簡易重複抑止（または1日1回まで）

後で強化：Rate Limiting / Turnstile

6.5 POST /api/specimens/:specimen_id/report

目的：通報

理由は任意（固定選択でも自由入力でも）

一定数で自動非表示フラグ（is_hidden = true）

7. データストア（D1 / SQLite想定）

D1はWorkersのネイティブSQL DBとして使える。

7.1 specimens

id TEXT PRIMARY KEY（内部UUIDなど）

specimen_id TEXT UNIQUE（公開用：S-YYYYMMDD-XXXXXX）

collector_id TEXT

poem_text TEXT

poem_preview TEXT

biome TEXT

season TEXT

score_total REAL

score_breakdown_json TEXT

genome_json TEXT

parent_ids_json TEXT

run_hash TEXT

likes INTEGER DEFAULT 0

reports INTEGER DEFAULT 0

is_hidden INTEGER DEFAULT 0

created_at TEXT（ISO）

Index

(created_at DESC)

(likes DESC)

(biome, created_at DESC)

(season, created_at DESC)

(is_hidden)

7.2 likes（任意だが後々効く）

specimen_id TEXT

fingerprint_hash TEXT（IP/UA/日付などをハッシュ）

created_at TEXT

UNIQUE(specimen_id, fingerprint_hash)

7.3 reports

specimen_id TEXT

fingerprint_hash TEXT

reason TEXT

created_at TEXT

UNIQUE(specimen_id, fingerprint_hash)

8. スパム/荒らし対策（MVPで最低限）
8.1 レート制限

CloudflareにはWorkersから使えるRate Limiting APIがある（bindingでlimitできる）。
また、エッジでのRate Limiting製品としても提供されている。

MVP推奨ルール例

投稿：1分に1回/同一IP（+ 同一collector_idでも制限）

いいね：1分に5回/同一IP

通報：10分に3回/同一IP

8.2 Turnstile（必要になったら追加）

投稿時にTurnstileトークンを付け、Workers側でsiteverifyする。クライアントだけでは防御にならず、サーバ側検証が必須。
（最初はOFFでもいいが、公開後に荒れたら即ONできるように設計余地を残す）

8.3 NGワード（雑でOK）

poem_text に対して単純な禁止語リスト

該当したら拒否 or 伏字（MVPは拒否でOK）

8.4 非表示フロー

reports >= threshold で is_hidden = 1

管理者用の解除はv0.2以降

9. 共有（SNS）
9.1 URL共有

標本詳細URLをコピー or Web Share APIで共有

navigator.share / navigator.canShare で分岐（ファイル共有は将来のPNGカードで）。

9.2 共有用テキスト（例）

詩生態回路｜公共標本箱 #shiseitaikairo

1行目に詩の冒頭1行、2行目にURL など

10. 実装の段取り（Codexへの作業指示に向く形）

D1スキーマ作成（specimens + likes + reports）

Workers API実装（POST/GET/like/report）

Pages側UI：/cabinet と /specimen/:id

アプリ側ボタン：公共標本箱へ送る（POST呼び出し）

共有：URLコピー＋モバイルならshare

レート制限（まずは簡易IP制限→必要ならWorkers Rate Limiting bindingへ）

このままCodexに渡すなら、最後に「MVPではTurnstileは未導入、荒れたらON」って一文だけ添えると実装が迷いにくい。Turnstileはサーバ側検証必須、って釘だけは先に打っておくと後で安全。