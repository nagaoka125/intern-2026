# CLAUDE.md

## プロジェクト概要
「視聴画面」を実装する Web アプリのテンプレートリポジトリ
動画視聴（HLS）+ リアルタイムコメント（SSE）+ アイテム送信機能を持つ配信視聴ページを実装する。

## 技術スタック
- 素の HTML / CSS / JavaScript（フレームワークなし、TypeScript なし、ビルドツールなし）
- 開発サーバーは Vite（`vite public`）— バンドル・ビルドは行わず静的配信のみに使用
- 動画再生に hls.js（CDN 読み込み）
- リアルタイム通信は `EventSource`(SSE)、送信は `fetch` による通常の HTTP POST

## ディレクトリ構成
- `public/` — 実装対象。ここ以外のファイル追加・変更は基本的に不要
  - `index.html`
  - `js/` — 機能ごとに分割したJavaScript（ES Modules。エントリーポイントは`main.js`で、各機能モジュールを`import`するだけ）
    - `main.js` — エントリーポイント
    - `theme.js` — テーマ（ダーク/ライト）の保存・適用
    - `video.js` — 動画再生（HLS）
    - `header-controls.js` — ヘッダーの表示切替スイッチ・設定メニュー
    - `selection.js` — 選択中アイテムの状態（アイテムパネルと送信欄で共有）
    - `points.js` — ポイントの保存・加算・消費
    - `item-stock.js` — アイテム所持数の保存・増減
    - `items.js` — アイテム一覧の取得・保持、コスト帯判定
    - `items-panel.js` — アイテムパネルのフィルタ・描画
    - `send-area.js` — コメント・アイテムの送信、連続送信防止
    - `comments.js` — コメント受信（SSE）・描画、視聴統計
    - `lottery.js` — アイテム抽選
  - `css/` — 機能ごとに分割したスタイルシート（`base.css`, `header.css`, `layout.css`, `comments.css`, `controls.css`, `items.css`, `send-area.css`, `lottery.css`, `responsive.css`）
- `docs/` — 講義資料（HLS・SSEの解説とハンズオン）およびADR（`docs/adr/`）。参考資料であり、アプリの実装コードではない
- `.claude/skills/` — 導入済みスキル（domain-modeling, grilling, grill-with-docs）

## 起動・確認
```sh
npm install
npm run start   # http://localhost:5173/
```
`public/` を変更したら、ブラウザをリロードすれば反映される（サーバー再起動不要）。

## 返答方法
必ず日本語で出力してください
専門用語が英語の場合は、一般的な日本語訳を括弧書きで併記してください

## テスト
実装を行う前にテストを行い、エラーが起こらなくなるまでコード編集=>テストを繰り返してください。

## 外部サービス（`public/js/` 内で定数として定義済み）
- `STREAM_URL`（`js/video.js`） — HLS 動画配信（Cloudflare Workers）
- `COMMENT_EVENTS_URL`（`js/comments.js`） — SSE コメント受信
- `COMMENT_MESSAGES_URL`（`js/send-area.js`） — コメント送信（POST）
- `ITEMS_URL`（`js/items.js`） — アイテム一覧取得（ポーリング）

これらは外部で提供されているエンドポイントのため、URL 自体を変更する場合は意図を確認すること。

## コーディング方針
- JavaScriptは `public/js/` 配下に機能ごとのES Modulesファイルとして分割する（構成は上記「ディレクトリ構成」を参照）。ファイルをまたいで共有する状態は `export`/`import` で明示し、暗黙のグローバル変数に頼らない
- `public/js/` 内の各ファイルでは、`export` する関数・変数の直前に「これは何か」がわかる一行コメントを日本語で付ける（JSDocのようなブロックコメントにはしない）
- コメントは「なぜそうしているか」が非自明な箇所にのみ日本語で簡潔に残す（例: 状態管理の理由、DOM操作の最適化理由）
- テストフレームワークは導入されていない。変更後は `npm run start` で実際にブラウザ動作を確認する
