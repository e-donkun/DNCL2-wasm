# DNCL → WebAssembly コンソール 実装設計書

対象: DNCL_SPEC_SUMMARY.md の文法を実装するインタプリタを AssemblyScript で書き、
`asc` で WebAssembly にコンパイルし、単一の HTML ファイル（アーティファクト）上の
コンソールで実行する。

現在の進捗: `assembly/token.ts`（トークン種別定義）のみ作成済み。
以降の lexer / parser / interpreter / index はすべて未着手。

## 0. 全体アーキテクチャ

```
DNCLソースコード(string)
   │
   ▼  lexer.ts : tokenize()
Token[]
   │
   ▼  parser.ts : Parser クラス
Node[]  (AST, タグ付きユニオン表現)
   │
   ▼  interpreter.ts : Interpreter クラス
実行 ── hostPrint() / hostInput() / hostError() を呼びながら進行
```

ビルド成果物 `build/dncl.wasm` を base64 化して HTML に埋め込み、
`@assemblyscript/loader` の実行内容（の必要部分）を同じ HTML にインライン化して
文字列マーシャリングを行う。**HTML側は実行時に外部URLを一切フェッチしない**
（cdnjs等にも依存しない）方針にする。理由: claude.ai のアーティファクトのiframeは
外部ネットワークアクセスが制限されており、実行時fetchに依存すると壊れるリスクが高い。

## 1. トークン設計（lexer.ts）

### 1.1 カテゴリ走査によるトークン化（キモとなる設計判断）

DNCLは自然言語に近い記法で、キーワードは基本的に空白なしで連結される
（例: `を実行する` は日本語の連続する文字の並び）。これを利用し、
**「同じ文字カテゴリの最大連続runを1トークンにする」**という単純な規則だけで、
複雑な最長一致キーワード辞書なしに正しく分割できることを設計時に確認済み。

カテゴリは以下の4種類:
1. ASCII識別子文字列 `[A-Za-z_][A-Za-z0-9_]*` → `TT.IDENT`
2. 数字列 `[0-9]+(\.[0-9]+)?` → `TT.NUMBER`
3. 日本語文字（ひらがな・カタカナ・漢字・全角記号除く）の連続 → `TT.WORD`
   - キーワード判定はしない。パーサ側で文字列比較して意味付けする
   - 関数名（例: 独自定義の日本語関数名）もこのWORDトークンとして自然に1語になる
     （直後が`(`かどうかで「関数名」として解釈するのはパーサの仕事）
4. 記号1〜2文字 → 各種固定トークン（下記対応表）

この設計により「`kosu を 1 増やす`」は `IDENT(kosu) WORD(を) NUMBER(1) WORD(増やす)`
に、「`wa を表示する`」は `IDENT(wa) WORD(を表示する)` に、「`和を表示する(n)`」は
`WORD(和を表示する) LPAREN IDENT(n) RPAREN` に、それぞれ**自然に**分かれる。
根拠: 数字・ASCII識別子・記号が挟まる箇所でカテゴリが変わるため、
DNCLの語彙が偶然にも「区切りたい場所で必ずカテゴリが変わる」構造になっている。

⚠️ 実装時の注意: この前提が崩れるケース（日本語の関数名の中に別のキーワードと
完全一致する部分文字列があり、かつ直後カテゴリが変わらない場合）は理論上ゼロではない。
まずはこの単純設計で実装し、実際のテストケースで問題が出たら
「関数名は呼び出し直前の1トークンのみを対象にする」等の追加ルールで対応する。

### 1.2 記号対応表（全角/半角の両対応が必須）

