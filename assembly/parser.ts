// 構文解析
//
// 2022年11月改訂の「共通テスト用プログラム表記」（新DNCL）と、それ以前の記法（旧DNCL）
// の両方を受け付ける。新旧で表記が競合する部分（代入演算子、配列リテラルの括弧、
// 比較演算子の等号、論理演算子など）は新仕様を優先し、競合しない部分（関数定義、
// 後判定ループ、増減の糖衣構文）は旧仕様も引き続きサポートする。
import { Token, TT } from "./token";
import {
  Node,
  mkNum,
  mkStr,
  mkBool,
  mkVar,
  mkIndex,
  mkArrLit,
  mkInput,
  mkNeg,
  mkBinop,
  mkCmp,
  mkAnd,
  mkOr,
  mkNot,
  mkCall,
  mkAssign,
  mkFillAll,
  mkIncDec,
  mkExprStmt,
  mkIf,
  mkWhilePre,
  mkWhilePost,
  mkFor,
  mkFuncDef
} from "./ast";
import { fail, hasError } from "./errors";

export class Parser {
  tokens: Token[];
  pos: i32 = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  // ---- トークン走査ヘルパ ----
  cur(): Token {
    return this.tokens[this.pos];
  }

  curType(): i32 {
    return this.tokens[this.pos].type;
  }

