# X Poyo Softener

X(Twitter) のタイムライン上で表示される投稿本文の語尾を、やわらかい `ぽよ` 系の表現に差し替えて表示する Chrome 機能拡張です。

## 仕様

- `x.com` / `twitter.com` の表示テキストだけを変更します
- 投稿内容そのものや入力欄の内容は変更しません
- 対象は投稿本文 (`data-testid="tweetText"`) のみです
- 文末だけを変換し、URL やリンク化されたメンションなどは極力そのまま残します

## ファイル

- `manifest.json`: Chrome Extension Manifest V3
- `content.js`: X の本文を監視して語尾変換するスクリプト

## 使い方

1. Chrome で `chrome://extensions` を開く
2. 右上の「デベロッパー モード」を ON にする
3. 「パッケージ化されていない拡張機能を読み込む」を押す
4. このフォルダ `/Users/cromo/Documents/x-poyo-extension` を選ぶ
5. X を開くか再読み込みする

## 注意

- X 側の DOM 構造が変わると対象要素の検出が効かなくなることがあります
- 日本語の自然さは簡易ルールベースです。完全な言語変換ではありません
- すでに `ぽよ` 系で終わっている文は再変換しないようにしています