| 意味 | 全角 | 半角フォールバック | TT |
|---|---|---|---|
| 代入 | ← (U+2190) | `<-` | ARROW |
| 加算 | ＋ | `+` | PLUS |
| 減算 | － | `-` | MINUS |
| 乗算 | × | `*` | MUL |
| 実数除算 | ／ | `/` | DIV |
| 整数商 | ÷ | 半角相当なし（`div`等は非対応でよい） | IDIV |
| 剰余 | ％ | `%` | MOD |
| 等しい | ＝ | `=` | EQ |
| 等しくない | ≠ | `!=` `<>` | NEQ |
| より大きい | ＞ | `>` | GT |
| 以上 | ≧ | `>=` | GE |
| より小さい | ＜ | `<` | LT |
| 以下 | ≦ | `<=` | LE |
| 丸括弧 | （） | `()` | LPAREN/RPAREN |
| 角括弧 | なし | `[]` | LBRACKET/RBRACKET |
| 波括弧 | なし | `{}` | LBRACE/RBRACE |
| 外部入力括弧 | 【】 | なし | LINPUT/RINPUT |
| 区切り | ， | `,` | COMMA |
| 文字列 | 「」 | `"..."` | STRING |

改行は `TT.NEWLINE` として1トークン発行（連続する空行は1つにまとめてよい）。
行番号を `Token.line` に必ず記録すること（エラーメッセージの質に直結する）。

### 1.3 コメント（原文にない拡張）

`#` から行末までをコメントとして無視する。ユーザ向けヘルプにその旨明記する。

## 2. AST設計（ast.ts）

クラス階層ではなく**タグ付きユニオン1クラス**で実装する
（AssemblyScriptでの実装コスト・パターンマッチの単純さを優先した判断）。

```ts
export const enum NK {
  NUM, STR, BOOL, VAR, INDEX, ARRLIT, INPUT,
  NEG, BINOP, CMP, AND, OR, NOT, CALL,
  ASSIGN, FILL_ALL, INCDEC, DISPLAY, EXPR_STMT,
  IF, WHILE_PRE, WHILE_POST, FOR, FUNCDEF
}

export class Node {
  kind: i32;
  num: f64 = 0;          // NUM値 / BOOL(0 or 1)
  str: string = "";      // 変数名・関数名・文字列値・演算子記号
  flag: bool = false;    // FOR: true=増やしながら/false=減らしながら
  a: Node | null = null; // 意味はkindごとに異なる（下記コメント参照）
  b: Node | null = null;
  c: Node | null = null;
  list: Node[] | null = null;
  line: i32 = 0;         // エラーメッセージ用
}
```

kindごとのフィールドの意味（実装時にコメントとして必ずNodeの生成箇所に残すこと）:
- `VAR`: str=変数名
- `INDEX`: str=配列名, list=添字式の配列
- `ARRLIT`: list=要素式の配列
- `BINOP`/`CMP`: str=演算子("+","-","*","/","div","mod","=","!=", ">", ">=","<","<="), a=左, b=右
- `NEG`/`NOT`: a=対象式
- `AND`/`OR`: a=左, b=右
- `CALL`: str=関数名, list=引数式
- `ASSIGN`: a=代入先(VAR or INDEX), b=値式
- `FILL_ALL`: str=配列名, a=値式
- `INCDEC`: a=対象(VAR想定), b=増減量式, flag=true→増やす/false→減らす
- `DISPLAY`: list=表示する式の並び
- `EXPR_STMT`: a=式（手続き呼び出しを文として使う場合）
- `IF`: a=条件, list=then節の文, b=else節（Node kind=IF が1個だけ入ったBLOCK的用途、
        またはelseの文列をそのままlist2的に…）
        → **実装簡略化のため else 節も `list` を持つ別Nodeとして c に格納する**
          （c: Node|null で、c.kind は常にダミーの「BLOCK」を導入するか、
          もしくは c 自体を「文のlistを持つNode」として扱う。実装時にBLOCK kindを
          追加しても良い。下記グラマーの疑似コードでは c を「elseのNode[]を包む何か」
          として扱っている点に注意し、実装時に具体化すること）
