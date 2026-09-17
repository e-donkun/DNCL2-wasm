// AST設計: タグ付きユニオン1クラスで表現する（DESIGN.md 2節）
export const enum NK {
  NUM,
  STR,
  BOOL,
  VAR,
  INDEX,
  ARRLIT,
  INPUT,
  NEG,
  BINOP,
  CMP,
  AND,
  OR,
  NOT,
  CALL,
  ASSIGN,
  FILL_ALL,
  INCDEC,
  EXPR_STMT,
  IF,
  WHILE_PRE,
  WHILE_POST,
  FOR,
  FUNCDEF
}

// kindごとのフィールドの意味:
// NUM: num=値
// STR: str=文字列値
// BOOL: num=0(偽) or 1(真)
// VAR: str=変数名
// INDEX: str=配列名, list=添字式の配列
// ARRLIT: list=要素式の配列
// INPUT: (フィールドなし)
// NEG/NOT: a=対象式
// BINOP/CMP: str=演算子("+","-","*","/","div","mod","=","!=",">",">=","<","<="), a=左, b=右
// AND/OR: a=左, b=右
// CALL: str=関数名, list=引数式
// ASSIGN: a=代入先(VAR or INDEX), b=値式
// FILL_ALL: str=配列名, a=値式
// INCDEC: a=対象(VAR), b=増減量式, flag=true→増やす/false→減らす（旧仕様の糖衣構文。新仕様にはない）
// EXPR_STMT: a=式（手続き呼び出しを文として使う場合。新仕様の 表示する(...) もこれ）
// IF: a=条件, list=then節の文, elseList=else節の文（nullならelseなし）
// WHILE_PRE: a=条件, list=本体文
// WHILE_POST: a=条件, list=本体文
// FOR: str=変数名, a=初期値式, b=終了値式, c=差分式, flag=true→増やしながら/false→減らしながら, list=本体文
// FUNCDEF: str=関数名, params=引数名の配列, list=本体文
export class Node {
  kind: i32;
  num: f64 = 0;
  str: string = "";
  flag: bool = false;
  a: Node | null = null;
  b: Node | null = null;
  c: Node | null = null;
  list: Node[] | null = null;
  elseList: Node[] | null = null;
  params: string[] | null = null;
  line: i32 = 0;

  constructor(kind: i32, line: i32) {
    this.kind = kind;
    this.line = line;
  }
}

export function mkNum(v: f64, line: i32): Node {
  const n = new Node(NK.NUM, line);
  n.num = v;
  return n;
}

export function mkStr(v: string, line: i32): Node {
  const n = new Node(NK.STR, line);
  n.str = v;
  return n;
}

export function mkBool(v: bool, line: i32): Node {
  const n = new Node(NK.BOOL, line);
  n.num = v ? 1 : 0;
  return n;
}

export function mkVar(name: string, line: i32): Node {
  const n = new Node(NK.VAR, line);
  n.str = name;
  return n;
}

export function mkIndex(name: string, indices: Node[], line: i32): Node {
  const n = new Node(NK.INDEX, line);
  n.str = name;
  n.list = indices;
  return n;
}

export function mkArrLit(elems: Node[], line: i32): Node {
  const n = new Node(NK.ARRLIT, line);
  n.list = elems;
  return n;
}

// prompt: 【と】の間に書かれた文字列。Pythonのinput(prompt)のプロンプトとして
// ホスト側に渡す（DESIGN.md「対話的な入力」参照）
export function mkInput(prompt: string, line: i32): Node {
  const n = new Node(NK.INPUT, line);
  n.str = prompt;
  return n;
}

export function mkNeg(a: Node, line: i32): Node {
  const n = new Node(NK.NEG, line);
  n.a = a;
  return n;
}

export function mkBinop(op: string, a: Node, b: Node, line: i32): Node {
  const n = new Node(NK.BINOP, line);
  n.str = op;
  n.a = a;
  n.b = b;
  return n;
}

export function mkCmp(op: string, a: Node, b: Node, line: i32): Node {
  const n = new Node(NK.CMP, line);
  n.str = op;
  n.a = a;
  n.b = b;
  return n;
}

export function mkAnd(a: Node, b: Node, line: i32): Node {
  const n = new Node(NK.AND, line);
  n.a = a;
  n.b = b;
  return n;
}

export function mkOr(a: Node, b: Node, line: i32): Node {
  const n = new Node(NK.OR, line);
  n.a = a;
  n.b = b;
  return n;
}

export function mkNot(a: Node, line: i32): Node {
  const n = new Node(NK.NOT, line);
  n.a = a;
  return n;
}

export function mkCall(name: string, args: Node[], line: i32): Node {
  const n = new Node(NK.CALL, line);
  n.str = name;
  n.list = args;
  return n;
}

export function mkAssign(target: Node, value: Node, line: i32): Node {
  const n = new Node(NK.ASSIGN, line);
  n.a = target;
  n.b = value;
  return n;
}

export function mkFillAll(name: string, value: Node, line: i32): Node {
  const n = new Node(NK.FILL_ALL, line);
  n.str = name;
  n.a = value;
  return n;
}

export function mkIncDec(target: Node, amount: Node, increase: bool, line: i32): Node {
  const n = new Node(NK.INCDEC, line);
  n.a = target;
  n.b = amount;
  n.flag = increase;
  return n;
}

export function mkExprStmt(expr: Node, line: i32): Node {
  const n = new Node(NK.EXPR_STMT, line);
  n.a = expr;
  return n;
}

export function mkIf(cond: Node, thenStmts: Node[], elseStmts: Node[] | null, line: i32): Node {
  const n = new Node(NK.IF, line);
  n.a = cond;
  n.list = thenStmts;
  n.elseList = elseStmts;
  return n;
}

export function mkWhilePre(cond: Node, body: Node[], line: i32): Node {
  const n = new Node(NK.WHILE_PRE, line);
  n.a = cond;
  n.list = body;
  return n;
}

export function mkWhilePost(cond: Node, body: Node[], line: i32): Node {
  const n = new Node(NK.WHILE_POST, line);
  n.a = cond;
  n.list = body;
  return n;
}

export function mkFor(
  varName: string,
  from: Node,
  to: Node,
  step: Node,
  increasing: bool,
  body: Node[],
  line: i32
): Node {
  const n = new Node(NK.FOR, line);
  n.str = varName;
  n.a = from;
  n.b = to;
  n.c = step;
  n.flag = increasing;
  n.list = body;
  return n;
}

export function mkFuncDef(name: string, params: string[], body: Node[], line: i32): Node {
  const n = new Node(NK.FUNCDEF, line);
  n.str = name;
  n.params = params;
  n.list = body;
  return n;
}
