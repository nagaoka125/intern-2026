---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Fetch the latest guidelines from the source URL below
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the fetched guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

Fetch fresh guidelines before each review:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use WebFetch to retrieve the latest rules. The fetched content contains all the rules and output format instructions.

## Usage

When a user provides a file or pattern argument:
1. Fetch guidelines from the source URL above
2. Read the specified files
3. Apply all rules from the fetched guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.

---

## 日本語版（Japanese）

### 概要

Web Interface Guidelines への準拠を UI コードでレビューする。「UIをレビューして」「アクセシビリティをチェックして」「デザインを監査して」「UXをレビューして」「ベストプラクティスに沿っているか確認して」と頼まれたときに使う。

### 動作の流れ

1. 下記の取得元 URL から最新のガイドラインを取得する
2. 指定されたファイルを読む（指定がなければユーザーにファイル・パターンを確認する）
3. 取得したガイドラインの全ルールと照合する
4. 指摘事項を `file:line` 形式で簡潔に出力する
5. 指摘事項の説明文は日本語で出力する（ガイドライン本文自体は英語のまま取得するが、レビュー結果として提示する際は日本語に訳して伝える）

### ガイドラインの取得元

レビューのたびに最新版を取得する（本文は英語）:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

WebFetch で最新のルールを取得する。取得内容にはルール本文と出力フォーマットの指示が含まれる。

### 使い方

ユーザーがファイルまたはパターンを指定した場合:
1. 上記 URL からガイドラインを取得する
2. 指定されたファイルを読む
3. 取得したガイドラインの全ルールを適用する
4. ガイドラインで指定された形式で、かつ日本語で指摘事項を出力する

ファイルが指定されていない場合は、レビュー対象のファイルをユーザーに確認する。