- `WHILE_PRE`/`WHILE_POST`: a=条件, list=本体文
- `FOR`: str=変数名, a=初期値式, b=終了値式, c=差分式, flag=方向, list=本体文
- `FUNCDEF`: str=関数名, list=本体文, さらにパラメータ名の配列が必要
        → Node には string[] フィールドがないため、
          パラメータ名は `list` の先頭に `VAR` ノードとして積む等の工夫が要る。
          **もっと素直な方法として、Node に `params: string[] | null = null;`
          フィールドを追加してしまうのが実装コスト的に安い。上記フィールド一覧は
          最小構成の出発点なので、実装時に素直に拡張してよい。**

上記の「c」や「FUNCDEF」の細部はこの設計書の時点では厳密に確定しきれていない。
実装時に一番書きやすい形（Nodeにフィールドを足す）で決め打ちして進めて構わない。
本質は「タグ付きユニオン1クラスで十分」という方針だけ守ればよい。

## 3. 値モデル（interpreter.ts 内 or value.ts）

```ts
export const enum VK { NUM, STR, BOOL, ARR, NIL }

export class Value {
  kind: i32;
  num: f64 = 0;
  str: string = "";
  arr: Value[] | null = null;
}
```

- 多次元配列は「配列の配列」として表現する（`Value.kind==ARR` の要素がさらに
  `Value.kind==ARR` を持つ）。`A[3, 2]` の評価は `A` を取得 → 3番目要素(ARR) →
  その2番目要素、という**多段インデックスに展開**して実装する。
- 表示用文字列化 `valueToDisplayString(v: Value): string`:
  - NUM: 整数値（`num == Math.floor(num)` かつ有限）ならゼロ埋めなしの整数表記、
    そうでなければ素直な10進表記（AssemblyScriptの `f64#toString()` が使えるか
    実装時に確認し、要件を満たさなければ自前フォーマッタを書く）
  - STR: そのまま
  - BOOL: 原文に真偽値の表示規則の明記なし。`真`/`偽` を出力する実装でよい
  - ARR: 用途上、配列そのものをdisplay文に渡すケースは稀。カンマ区切り等
    実装判断でよいが、まずは未対応でエラーにしてしまって構わない

## 4. パーサ設計（parser.ts）— 最重要パート

### 4.1 式の優先順位（上から強い順）

```
primary       : NUMBER | STRING | "(" logicalExpr ")" | "{" argList "}"
              | "【" "外部からの入力" "】"
              | "真" | "偽"
              | IDENT ( "[" indexList "]" )?  ( "(" argList ")" )?
              | WORD "(" argList ")"                // 日本語関数名の呼び出し
unary         : "-" unary | "+" unary | primary
term          : unary ( ("×"|"/"|"÷"|"％") unary )*
arith         : term ( ("+"|"-") term )*
comparison    : arith ( ("="|"≠"|">"|"≧"|"≦"|"<") arith )?   // 比較は非連鎖(1回のみ)
logicalExpr   : comparison ( ("かつ"|"または") comparison | "でない" )*
                // ↑ でない は右オペランドを取らない後置演算子。
                //   かつ/または/でない を出現順にそのまま acc に適用していく
                //   (詳細は DNCL_SPEC_SUMMARY.md の「論理演算子」参照)
exprList      : logicalExpr ( "と" logicalExpr )*   // 表示文・while条件検出の土台
```

`logicalExpr` の実装（疑似コード。設計時に導出済みで、原文の評価規則の
具体例と整合することを確認済み）:

```ts
function parseLogicalExpr(): Node {
  let acc = parseComparison();
  while (true) {
    if (isWord("でない")) { advance(); acc = mkNot(acc); continue; }
    if (isWord("かつ"))   { advance(); acc = mkAnd(acc, parseComparison()); continue; }
    if (isWord("または")) { advance(); acc = mkOr(acc, parseComparison()); continue; }
    break;
  }
  return acc;
}
```

