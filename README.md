# DNCL → WebAssembly コンソール

大学入試センターの「共通テスト手順記述標準言語（DNCL）」を字句解析・構文解析し、
AssemblyScriptでWebAssemblyにコンパイルして、ブラウザのコンソール上で実行できる
ようにするプロジェクトです。

## 現在の状態

設計フェーズはほぼ完了、実装は着手直後（`assembly/token.ts` のみ）です。

- ✅ `DNCL_SPEC_SUMMARY.md` — 実装対象の文法を整理したリファレンス
- ✅ `DESIGN.md` — 字句解析・構文解析・インタプリタ・WASM統合の設計（かなり詳細）
- ✅ `assembly/token.ts` — トークン種別の定義
- ⬜ lexer / parser / interpreter / index — 未実装（DESIGN.mdの疑似コードを元に実装する）
- ⬜ ビルド・動作確認・HTML統合 — 未着手

## セットアップ

```bash
npm install
```

## ビルド（実装が進んだら）

```bash
npm run build:debug   # build/dncl.debug.wasm
npm run build         # build/dncl.wasm （最適化ビルド）
```

## 続きの進め方

1. `DESIGN.md` を読み、章立て通りに `assembly/lexer.ts` → `assembly/ast.ts` →
   `assembly/parser.ts` → `assembly/interpreter.ts` → `assembly/index.ts` の順で実装する
2. `tests/` を作り、Node.js上で `@assemblyscript/loader` 経由でwasmを読み込んで
   DESIGN.md 8節のサンプルプログラムが正しく動くか確認する
3. 最後にビルド成果物をbase64化し、外部fetchなしの単一HTML（コンソールUI）に
   インライン埋め込みする（DESIGN.md 6〜7節）

`CONTINUE_PROMPT.md` に、Claude Codeへそのまま渡せる依頼文の例を用意しています。
