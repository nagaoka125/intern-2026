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
  - `index.html`, `main.js`, `styles.css`
- `docs/` — 講義資料（HLS・SSEの解説とハンズオン）。参考資料であり、アプリの実装コードではない
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

## 外部サービス（`public/main.js` 内で定数として定義済み）
- `STREAM_URL` — HLS 動画配信（Cloudflare Workers）
- `COMMENT_EVENTS_URL` — SSE コメント受信
- `COMMENT_MESSAGES_URL` — コメント送信（POST）
- `ITEMS_URL` — アイテム一覧取得（ポーリング）

これらは外部で提供されているエンドポイントのため、URL 自体を変更する場合は意図を確認すること。

## コーディング方針
- 機能ごとに `DOMContentLoaded` イベント内で完結させる（動画再生／コメント受信／アイテム一覧／送信、の4ブロック構成）
- コメントは「なぜそうしているか」が非自明な箇所にのみ日本語で簡潔に残す（例: 状態管理の理由、DOM操作の最適化理由）
- テストフレームワークは導入されていない。変更後は `npm run start` で実際にブラウザ動作を確認する