### 4.2 文の判別（parseStatement）— ここが一番の難所

DNCLの文は先頭トークンだけでは種類が決まらないことが多い。
以下の**先読み方式**で対応する（実装時にほぼこのまま使える設計まで詰めてある）。

```
parseStatement():
  もし現在が WORD("もし")        → parseIfChain("もし")
  もし現在が WORD("繰り返し")    → parseWhilePost()
  もし現在が WORD("関数")        → parseFuncDef()
  もし現在が IDENT               → parseIdentLed()
  それ以外                        → parseExprLed()
```

`parseIdentLed()`（IDENTで始まる文の判別。1トークンの先読みで分岐できないので、
「`[...]`の後ろを覗き見る」ための括弧対応スキャンを使う）:

```
name = consume(IDENT)
if current == LBRACKET:
    close = findMatchingClose(currentPos, LBRACKET, RBRACKET)  // 深さカウントで対応する`]`を探す
    if token[close+1] == ARROW:
        # 配列要素への代入
        indices = parseIndexList()   # 実際に消費してパース
        expect(ARROW); value = parseLogicalExpr()
        return Assign(Index(name, indices), value)
    else:
        # 代入ではない → 読み出し式として exprLed に委譲（位置は戻さず、
        # name の直後、つまり LBRACKET の位置からそのまま parsePrimary 相当を
        # 再利用して式を組み立てる。実装が面倒なら「name の直前まで巻き戻して
        # parseExprLed() に丸投げ」でもよい。正しさ優先・簡潔さ優先はどちらでも可）
elif current == ARROW:
    advance(); value = parseLogicalExpr(); return Assign(Var(name), value)
elif isWord("のすべての要素に"):
    advance(); value = parseLogicalExpr(); expectWord("を代入する")
    return FillAll(name, value)
elif isWord("を"):
    advance(); e1 = parseArith()
    if isWord("増やす"): advance(); return IncDec(Var(name), e1, true)
    if isWord("減らす"): advance(); return IncDec(Var(name), e1, false)
    if isWord("から"):
        advance(); toE = parseArith(); expectWord("まで"); stepE = parseArith()
        dir = expectOneOfWord(["ずつ増やしながら","ずつ減らしながら"])
        body = parseBodyBlock(["を繰り返す"]); expectWord("を繰り返す")
        return For(name, e1, toE, stepE, dir=="ずつ増やしながら", body)
    error("予期しないトークン")
else:
    # name は単なる変数参照 or 関数呼び出しの一部 → 位置を name の直前まで戻して
    # parseExprLed() に処理を委譲する
    backtrackTo(nameStartPos); return parseExprLed()
```

`parseExprLed()`（display文 / while前判定 / 手続き呼び出し文の判別）:

```
list = parseExprList()   // logicalExpr の "と" 区切り列
if isWord("を表示する"): advance(); return Display(list)
if list.length == 1:
    if isWord("の間"):
        advance(); consumeOptionalComma()
        body = parseBodyBlock(["を繰り返す"]); expectWord("を繰り返す")
        return WhilePre(list[0], body)
    return ExprStmt(list[0])   // 例: 手続き呼び出し 二進で表示する(11)
error("「を表示する」または「の間」が見つかりません")
```

`parseIfChain(introWord)`（もし/そうでなくもし共通。else節は再帰でチェーン）:

```
consumeWord(introWord); cond = parseLogicalExpr(); expectWord("ならば")
thenStmts = parseBodyBlock(["を実行する", "を実行し"])
if isWord("を実行する"): advance(); return If(cond, thenStmts, null)
advance()  // "を実行し"
consumeOptionalComma()
if isWord("そうでなくもし"):
    elseNode = parseIfChain("そうでなくもし")
    return If(cond, thenStmts, [elseNode])
expectWord("そうでなければ")
elseStmts = parseBodyBlock(["を実行する"]); expectWord("を実行する")
return If(cond, thenStmts, elseStmts)
```

