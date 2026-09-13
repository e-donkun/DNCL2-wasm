// 構文解析（DESIGN.md 4節）
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
  mkDisplay,
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

  skipNewlines(): void {
    while (this.isType(TT.NEWLINE)) this.advance();
  }

  consumeIdentOrWord(): string {
    if (this.isType(TT.IDENT) || this.isType(TT.WORD)) {
      return this.advance().text;
    }
    fail("関数名が必要です", this.cur().line);
    return "";
  }

  // openPosから対応する閉じトークンの絶対位置を探す（深さカウント方式。DESIGN.md 4.3節）
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

  // ---- プログラム全体 ----
  parseProgram(): Node[] {
    this.skipNewlines();
    const stmts: Node[] = [];
    while (!this.isType(TT.EOF) && !hasError) {
      stmts.push(this.parseStatement());
      if (hasError) break;
      while (this.isType(TT.COMMA)) {
        this.advance();
        stmts.push(this.parseStatement());
        if (hasError) break;
      }
      this.skipNewlines();
    }
    return stmts;
  }

  // ---- 式（優先順位: primary < unary < term < arith < comparison < logicalExpr < exprList）----
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
      const e = this.parseLogicalExpr();
      this.expectType(TT.RPAREN, ")");
      return e;
    }
    if (this.isType(TT.LBRACE)) {
      this.advance();
      const elems = this.parseArgList();
      this.expectType(TT.RBRACE, "}");
      return mkArrLit(elems, line);
    }
    if (this.isType(TT.LINPUT)) {
      this.advance();
      if (this.isType(TT.WORD)) this.advance(); // "外部からの入力"
      this.expectType(TT.RINPUT, "】");
      return mkInput(line);
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
    if (this.isType(TT.RPAREN) || this.isType(TT.RBRACE)) return args;
    args.push(this.parseLogicalExpr());
    while (this.isType(TT.COMMA)) {
      this.advance();
      args.push(this.parseLogicalExpr());
    }
    return args;
  }

  parseIndexList(): Node[] {
    const idx: Node[] = [];
    idx.push(this.parseLogicalExpr());
    while (this.isType(TT.COMMA)) {
      this.advance();
      idx.push(this.parseLogicalExpr());
    }
    return idx;
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
    return this.parsePrimary();
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
    if (this.isType(TT.EQ)) op = "=";
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

  // 論理演算子には優先順位がなく、左から出現順に逐次評価される（DNCL_SPEC_SUMMARY.md 4.3節）
  parseLogicalExpr(): Node {
    let acc = this.parseComparison();
    while (true) {
      if (this.isWord("でない")) {
        const line = this.cur().line;
        this.advance();
        acc = mkNot(acc, line);
        continue;
      }
      if (this.isWord("かつ")) {
        const line = this.cur().line;
        this.advance();
        acc = mkAnd(acc, this.parseComparison(), line);
        continue;
      }
      if (this.isWord("または")) {
        const line = this.cur().line;
        this.advance();
        acc = mkOr(acc, this.parseComparison(), line);
        continue;
      }
      break;
    }
    return acc;
  }

  parseExprList(): Node[] {
    const list: Node[] = [];
    list.push(this.parseLogicalExpr());
    while (this.isWord("と")) {
      this.advance();
      list.push(this.parseLogicalExpr());
    }
    return list;
  }

  // ---- 文 ----
  parseStatement(): Node {
    const line = this.cur().line;
    if (hasError) return mkExprStmt(mkNum(0, line), line);
    if (this.isWord("もし")) return this.parseIfChain("もし");
    if (this.isWord("繰り返し")) return this.parseWhilePost();
    if (this.isWord("関数")) return this.parseFuncDef();
    if (this.isType(TT.IDENT)) return this.parseIdentLed();
    return this.parseExprLed();
  }

  // IDENTで始まる文の判別。1トークン先読みでは分岐できないため、
  // "["に対応する"]"の直後を覗き見て代入文かどうかを判定する（DESIGN.md 4.2節）
  parseIdentLed(): Node {
    const startPos = this.pos;
    const line = this.cur().line;
    const name = this.advance().text;

    if (this.isType(TT.LBRACKET)) {
      const closePos = this.findMatchingClose(this.pos, TT.LBRACKET, TT.RBRACKET);
      const nextType = closePos >= 0 ? this.peekAt(closePos - this.pos + 1).type : TT.EOF;
      if (closePos >= 0 && nextType == TT.ARROW) {
        this.advance(); // consume "["
        const indices = this.parseIndexList();
        this.expectType(TT.RBRACKET, "]");
        this.expectType(TT.ARROW, "←");
        const value = this.parseLogicalExpr();
        return mkAssign(mkIndex(name, indices, line), value, line);
      }
      this.pos = startPos;
      return this.parseExprLed();
    } else if (this.isType(TT.ARROW)) {
      this.advance();
      const value = this.parseLogicalExpr();
      return mkAssign(mkVar(name, line), value, line);
    } else if (this.isWord("のすべての要素に")) {
      this.advance();
      const value = this.parseLogicalExpr();
      this.expectWord("を代入する");
      return mkFillAll(name, value, line);
    } else if (this.isWord("を")) {
      this.advance();
      const e1 = this.parseArith();
      if (this.isWord("増やす")) {
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
        let increasing = true;
        if (this.isWord("ずつ増やしながら")) {
          increasing = true;
          this.advance();
        } else if (this.isWord("ずつ減らしながら")) {
          increasing = false;
          this.advance();
        } else {
          fail("「ずつ増やしながら」または「ずつ減らしながら」が必要です", this.cur().line);
        }
        this.consumeOptionalComma();
        const body = this.parseBodyBlock(["を繰り返す"]);
        this.expectWord("を繰り返す");
        return mkFor(name, e1, toE, stepE, increasing, body, line);
      }
      fail("予期しないトークンです", this.cur().line);
      return mkExprStmt(mkNum(0, line), line);
    } else {
      this.pos = startPos;
      return this.parseExprLed();
    }
  }

  // display文 / while前判定 / 手続き呼び出し文の判別
  parseExprLed(): Node {
    const line = this.cur().line;
    const list = this.parseExprList();
    if (hasError) return mkExprStmt(mkNum(0, line), line);
    if (this.isWord("を表示する")) {
      this.advance();
      return mkDisplay(list, line);
    }
    if (list.length == 1) {
      if (this.isWord("の間")) {
        this.advance();
        this.consumeOptionalComma();
        const body = this.parseBodyBlock(["を繰り返す"]);
        this.expectWord("を繰り返す");
        return mkWhilePre(list[0], body, line);
      }
      return mkExprStmt(list[0], line);
    }
    fail("「を表示する」または「の間」が見つかりません", this.cur().line);
    return mkExprStmt(list[0], line);
  }

  // もし/そうでなくもし共通。else節は再帰でチェーンする
  parseIfChain(introWord: string): Node {
    const line = this.cur().line;
    this.expectWord(introWord);
    const cond = this.parseLogicalExpr();
    this.expectWord("ならば");
    const thenStmts = this.parseBodyBlock(["を実行する", "を実行し"]);
    if (this.isWord("を実行する")) {
      this.advance();
      return mkIf(cond, thenStmts, null, line);
    }
    this.expectWord("を実行し");
    this.consumeOptionalComma();
    if (this.isWord("そうでなくもし")) {
      const elseNode = this.parseIfChain("そうでなくもし");
      return mkIf(cond, thenStmts, [elseNode], line);
    }
    this.expectWord("そうでなければ");
    const elseStmts = this.parseBodyBlock(["を実行する"]);
    this.expectWord("を実行する");
    return mkIf(cond, thenStmts, elseStmts, line);
  }

  // 単一行形式と複数行形式の両対応
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

  // 後判定ループの本体は、"を"の直後に","が続く箇所までを読む（DESIGN.md 4.2節）
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

  parseWhilePost(): Node {
    const line = this.cur().line;
    this.expectWord("繰り返し");
    this.consumeOptionalComma();
    this.skipNewlines();
    const body = this.parseStatementsUntilTuComma();
    this.expectWord("を");
    this.expectType(TT.COMMA, "，");
    const cond = this.parseLogicalExpr();
    this.expectWord("になるまで実行する");
    return mkWhilePost(cond, body, line);
  }

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
