// トークン種別
export const enum TT {
  NUMBER = 0,
  STRING = 1,
  IDENT = 2,   // 英字始まりの変数名 (ASCII)
  WORD = 3,    // 日本語の連続文字列（キーワード・関数名など）
  NEWLINE = 4,
  LPAREN = 5,
  RPAREN = 6,
  LBRACKET = 7,  // [
  RBRACKET = 8,  // ]
  LBRACE = 9,    // {
  RBRACE = 10,   // }
  LINPUT = 11,   // 【
  RINPUT = 12,   // 】
  COMMA = 13,
  ARROW = 14,    // ←
  PLUS = 15,
  MINUS = 16,
  MUL = 17,
  DIV = 18,      // /
  IDIV = 19,     // ÷
  MOD = 20,      // ％
  EQ = 21,
  NEQ = 22,
  GT = 23,
  GE = 24,
  LT = 25,
  LE = 26,
  EOF = 27
}

export class Token {
  type: i32;
  text: string;
  num: f64;
  line: i32;
  constructor(type: i32, text: string, num: f64, line: i32) {
    this.type = type;
    this.text = text;
    this.num = num;
    this.line = line;
  }
}