`parseBodyBlock(stopWords)`（単一行形式と複数行形式の両対応）:

```
if current == NEWLINE:
    skipNewlines()
    return parseStatementsUntilWord(stopWords)   // ループでstopWordsまで文を集める
else:
    stmts = [parseStatement()]
    while current == COMMA: advance(); stmts.push(parseStatement())
    return stmts   // 呼び出し側がこの直後にstopWordを期待して consume する
```

`parseStatementsUntilWord(stopWords)`:

```
stmts = []
loop:
  skipNewlines()
  if EOF: error("予期しない終端")
  if currentIsWordIn(stopWords): break   // 消費しない。呼び出し元がconsumeする
  stmts.push(parseStatement())
  while current == COMMA: advance(); stmts.push(parseStatement())
return stmts
```

`parseWhilePost()`（後判定。閉じ語が2トークンにまたがる点に注意）:

```
consumeWord("繰り返し"); consumeOptionalComma()
skipNewlines()
body = parseStatementsUntilLookahead(t => isWord(t,"を") && peekNext()==COMMA)
advance() // "を"
advance() // ","
cond = parseLogicalExpr(); expectWord("になるまで実行する")
return WhilePost(cond, body)
```

`parseFuncDef()`:

```
consumeWord("関数"); name = consumeIdentOrWord()
expect(LPAREN); params = parseParamList(); expect(RPAREN)
expectWord("を"); skipNewlines()
body = parseStatementsUntilWord(["と定義する"]); expectWord("と定義する")
return FuncDef(name, params, body)
```

### 4.3 括弧対応スキャン `findMatchingClose`

`(` `[` `{` のどれかの開始位置から、深さカウントで対応する閉じ括弧の位置を返す
汎用関数。型を厳密に対応させなくても（開き括弧なら何でも+1、閉じなら-1で
深さ0に達した位置を返す）実用上は十分。壊れた入力は後段の実パースで
別途エラーになる。

## 5. インタプリタ設計（interpreter.ts）

### 5.1 実行時エラーの扱い方（例外を使わない設計）

AssemblyScriptの例外機構に依存せず、**グローバルフラグ方式**で十分:

```ts
let hasError: bool = false;
let errorMessage: string = "";
function fail(msg: string, line: i32): void {
  if (!hasError) { hasError = true; errorMessage = msg + " (line " + line.toString() + ")"; }
}
```

すべての `exec*` / `eval*` 関数は、内部で子ノードを評価した直後に
`if (hasError) return ...;` のガードを入れて早期リターンする。
最終的に `runProgram()` の最後で `hasError` を見て `hostError(errorMessage)` を呼ぶ。

冗長だが確実で、AssemblyScriptの例外処理系のブラウザ互換性リスクを避けられる。

### 5.2 スコープモデル（関数呼び出し）

- グローバル変数表: `Map<string, Value>`
- 関数呼び出し毎に**新しいローカル変数表**を作る
- 変数の**代入**は常にローカル（関数内なら）優先で書き込む
- 変数の**読み出し**はローカルになければグローバルにフォールバックする
  （グローバル配列を関数内で参照する典型パターンを許容するための実用上の判断。
  原文に厳密な規定はないため、この方針を採用する）
- 再帰呼び出し対応のため呼び出しスタック（配列）で管理し、深さ上限
  （例: 500〜1000）を超えたら `fail("再帰が深すぎます", line)`

### 5.3 組み込み関数

`二乗` `べき乗` `乱数` `奇数` `二進で表示する` をデフォルトで登録し、
ユーザーが `関数 ... と定義する` で同名定義した場合は**上書き**を許可する。

`乱数(m, n)`: WASM側の擬似乱数が必要。AssemblyScriptに `Math.random()` 相当は
あるが決定的でない点に注意（テスト時はシード固定の自前PRNGを検討）。

