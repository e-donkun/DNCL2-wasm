このプロジェクト（DNCL→WebAssemblyコンソール）の続きを実装してください。

- `README.md` で現状と進め方の概要を、`DNCL_SPEC_SUMMARY.md` で実装対象の文法を、
  `DESIGN.md` で字句解析・構文解析・インタプリタ・WASM/HTML統合の詳細設計
  （疑似コード付き）を、それぞれ確認してから着手してください。
- `assembly/token.ts` は作成済みです。DESIGN.mdのチェックリスト（9節）の順に、
  lexer.ts → ast.ts → parser.ts → interpreter.ts → index.ts を実装してください。
- 実装しながら `tests/` にNode.js用の単体テストを作り、DESIGN.md 8節のサンプル
  プログラム（1〜6）が正しく動くことを確認してください。特に論理演算子
  （かつ/または/でない）の左結合の評価順は、DNCL_SPEC_SUMMARY.mdに明記した
  規則通りになっているか重点的にテストしてください。
- 最終的に `npx asc assembly/index.ts --target release` でビルドが通り、
  ビルド成果物を単一のHTMLファイル（外部URLへのfetchなし、コンソールUI付き）に
  埋め込んで、ブラウザで実際にDNCLプログラムを実行できる状態にしてください。
- DESIGN.mdの中で「実装時に決め打ちしてよい」「実装時に確定する」と書かれている
  細部（Node構造体のフィールド追加など）は、素直に実装しやすい形で構いません。
  設計の根幹（トークンのカテゴリ走査方式、論理演算子の左結合評価、
  文の先読み判別ロジック）は変更せずに踏襲してください。
