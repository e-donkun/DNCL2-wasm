// 字句解析
// 設計のキモ（新旧共通）: 「同じ文字カテゴリの最大連続runを1トークンにする」方式。
// ASCII識別子 / 数字 / 日本語文字(ひらがな・カタカナ・漢字) / 記号1〜2文字 の
// 4カテゴリに分け、カテゴリが変わる箇所で自然にトークンが分割される。
//
// 新仕様（2022年11月改訂）ではブロック構造が「:」+インデントで表される（Python類似）。
// このレキサはPythonのトークナイザと同様に、各論理行の先頭で字下げ幅を測定し、
// 増加したらINDENT、減少したらDEDENTトークンを発行する。参考PDFに現れる｜(U+FF5C)・
// ⎿(U+23BF) は目視用のブロックガイド線であり、字下げ文字と同じ「空白」として扱うことで
// 半角スペースによるインデントとPDFからのコピー＆ペーストの両方を受け付ける。
import { Token, TT } from "./token";
import { fail } from "./errors";

// 半角/タブ/全角スペース、および｜・⎿（ブロックガイド記号）はすべて「空白」として扱う
function isSpaceLike(c: i32): bool {
  return c == 32 || c == 9 || c == 0x3000 || c == 0xff5c || c == 0x23bf;
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
// "=" '*' ':' は前後の文字次第で2文字トークンになりうるため、ここには含めず
// tokenize() 本体で個別に先読み判定する。
function singleCharTokenType(c: i32): i32 {
  switch (c) {
    case 0x2190: return TT.ASSIGN; // ← (旧仕様の代入。新仕様の"="と共存)
    case 0xff0b: return TT.PLUS; // ＋
    case 43: return TT.PLUS; // +
    case 0xff0d: return TT.MINUS; // －
    case 45: return TT.MINUS; // -
    case 0x00d7: return TT.MUL; // ×
    case 0xff0f: return TT.DIV; // ／
    case 47: return TT.DIV; // /
    case 0x00f7: return TT.IDIV; // ÷
    case 0xff05: return TT.MOD; // ％
    case 37: return TT.MOD; // %
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
    case 123: return TT.LBRACE; // { （旧仕様の配列リテラル。後方互換）
    case 125: return TT.RBRACE; // }
    case 0x3010: return TT.LINPUT; // 【
    case 0x3011: return TT.RINPUT; // 】
    case 0xff0c: return TT.COMMA; // ，
    case 44: return TT.COMMA; // ,
    case 0xff1a: return TT.COLON; // ：
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
  const indentStack: i32[] = [0];
  let atLineStart = true;

  while (i < n) {
    if (atLineStart) {
      let width = 0;
      while (i < n && isSpaceLike(src.charCodeAt(i))) {
        width++;
        i++;
      }
      const c0 = i < n ? src.charCodeAt(i) : -1;
      const isBlankOrComment = i >= n || c0 == 10 || c0 == 13 || c0 == 35;
      if (!isBlankOrComment) {
        const top = indentStack[indentStack.length - 1];
        if (width > top) {
          indentStack.push(width);
          tokens.push(new Token(TT.INDENT, "", 0, line));
        } else if (width < top) {
          while (indentStack.length > 1 && indentStack[indentStack.length - 1] > width) {
            indentStack.pop();
            tokens.push(new Token(TT.DEDENT, "", 0, line));
          }
          if (indentStack[indentStack.length - 1] != width) {
            fail("インデントが揃っていません", line);
            indentStack.push(width);
          }
        }
      }
      atLineStart = false;
      continue;
    }

    const c = src.charCodeAt(i);

    if (c == 10) {
      // \n
      pushNewline(tokens, line);
      line++;
      i++;
      atLineStart = true;
      continue;
    }
    if (c == 13) {
      // \r （\r\nの\rは無視）
      i++;
      continue;
    }
    if (isSpaceLike(c)) {
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
      // 「...」 文字列（旧仕様。後方互換で存続）
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
    // "=" は次の文字が"="かどうかで ASSIGN("=") / EQ("==") を切り替える
    if (c == 61) {
      if (i + 1 < n && src.charCodeAt(i + 1) == 61) {
        tokens.push(new Token(TT.EQ, "==", 0, line));
        i += 2;
        continue;
      }
      tokens.push(new Token(TT.ASSIGN, "=", 0, line));
      i++;
      continue;
    }
    // "*" は次の文字が"*"かどうかで MUL("*") / POW("**") を切り替える
    if (c == 42) {
      if (i + 1 < n && src.charCodeAt(i + 1) == 42) {
        tokens.push(new Token(TT.POW, "**", 0, line));
        i += 2;
        continue;
      }
      tokens.push(new Token(TT.MUL, "*", 0, line));
      i++;
      continue;
    }
    if (c == 58) {
      // : コロン（新仕様の制御文ヘッダ終端）
      tokens.push(new Token(TT.COLON, ":", 0, line));
      i++;
      continue;
    }
    // 半角記号の複数文字組み合わせ（全角対応が用意されていないものだけ先読み判定）
    if (c == 60) {
      // <
      if (i + 1 < n && src.charCodeAt(i + 1) == 45) {
        tokens.push(new Token(TT.ASSIGN, "<-", 0, line));
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

  if (tokens.length > 0 && tokens[tokens.length - 1].type != TT.NEWLINE) {
    tokens.push(new Token(TT.NEWLINE, "\n", 0, line));
  }
  while (indentStack.length > 1) {
    indentStack.pop();
    tokens.push(new Token(TT.DEDENT, "", 0, line));
  }
  tokens.push(new Token(TT.EOF, "", 0, line));
  return tokens;
}
