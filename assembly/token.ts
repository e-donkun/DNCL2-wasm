// トークン種別
// 2022年11月改訂の「共通テスト用プログラム表記」（新DNCL）と、それ以前の記法（旧DNCL）
// の両方をサポートするため、代入(ASSIGN)と比較の等号(EQ)を分離するなど新仕様に合わせて
// 再構成している。歴史的な記法は競合しない範囲でエイリアスとして残す。
export const enum TT {
  NUMBER = 0,
  STRING = 1,
  IDENT = 2,   // 英字始まりの変数名 (ASCII)。and/or/not もこのカテゴリでレキシングされる
  WORD = 3,    // 日本語の連続文字列（キーワード・関数名など）
  NEWLINE = 4,
  LPAREN = 5,
  RPAREN = 6,
  LBRACKET = 7,  // [ （新仕様: 配列リテラル/添字の両方に使用）
  RBRACKET = 8,  // ]
  LBRACE = 9,    // { （旧仕様の配列リテラル。後方互換のため存続）
  RBRACE = 10,   // }
  LINPUT = 11,   // 【
  RINPUT = 12,   // 】
  COMMA = 13,
  ARROW = 14,    // 代入演算子。新仕様の "=" と旧仕様の "←"/"<-" の両方がここに入る
  PLUS = 15,
  MINUS = 16,
  MUL = 17,
  DIV = 18,      // /
  IDIV = 19,     // ÷
  MOD = 20,      // ％
  EQ = 21,       // 等価比較。新仕様の "==" （旧仕様の全角＝は代入と衝突するため廃止）
  NEQ = 22,
  GT = 23,
  GE = 24,
  LT = 25,
  LE = 26,
  POW = 27,      // ** （新仕様: べき乗演算子）
  COLON = 28,    // : （新仕様: 制御文ヘッダの終端）
  INDENT = 29,   // 新仕様: インデントによるブロック開始
  DEDENT = 30,   // 新仕様: インデントによるブロック終了
  EOF = 31
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