  peekAt(offset: i32): Token {
    const p = this.pos + offset;
    if (p < 0 || p >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[p];
  }

  advance(): Token {
    const t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }

  isType(t: i32): bool {
    return this.curType() == t;
  }

  isWord(w: string): bool {
    return this.curType() == TT.WORD && this.cur().text == w;
  }

  isWordOneOf(ws: string[]): bool {
    if (this.curType() != TT.WORD) return false;
    const text = this.cur().text;
    for (let i = 0; i < ws.length; i++) {
      if (ws[i] == text) return true;
    }
    return false;
  }

  // and/or/not はASCII英字のみなのでIDENTトークンとしてレキシングされる
  isIdent(w: string): bool {
    return this.curType() == TT.IDENT && this.cur().text == w;
  }

  expectType(t: i32, what: string): Token {
    if (!this.isType(t)) {
      fail("構文エラー: 「" + what + "」が必要です", this.cur().line);
      return this.cur();
    }
    return this.advance();
  }

  expectWord(w: string): void {
    if (!this.isWord(w)) {
      fail("構文エラー: 「" + w + "」が必要です", this.cur().line);
      return;
    }
    this.advance();
  }

  consumeOptionalComma(): void {
    if (this.isType(TT.COMMA)) this.advance();
  }

  // 旧仕様の行指向パース中に紛れ込みうるINDENT/DEDENTは読み飛ばす
  // （旧仕様は閉じ語で構造を決めるため、インデントの有無自体は意味を持たない）
  skipNewlines(): void {
    while (this.isType(TT.NEWLINE) || this.isType(TT.INDENT) || this.isType(TT.DEDENT)) this.advance();
  }

  consumeIdentOrWord(): string {
    if (this.isType(TT.IDENT) || this.isType(TT.WORD)) {
      return this.advance().text;
    }
    fail("関数名が必要です", this.cur().line);
    return "";
  }

  // openPosから対応する閉じトークンの絶対位置を探す（深さカウント方式）
  findMatchingClose(openPos: i32, openType: i32, closeType: i32): i32 {
    let depth = 0;
    let i = openPos;
    const n = this.tokens.length;
    while (i < n) {
      const t = this.tokens[i].type;
      if (t == openType) {
        depth++;
      } else if (t == closeType) {
        depth--;
        if (depth == 0) return i;
      } else if (t == TT.EOF) {
        return -1;
      }
      i++;
    }
    return -1;
  }

  // ---- プログラム全体（最上位はインデント0） ----
  //
  // 文の直後に必ずNEWLINEが残っているとは限らない点に注意: もし/for/whileの
  // 新仕様（コロン+インデント）はブロック本体側(parseBlockBody)が末尾の改行と
  // DEDENTを既に消費し終えているため、戻ってきた時点で次の文の先頭トークンに
  // 直接位置していることがある。そのため改行の有無を厳密には要求せず、
  // 残っていれば読み飛ばすだけにする（真に壊れた入力は次のparseStatement内で
  // エラーになる）。
  parseProgram(): Node[] {
    while (this.isType(TT.NEWLINE)) this.advance();
    const stmts: Node[] = [];
    while (!this.isType(TT.EOF) && !hasError) {
      stmts.push(this.parseStatement());
      if (hasError) break;
      while (this.isType(TT.COMMA)) {
        this.advance();
        stmts.push(this.parseStatement());
        if (hasError) break;
      }
      while (this.isType(TT.NEWLINE)) this.advance();
    }
    return stmts;
  }

  // 新仕様: "見出し行 ':'" の直後に呼び、NEWLINE→INDENT→文の並び→DEDENT を消費する
  parseBlockBody(): Node[] {
    this.expectType(TT.NEWLINE, "改行");
    this.expectType(TT.INDENT, "インデント（ブロックの開始）");
    const stmts: Node[] = [];
    while (!this.isType(TT.DEDENT) && !this.isType(TT.EOF) && !hasError) {
      stmts.push(this.parseStatement());
      if (hasError) break;
      while (this.isType(TT.COMMA)) {
        this.advance();
        stmts.push(this.parseStatement());
        if (hasError) break;
      }
      while (this.isType(TT.NEWLINE)) this.advance();
    }
    this.expectType(TT.DEDENT, "インデント解除（ブロックの終了）");
    return stmts;
  }

  // ---- 式（優先順位: primary < power < unary < term < arith < comparison < not < and < or）----
  parsePrimary(): Node {
    const line = this.cur().line;
    if (hasError) return mkNum(0, line);

    if (this.isType(TT.NUMBER)) {
      const t = this.advance();
      return mkNum(t.num, line);
    }
    if (this.isType(TT.STRING)) {
      const t = this.advance();
      return mkStr(t.text, line);
    }
    if (this.isType(TT.LPAREN)) {
      this.advance();
      const e = this.parseOr();
      this.expectType(TT.RPAREN, ")");
      return e;
    }
    if (this.isType(TT.LBRACKET)) {
      // 新仕様: 配列リテラル [e1, e2, ...]
      this.advance();
      const elems = this.parseArgList();
      this.expectType(TT.RBRACKET, "]");
      return mkArrLit(elems, line);
    }
    if (this.isType(TT.LBRACE)) {
      // 旧仕様: 配列リテラル {e1, e2, ...}
      this.advance();
      const elems = this.parseArgList();
      this.expectType(TT.RBRACE, "}");
      return mkArrLit(elems, line);
    }
    if (this.isType(TT.LINPUT)) {
      this.advance();
      let prompt = "";
      if (this.isType(TT.WORD)) prompt = this.advance().text; // 例:「外部からの入力」
      this.expectType(TT.RINPUT, "】");
      return mkInput(prompt, line);
    }
    if (this.isWord("真")) {
      this.advance();
      return mkBool(true, line);
    }
    if (this.isWord("偽")) {
      this.advance();
      return mkBool(false, line);
    }
    if (this.isType(TT.IDENT)) {
      const name = this.advance().text;
      let node: Node = mkVar(name, line);
      if (this.isType(TT.LBRACKET)) {
        this.advance();
        const idx = this.parseIndexList();
        this.expectType(TT.RBRACKET, "]");
        node = mkIndex(name, idx, line);
      }
      if (this.isType(TT.LPAREN)) {
        this.advance();
        const args = this.parseArgList();
        this.expectType(TT.RPAREN, ")");
        node = mkCall(name, args, line);
      }
      return node;
    }
    if (this.isType(TT.WORD) && this.peekAt(1).type == TT.LPAREN) {
      const name = this.advance().text;
      this.advance(); // (
      const args = this.parseArgList();
      this.expectType(TT.RPAREN, ")");
      return mkCall(name, args, line);
    }

    fail("式の構文エラー", line);
    this.advance();
    return mkNum(0, line);
  }

  parseArgList(): Node[] {
    const args: Node[] = [];
    if (this.isType(TT.RPAREN) || this.isType(TT.RBRACE) || this.isType(TT.RBRACKET)) return args;
    args.push(this.parseOr());
    while (this.isType(TT.COMMA)) {
      this.advance();
      args.push(this.parseOr());
    }
    return args;
  }

  parseIndexList(): Node[] {
    const idx: Node[] = [];
    idx.push(this.parseOr());
    while (this.isType(TT.COMMA)) {
      this.advance();
      idx.push(this.parseOr());
    }
    return idx;
  }

  // べき乗 "**" は単項マイナスより強く、右結合（2**-1 のように右側に単項マイナスを許す）
  parsePower(): Node {
    const line = this.cur().line;
    const base = this.parsePrimary();
    if (this.isType(TT.POW)) {
      this.advance();
      const exponent = this.parseUnary();
      return mkBinop("**", base, exponent, line);
    }
    return base;
  }

  parseUnary(): Node {
    const line = this.cur().line;
    if (this.isType(TT.MINUS)) {
      this.advance();
      return mkNeg(this.parseUnary(), line);
    }
    if (this.isType(TT.PLUS)) {
      this.advance();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  parseTerm(): Node {
    let acc = this.parseUnary();
    while (true) {
      const line = this.cur().line;
      if (this.isType(TT.MUL)) {
        this.advance();
        acc = mkBinop("*", acc, this.parseUnary(), line);
        continue;
      }
      if (this.isType(TT.DIV)) {
        this.advance();
        acc = mkBinop("/", acc, this.parseUnary(), line);
        continue;
      }
      if (this.isType(TT.IDIV)) {
        this.advance();
        acc = mkBinop("div", acc, this.parseUnary(), line);
        continue;
      }
      if (this.isType(TT.MOD)) {
        this.advance();
        acc = mkBinop("mod", acc, this.parseUnary(), line);
        continue;
      }
      break;
    }
    return acc;
  }

  parseArith(): Node {
    let acc = this.parseTerm();
    while (true) {
      const line = this.cur().line;
      if (this.isType(TT.PLUS)) {
        this.advance();
        acc = mkBinop("+", acc, this.parseTerm(), line);
        continue;
      }
      if (this.isType(TT.MINUS)) {
        this.advance();
        acc = mkBinop("-", acc, this.parseTerm(), line);
        continue;
      }
      break;
    }
    return acc;
  }

  parseComparison(): Node {
    const left = this.parseArith();
    const line = this.cur().line;
    let op = "";
    if (this.isType(TT.EQ)) op = "==";
    else if (this.isType(TT.NEQ)) op = "!=";
    else if (this.isType(TT.GT)) op = ">";
    else if (this.isType(TT.GE)) op = ">=";
    else if (this.isType(TT.LT)) op = "<";
    else if (this.isType(TT.LE)) op = "<=";
    if (op != "") {
      this.advance();
      const right = this.parseArith();
      return mkCmp(op, left, right, line);
    }
    return left;
  }

  // 新仕様の論理演算子 not/and/or は一般的なプログラミング言語と同じ優先順位
  // （not > and > or）で実装する（PDFに明記はないが、Python3との対比表が
  // 用意されるなど強くPython準拠を意識した表記であるため、この解釈を採用した）。
  parseNot(): Node {
    const line = this.cur().line;
    if (this.isIdent("not")) {
      this.advance();
      return mkNot(this.parseNot(), line);
    }
    return this.parseComparison();
  }

  parseAnd(): Node {
    let acc = this.parseNot();
    while (this.isIdent("and")) {
      const line = this.cur().line;
      this.advance();
      acc = mkAnd(acc, this.parseNot(), line);
    }
    return acc;
  }

  parseOr(): Node {
    let acc = this.parseAnd();
    while (this.isIdent("or")) {
      const line = this.cur().line;
      this.advance();
      acc = mkOr(acc, this.parseAnd(), line);
    }
    return acc;
  }

  // ---- 文 ----
  parseStatement(): Node {
    const line = this.cur().line;
    if (hasError) return mkExprStmt(mkNum(0, line), line);
    if (this.isWord("もし")) return this.parseIfChain();
    if (this.isWord("繰り返し")) return this.parseWhilePost(); // 旧仕様: 後判定ループ
    if (this.isWord("関数")) return this.parseFuncDef(); // 旧仕様: 関数定義
    if (this.isType(TT.IDENT)) return this.parseIdentLed();
    return this.parseGenericStmt();
  }

  // IDENTで始まる文の判別。1トークン先読みでは分岐できないため、
  // "["に対応する"]"の直後を覗き見て代入文かどうかを判定する
  parseIdentLed(): Node {
    const startPos = this.pos;
    const line = this.cur().line;
    const name = this.advance().text;

    if (this.isType(TT.LBRACKET)) {
      const closePos = this.findMatchingClose(this.pos, TT.LBRACKET, TT.RBRACKET);
      const nextType = closePos >= 0 ? this.peekAt(closePos - this.pos + 1).type : TT.EOF;
      if (closePos >= 0 && nextType == TT.ASSIGN) {
        this.advance(); // consume "["
        const indices = this.parseIndexList();
        this.expectType(TT.RBRACKET, "]");
        this.expectType(TT.ASSIGN, "=");
        const value = this.parseOr();
        return mkAssign(mkIndex(name, indices, line), value, line);
      }
      this.pos = startPos;
      return this.parseGenericStmt();
    } else if (this.isType(TT.ASSIGN)) {
      this.advance();
      const value = this.parseOr();
      return mkAssign(mkVar(name, line), value, line);
    } else if (this.isWord("のすべての値を")) {
      // 新仕様: 配列のすべての値を代入する
      this.advance();
      const value = this.parseOr();
      this.expectWord("にする");
      return mkFillAll(name, value, line);
    } else if (this.isWord("のすべての要素に")) {
      // 旧仕様: 配列のすべての要素に代入する
      this.advance();
      const value = this.parseOr();
      this.expectWord("を代入する");
      return mkFillAll(name, value, line);
    } else if (this.isWord("を")) {
      this.advance();
      const e1 = this.parseArith();
      if (this.isWord("増やす")) {
        // 旧仕様: 増減の糖衣構文
        this.advance();
        return mkIncDec(mkVar(name, line), e1, true, line);
      }
      if (this.isWord("減らす")) {
        this.advance();
        return mkIncDec(mkVar(name, line), e1, false, line);
      }
      if (this.isWord("から")) {
        this.advance();
        const toE = this.parseArith();
        this.expectWord("まで");
        const stepE = this.parseArith();
        if (this.isWord("ずつ増やしながら繰り返す")) {
          // 新仕様: "繰り返す" が合体した語 + ":" + インデントブロック
          this.advance();
          this.expectType(TT.COLON, ":");
          const body = this.parseBlockBody();
          return mkFor(name, e1, toE, stepE, true, body, line);
        }
        if (this.isWord("ずつ減らしながら繰り返す")) {
          this.advance();
          this.expectType(TT.COLON, ":");
          const body = this.parseBlockBody();
          return mkFor(name, e1, toE, stepE, false, body, line);
        }
        if (this.isWord("ずつ増やしながら")) {
          // 旧仕様: カンマ+本体+閉じ語
          this.advance();
          this.consumeOptionalComma();
          const body = this.parseBodyBlock(["を繰り返す"]);
          this.expectWord("を繰り返す");
          return mkFor(name, e1, toE, stepE, true, body, line);
        }
        if (this.isWord("ずつ減らしながら")) {
          this.advance();
          this.consumeOptionalComma();
          const body = this.parseBodyBlock(["を繰り返す"]);
          this.expectWord("を繰り返す");
          return mkFor(name, e1, toE, stepE, false, body, line);
        }
        fail("「ずつ増やしながら」または「ずつ減らしながら」が必要です", this.cur().line);
        return mkExprStmt(mkNum(0, line), line);
      }
      fail("予期しないトークンです", this.cur().line);
      return mkExprStmt(mkNum(0, line), line);
    } else {
      this.pos = startPos;
      return this.parseGenericStmt();
    }
  }

  // 式文（表示する(...)などの関数呼び出しを含む）／前判定ループの判別
  parseGenericStmt(): Node {
    const line = this.cur().line;
    const expr = this.parseOr();
    if (hasError) return mkExprStmt(expr, line);
    if (this.isWord("の間繰り返す")) {
      // 新仕様: "の間" + "繰り返す" が合体した語 + ":" + インデントブロック
      this.advance();
      this.expectType(TT.COLON, ":");
      const body = this.parseBlockBody();
      return mkWhilePre(expr, body, line);
    }
    if (this.isWord("の間")) {
      // 旧仕様: カンマ+本体+閉じ語
      this.advance();
      this.consumeOptionalComma();
      const body = this.parseBodyBlock(["を繰り返す"]);
      this.expectWord("を繰り返す");
      return mkWhilePre(expr, body, line);
    }
    return mkExprStmt(expr, line);
  }

  // もし/そうでなくもし共通。新仕様(":" + インデント)と旧仕様(を実行する等の閉じ語)の
  // 両方をならば直後のトークンで判別する
  parseIfChain(): Node {
    const line = this.cur().line;
    this.advance(); // もし または そうでなくもし
    const cond = this.parseOr();
    this.expectWord("ならば");

    if (this.isType(TT.COLON)) {
      this.advance();
      const thenStmts = this.parseBlockBody();
      if (this.isWord("そうでなくもし")) {
        const elseNode = this.parseIfChain();
        return mkIf(cond, thenStmts, [elseNode], line);
      }
      if (this.isWord("そうでなければ")) {
        this.advance();
        this.expectType(TT.COLON, ":");
        const elseStmts = this.parseBlockBody();
        return mkIf(cond, thenStmts, elseStmts, line);
      }
      return mkIf(cond, thenStmts, null, line);
    }

    // 旧仕様
    const thenStmts = this.parseBodyBlock(["を実行する", "を実行し"]);
    if (this.isWord("を実行する")) {
      this.advance();
      return mkIf(cond, thenStmts, null, line);
    }
    this.expectWord("を実行し");
    this.consumeOptionalComma();
    if (this.isWord("そうでなくもし")) {
      const elseNode = this.parseIfChain();
      return mkIf(cond, thenStmts, [elseNode], line);
    }
    this.expectWord("そうでなければ");
    const elseStmts = this.parseBodyBlock(["を実行する"]);
    this.expectWord("を実行する");
    return mkIf(cond, thenStmts, elseStmts, line);
  }

  // 旧仕様: 単一行形式と複数行形式の両対応の本体ブロック（閉じ語で終端）
  parseBodyBlock(stopWords: string[]): Node[] {
    if (this.isType(TT.NEWLINE)) {
      this.skipNewlines();
      return this.parseStatementsUntilWord(stopWords);
    } else {
      const stmts: Node[] = [this.parseStatement()];
      while (this.isType(TT.COMMA) && !hasError) {
        this.advance();
        stmts.push(this.parseStatement());
      }
      return stmts;
    }
  }

  parseStatementsUntilWord(stopWords: string[]): Node[] {
    const stmts: Node[] = [];
    while (true) {
      this.skipNewlines();
      if (this.isType(TT.EOF)) {
        fail("予期しない終端です", this.cur().line);
        break;
      }
      if (this.isWordOneOf(stopWords)) break;
      stmts.push(this.parseStatement());
      if (hasError) break;
      while (this.isType(TT.COMMA)) {
        this.advance();
        stmts.push(this.parseStatement());
        if (hasError) break;
      }
    }
    return stmts;
  }

  // 旧仕様の後判定ループの本体は、"を"の直後に","が続く箇所までを読む
  parseStatementsUntilTuComma(): Node[] {
    const stmts: Node[] = [];
    while (true) {
      this.skipNewlines();
      if (this.isType(TT.EOF)) {
        fail("予期しない終端です", this.cur().line);
        break;
      }
      if (this.isWord("を") && this.peekAt(1).type == TT.COMMA) break;
      stmts.push(this.parseStatement());
      if (hasError) break;
      while (this.isType(TT.COMMA)) {
        this.advance();
        stmts.push(this.parseStatement());
        if (hasError) break;
      }
    }
    return stmts;
  }

  // 旧仕様: 後判定ループ 「繰り返し，〈処理〉を，〈条件〉になるまで実行する」
  parseWhilePost(): Node {
    const line = this.cur().line;
    this.expectWord("繰り返し");
    this.consumeOptionalComma();
    this.skipNewlines();
    const body = this.parseStatementsUntilTuComma();
    this.expectWord("を");
    this.expectType(TT.COMMA, "，");
    const cond = this.parseOr();
    this.expectWord("になるまで実行する");
    return mkWhilePost(cond, body, line);
  }

  // 旧仕様: 関数定義 「関数 name(params) を 〈処理〉 と定義する」
  parseFuncDef(): Node {
    const line = this.cur().line;
    this.expectWord("関数");
    const name = this.consumeIdentOrWord();
    this.expectType(TT.LPAREN, "(");
    const params = this.parseParamList();
    this.expectType(TT.RPAREN, ")");
    this.expectWord("を");
    this.skipNewlines();
    const body = this.parseStatementsUntilWord(["と定義する"]);
    this.expectWord("と定義する");
    return mkFuncDef(name, params, body, line);
  }

  parseParamList(): string[] {
    const params: string[] = [];
    if (this.isType(TT.RPAREN)) return params;
    params.push(this.expectType(TT.IDENT, "引数名").text);
    while (this.isType(TT.COMMA)) {
      this.advance();
      params.push(this.expectType(TT.IDENT, "引数名").text);
    }
    return params;
  }
}

export function parseProgram(tokens: Token[]): Node[] {
  const p = new Parser(tokens);
  return p.parseProgram();
}
