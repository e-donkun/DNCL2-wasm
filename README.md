# DNCL → WebAssembly コンソール

大学入試センターの「共通テスト手順記述標準言語（DNCL）」を字句解析・構文解析し、
AssemblyScriptでWebAssemblyにコンパイルして、ブラウザのコンソール上で実行できる
ようにするプロジェクトです。

## 現在の状態

実装・テスト・ビルド・HTML統合まで完了しています。
**2022年11月改訂の新DNCL仕様（共通テスト用プログラム表記）に対応済み**で、
代入 `=` ・配列リテラル `[]` ・比較 `==` ・論理演算子 `and/or/not` ・べき乗 `**` ・
`表示する(...)` 関数呼び出し形式の表示文・コロン+インデントによるブロック構造を
サポートします。旧仕様（2022年1月版）の記法も競合しない範囲で後方互換として
引き続き使えます（詳細は `DNCL_SPEC_SUMMARY.md` 参照）。
原文に定義のない挙動（真偽判定・and/orの短絡評価・ゼロ除算・文字列の添字アクセス等）は
**Python3に準拠**させています。

- ✅ `DNCL_SPEC_SUMMARY.md` — 実装対象の文法を整理したリファレンス（新仕様ベース）
- ✅ `DESIGN.md` — 字句解析・構文解析・インタプリタ・WASM統合の設計（新仕様対応セクションあり）
- ✅ `assembly/token.ts` / `lexer.ts` / `ast.ts` / `parser.ts` / `interpreter.ts` / `index.ts`
- ✅ `tests/run.mjs` — Node.js単体テスト（新仕様のサンプルに加え、PDF記載の二分探索
  プログラムをそのまま検証、旧仕様の後方互換・Python準拠ケースも含め全21ケースがパス）
- ✅ `npx asc assembly/index.ts --target release` のビルド確認（debug/releaseとも）
- ✅ `dist/index.html` — 単一HTMLファイル（外部fetchなし、コンソールUI付き）。
  行番号ガター・インデントガイド付きエディタと、Pythonの`input()`のように
  出力欄にその場で入力欄を表示するインタラクティブな外部入力を実装。
  ソースコードを生Deflate圧縮+base64urlエンコードしてURLの`#`以降に埋め込む
  共有URL・QRコード生成機能も搭載（`vendor/qrcode-generator.js`を使用）。
  Playwright（ヘッドレスChromium）で実際に読み込み、サンプル実行・トークン一覧表示・
  インタラクティブ入力（乱数の決定性込み）・共有URL/QRコードの生成と復元・
  論理演算子の優先順位・エラー表示を確認済み

## セットアップ

```bash
npm install
```

## ビルド

```bash
npm run build:debug   # build/dncl.debug.wasm
npm run build         # build/dncl.wasm （最適化ビルド）
npm test              # tests/run.mjs でDESIGN.md 8節のサンプルなどを検証
npm run build:html    # build/dncl.wasm を埋め込んだ dist/index.html を生成
```

`dist/index.html` をブラウザで開くとDNCLプログラムをその場で実行できます
（外部URLへのfetchは一切行いません）。

## GitHub Pagesでの公開

`docs/index.html` をGitHub Pagesで公開しています。

初回のみ、リポジトリの **Settings → Pages → Build and deployment → Source** を
`Deploy from a branch` にし、ブランチを `main` / `docs` に設定してください
（この1回だけは手動操作が必要です）。設定後は
`https://e-donkun.github.io/DNCL-wasm/` で公開されます。

**更新時の注意**: `docs/index.html` は静的なコピーなので、`assembly/`やUIを変更したら
`npm run build && npm run build:html && cp dist/index.html docs/index.html` を実行し、
`docs/index.html` の差分もコミットしてください（自動デプロイではありません）。

`CONTINUE_PROMPT.md` に、Claude Codeへそのまま渡せる依頼文の例を用意しています。