### 5.4 ホストとのインターフェース（index.ts）

```ts
// import (JS側で実装する)
@external("env", "hostPrint")
declare function hostPrint(s: string): void;

@external("env", "hostHasInput")
declare function hostHasInput(): bool;

@external("env", "hostInput")
declare function hostInput(): string;

// export (JS側から呼ぶ)
export function runProgram(src: string): void { ... }
export function tokenizeDebug(src: string): string { ... } // トークン列をJSON文字列で返す（デバッグ/字句解析結果の可視化用）
```

`tokenizeDebug` は「字句解析」自体をユーザーに見せたいという当初の要望に
対応するためのもの。コンソールUIに「トークン一覧を表示」ボタンを用意し、
実行とは別にこの関数を呼んでトークン列を表形式で表示するとよい。

## 6. WASMビルドとHTML統合

1. `npm install` → `npx asc assembly/index.ts --target release`
2. `build/dncl.wasm` を base64 化（Node.jsで `fs.readFileSync` → `Buffer.toString('base64')`）
3. `node_modules/@assemblyscript/loader/dist/loader.js`（またはumd版）の内容を
   確認し、ブラウザで動く形（ESMではなくグローバル関数として使えるように）に
   整えて、生成するHTMLの `<script>` に**インラインで**埋め込む
   （実行時に外部URLをfetchしない、という制約を厳守するため）
4. HTML側のJS:
   - base64 → Uint8Array にデコード
   - loaderの `instantiate`/`instantiateSync` 相当の処理で `WebAssembly.instantiate`
   - `imports.env` に `hostPrint` / `hostHasInput` / `hostInput` を実装
     - `hostPrint`: コンソール領域にテキストを追記
     - 入力キュー: テキストエリアに1行1値で書かれた値を配列にして順番に払い出す
   - 「実行」ボタン押下で `exports.runProgram(sourceText)` を呼ぶ
     （文字列引数の受け渡しは loader の `__newString` 等のヘルパを使う）

## 7. コンソールUIに欲しい要素（当初要望を踏まえて）

- ソースコード入力欄（サンプルプログラムを初期値として入れておく）
- 「実行」ボタン、出力欄（クリアボタンも）
- 外部入力（【外部からの入力】用）のための入力キュー欄
- 「トークン一覧を表示」（字句解析結果を明示的に見せるためのタブ/パネル）
- できれば「AST/実行トレースを表示」も追加余地あり（優先度低）
- エラーメッセージは行番号付きでわかりやすく表示

## 8. 動作確認用のサンプルプログラム（実装後の受け入れテストに使う）

以下は原文の関数定義例を参考にした、自前で用意すべきテストケースの例
（実装が終わったら少なくともこの3パターンで動作確認すること）:

1. 1からnまでの和を表示する関数を定義して呼び出す
2. べき乗を求める関数（ループ版）を定義して呼び出す
3. 配列に対する順次繰返し文（合計・最大値探索など）
4. if / elif / else の分岐（単一行形式・複数行形式の両方）
5. 前判定・後判定それぞれのループ
6. 論理演算子の評価順（`A かつ B でない` のパターン）が
   DNCL_SPEC_SUMMARY.md の規則通りになっているかの単体テスト

## 9. 未着手タスクのチェックリスト

- [ ] `assembly/lexer.ts`
- [ ] `assembly/ast.ts`
- [ ] `assembly/parser.ts`
- [ ] `assembly/interpreter.ts`
- [ ] `assembly/index.ts`（エクスポート・ホストimport宣言）
- [ ] Node.jsでの単体テスト（`tests/`ディレクトリ、上記8節のケース）
- [ ] `asc` ビルド確認（debug/releaseとも）
- [ ] loaderのインライン化方法の確定
- [ ] 最終HTML（1ファイル、外部fetchなし）の組み立てとブラウザ動作確認
