// 字句解析（DESIGN.md 1節）
// 設計のキモ: 「同じ文字カテゴリの最大連続runを1トークンにする」方式。
// ASCII識別子 / 数字 / 日本語文字(ひらがな・カタカナ・漢字) / 記号1〜2文字 の
// 4カテゴリに分け、カテゴリが変わる箇所で自然にトークンが分割される。
import { Token, TT } from "./token";

function isInlineSpace(c: i32): bool {
  return c == 32 || c == 9 || c == 0x3000; // 半角/タブ/全角スペース
}

function isDigit(c: i32): bool {
  return c >= 48 && c <= 57;
}

function isAsciiIdentStart(c: i32): bool {
  return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c == 95;
}

function isAsciiIdentPart(c: i32): bool {
  return isAsciiIdentStart(c) || isDigit(c);
}

// ひらがな・カタカナ・漢字（全角記号は含めない）
function isWordChar(c: i32): bool {
  if (c >= 0x3040 && c <= 0x309f) return true; // ひらがな
  if (c >= 0x30a0 && c <= 0x30ff) return true; // カタカナ・ー
  if (c >= 0x4e00 && c <= 0x9fff) return true; // 漢字
  return false;
}

// 全角/半角の対応表にある1文字記号 → トークン種別（該当なしは-1）
function singleCharTokenType(c: i32): i32 {
  switch (c) {
    case 0x2190: return TT.ARROW; // ←
    case 0xff0b: return TT.PLUS; // ＋
    case 43: return TT.PLUS; // +
    case 0xff0d: return TT.MINUS; // －
    case 45: return TT.MINUS; // -
    case 0x00d7: return TT.MUL; // ×
    case 42: return TT.MUL; // *
    case 0xff0f: return TT.DIV; // ／
    case 47: return TT.DIV; // /
    case 0x00f7: return TT.IDIV; // ÷
    case 0xff05: return TT.MOD; // ％
    case 37: return TT.MOD; // %
    case 0xff1d: return TT.EQ; // ＝
    case 61: return TT.EQ; // =
    case 0x2260: return TT.NEQ; // ≠
    case 0xff1e: return TT.GT; // ＞
    case 0x2267: return TT.GE; // ≧
    case 0xff1c: return TT.LT; // ＜
    case 0x2266: return TT.LE; // ≦
    case 0xff08: return TT.LPAREN; // （
    case 40: return TT.LPAREN; // (
    case 0xff09: return TT.RPAREN; // ）
    case 41: return TT.RPAREN; // )
    case 91: return TT.LBRACKET; // [
    case 93: return TT.RBRACKET; // ]
    case 123: return TT.LBRACE; // {
    case 125: return TT.RBRACE; // }
    case 0x3010: return TT.LINPUT; // 【
    case 0x3011: return TT.RINPUT; // 】
    case 0xff0c: return TT.COMMA; // ，
    case 44: return TT.COMMA; // ,
    default: return -1;
  }
}

// 直前のトークンがNEWLINEなら連続する改行をまとめて1トークンにする
function pushNewline(tokens: Token[], line: i32): void {
  const len = tokens.length;
  if (len > 0 && tokens[len - 1].type == TT.NEWLINE) return;
  tokens.push(new Token(TT.NEWLINE, "\n", 0, line));
}

export function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  const n = src.length;
  let i = 0;
  let line = 1;

  while (i < n) {
    const c = src.charCodeAt(i);

    if (c == 10) {
      // \n
      pushNewline(tokens, line);
      line++;
      i++;
      continue;
    }
    if (c == 13) {
      // \r （\r\nの\rは無視。単独\rも改行扱いにはしない仕様）
      i++;
      continue;
    }
    if (isInlineSpace(c)) {
      i++;
      continue;
    }
    if (c == 35) {
      // # コメント: 行末まで無視
      while (i < n && src.charCodeAt(i) != 10) i++;
      continue;
    }
    if (c == 34) {
      // "..." 文字列
      i++;
      const start = i;
      while (i < n && src.charCodeAt(i) != 34) i++;
      const text = src.substring(start, i);
      if (i < n) i++; // 閉じの"
      tokens.push(new Token(TT.STRING, text, 0, line));
      continue;
    }
    if (c == 0x300c) {
      // 「...」 文字列
      i++;
      const start = i;
      while (i < n && src.charCodeAt(i) != 0x300d) i++;
      const text = src.substring(start, i);
      if (i < n) i++; // 閉じの」
      tokens.push(new Token(TT.STRING, text, 0, line));
      continue;
    }
    if (isDigit(c)) {
      const start = i;
      i++;
      while (i < n && isDigit(src.charCodeAt(i))) i++;
      if (i < n && src.charCodeAt(i) == 46 && i + 1 < n && isDigit(src.charCodeAt(i + 1))) {
        i++;
        while (i < n && isDigit(src.charCodeAt(i))) i++;
      }
      const text = src.substring(start, i);
      tokens.push(new Token(TT.NUMBER, text, parseFloat(text), line));
      continue;
    }
    if (isAsciiIdentStart(c)) {
      const start = i;
      i++;
      while (i < n && isAsciiIdentPart(src.charCodeAt(i))) i++;
      const text = src.substring(start, i);
      tokens.push(new Token(TT.IDENT, text, 0, line));
      continue;
    }
    // 半角記号の複数文字組み合わせ（全角対応が用意されていないものだけ先読み判定）
    if (c == 60) {
      // <
      if (i + 1 < n && src.charCodeAt(i + 1) == 45) {
        tokens.push(new Token(TT.ARROW, "<-", 0, line));
        i += 2;
        continue;
      }
      if (i + 1 < n && src.charCodeAt(i + 1) == 62) {
        tokens.push(new Token(TT.NEQ, "<>", 0, line));
        i += 2;
        continue;
      }
      if (i + 1 < n && src.charCodeAt(i + 1) == 61) {
        tokens.push(new Token(TT.LE, "<=", 0, line));
        i += 2;
        continue;
      }
      tokens.push(new Token(TT.LT, "<", 0, line));
      i++;
      continue;
    }
    if (c == 62) {
      // >
      if (i + 1 < n && src.charCodeAt(i + 1) == 61) {
        tokens.push(new Token(TT.GE, ">=", 0, line));
        i += 2;
        continue;
      }
      tokens.push(new Token(TT.GT, ">", 0, line));
      i++;
      continue;
    }
    if (c == 33) {
      // !
      if (i + 1 < n && src.charCodeAt(i + 1) == 61) {
        tokens.push(new Token(TT.NEQ, "!=", 0, line));
        i += 2;
        continue;
      }
      i++; // 単独の!は無視
      continue;
    }
    const single = singleCharTokenType(c);
    if (single >= 0) {
      tokens.push(new Token(single, String.fromCharCode(c), 0, line));
      i++;
      continue;
    }
    if (isWordChar(c)) {
      const start = i;
      i++;
      while (i < n && isWordChar(src.charCodeAt(i))) i++;
      const text = src.substring(start, i);
      tokens.push(new Token(TT.WORD, text, 0, line));
      continue;
    }
    // 未知の文字は無視して読み進める
    i++;
  }
  tokens.push(new Token(TT.EOF, "", 0, line));
  return tokens;
}
