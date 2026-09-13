# DNCL → WebAssembly コンソール

大学入試センターの「共通テスト手順記述標準言語（DNCL）」を字句解析・構文解析し、
AssemblyScriptでWebAssemblyにコンパイルして、ブラウザのコンソール上で実行できる
ようにするプロジェクトです。

## 現在の状態

実装・テスト・ビルド・HTML統合まで完了しています。

- ✅ `DNCL_SPEC_SUMMARY.md` — 実装対象の文法を整理したリファレンス
- ✅ `DESIGN.md` — 字句解析・構文解析・インタプリタ・WASM統合の設計（かなり詳細）
- ✅ `assembly/token.ts` / `lexer.ts` / `ast.ts` / `parser.ts` / `interpreter.ts` / `index.ts`
- ✅ `tests/run.mjs` — Node.js単体テスト（DESIGN.md 8節のサンプル1〜6を含む11ケース、全パス）
- ✅ `npx asc assembly/index.ts --target release` のビルド確認（debug/releaseとも）
- ✅ `dist/index.html` — 単一HTMLファイル（外部fetchなし、コンソールUI付き）。
  Playwright（ヘッドレスChromium）で実際に読み込み、サンプル実行・トークン一覧表示・
  外部入力・論理演算子の左結合・エラー表示を確認済み

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

`CONTINUE_PROMPT.md` に、Claude Codeへそのまま渡せる依頼文の例を用意しています。
