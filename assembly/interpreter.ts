// インタプリタ設計（DESIGN.md 5節）
import { Node, NK } from "./ast";
import { fail, hasError } from "./errors";
import { hostPrint, hostInput } from "./host";

export const enum VK {
  NUM,
  STR,
  BOOL,
  ARR,
  NIL
}

export class Value {
  kind: i32;
  num: f64 = 0;
  str: string = "";
  arr: Value[] | null = null;
}

function numVal(v: f64): Value {
  const r = new Value();
  r.kind = VK.NUM;
  r.num = v;
  return r;
}

function strVal(v: string): Value {
  const r = new Value();
  r.kind = VK.STR;
  r.str = v;
  return r;
}

function boolVal(v: bool): Value {
  const r = new Value();
  r.kind = VK.BOOL;
  r.num = v ? 1 : 0;
  return r;
}

function arrVal(v: Value[]): Value {
  const r = new Value();
  r.kind = VK.ARR;
  r.arr = v;
  return r;
}

function nilVal(): Value {
  const r = new Value();
  r.kind = VK.NIL;
  return r;
}

// シード可能な擬似乱数生成器（mulberry32）。
// HTML側でインタラクティブな入力（【外部からの入力】）を「途中から再実行」方式
// （tests/やdist/index.htmlのNeedInputSignal参照）で実現しているため、同じ実行を
// 再現したときに 乱数() の結果が変わってしまわないよう、Math.random()ではなく
// 呼び出し側から明示的にシードできる決定的な乱数を使う。
let rngState: u32 = 0x2545f491;

export function seedRandomState(seed: u32): void {
  rngState = seed;
}

function nextRandom(): f64 {
  rngState = (rngState + 0x6d2b79f5) as u32;
  let t: u32 = rngState;
  t = (t ^ (t >>> 15)) * (t | 1);
  t ^= t + (t ^ (t >>> 7)) * (t | 61);
  t ^= t >>> 14;
  return f64(t >>> 0) / 4294967296.0;
}

// Pythonのbool()と同様の真偽判定（未定義挙動のためPythonに準拠）:
// 数値・真偽値は0以外が真、文字列・配列は空でなければ真
function isTruthy(v: Value): bool {
  if (v.kind == VK.BOOL) return v.num != 0;
  if (v.kind == VK.NUM) return v.num != 0;
  if (v.kind == VK.STR) return v.str.length > 0;
  if (v.kind == VK.ARR) return v.arr != null && v.arr!.length > 0;
  return false;
}

// NUM: 整数値ならゼロ埋めなしの整数表記、そうでなければ素直な10進表記（DESIGN.md 3節）
export function valueToDisplayString(v: Value): string {
  if (v.kind == VK.NUM) return formatNum(v.num);
  if (v.kind == VK.STR) return v.str;
  if (v.kind == VK.BOOL) return v.num != 0 ? "真" : "偽";
  if (v.kind == VK.ARR) {
    const arr = v.arr!;
    let s = "";
    for (let i = 0; i < arr.length; i++) {
      if (i > 0) s += ",";
      s += valueToDisplayString(arr[i]);
    }
    return s;
  }
  return "";
}

function formatNum(v: f64): string {
  if (isNaN(v)) return "NaN";
  if (!isFinite(v)) return v > 0 ? "Infinity" : "-Infinity";
  if (Math.floor(v) == v && Math.abs(v) < 1e15) {
    return i64(v).toString();
  }
  return v.toString();
}

function toBinaryString(v: i64): string {
  if (v == 0) return "0";
  const neg = v < 0;
  let uv: u64 = neg ? u64(-v) : u64(v);
  let s = "";
  while (uv > 0) {
    s = ((uv & 1) == 1 ? "1" : "0") + s;
    uv = uv >> 1;
  }
  return neg ? "-" + s : s;
}

export class Interpreter {
  globals: Map<string, Value> = new Map();
  funcs: Map<string, Node> = new Map();
  callStack: Map<string, Value>[] = [];
  // 配列（・文字列）添字の開始番号。0なら従来通り、1ならユーザーが書いた添字から
  // 1を引いて内部の0始まり配列にアクセスする（ホスト側のプルダウンで切替可能。
  // DESIGN.md「配列添字の開始番号」参照）
  indexBase: i32 = 0;

  currentScope(): Map<string, Value> | null {
    const n = this.callStack.length;
    return n > 0 ? this.callStack[n - 1] : null;
  }

  // 読み出しはローカルになければグローバルにフォールバックする（DESIGN.md 5.2節）
  getVar(name: string, line: i32): Value {
    const scope = this.currentScope();
    if (scope != null && scope.has(name)) return scope.get(name);
    if (this.globals.has(name)) return this.globals.get(name);
    fail("未定義の変数です: " + name, line);
    return nilVal();
  }

  // 代入は常にローカル優先（関数内なら）で書き込む（DESIGN.md 5.2節）
  setVar(name: string, v: Value): void {
    const scope = this.currentScope();
    if (scope != null) {
      scope.set(name, v);
    } else {
      this.globals.set(name, v);
    }
  }

  runProgram(stmts: Node[]): void {
    for (let i = 0; i < stmts.length; i++) {
      if (stmts[i].kind == NK.FUNCDEF) this.funcs.set(stmts[i].str, stmts[i]);
    }
    for (let i = 0; i < stmts.length; i++) {
      if (stmts[i].kind == NK.FUNCDEF) continue;
      this.execStmt(stmts[i]);
      if (hasError) return;
    }
  }

  execBlock(stmts: Node[]): void {
    for (let i = 0; i < stmts.length; i++) {
      this.execStmt(stmts[i]);
      if (hasError) return;
    }
  }

  execStmt(n: Node): void {
    if (hasError) return;
    switch (n.kind) {
      case NK.ASSIGN:
        this.execAssign(n);
        return;
      case NK.FILL_ALL:
        this.execFillAll(n);
        return;
      case NK.INCDEC:
        this.execIncDec(n);
        return;
      case NK.EXPR_STMT:
        this.evalExpr(n.a!);
        return;
      case NK.IF:
        this.execIf(n);
        return;
      case NK.WHILE_PRE:
        this.execWhilePre(n);
        return;
      case NK.WHILE_POST:
        this.execWhilePost(n);
        return;
      case NK.FOR:
        this.execFor(n);
        return;
      case NK.FUNCDEF:
        this.funcs.set(n.str, n);
        return;
      default:
        fail("不明な文です", n.line);
        return;
    }
  }

  execAssign(n: Node): void {
    const value = this.evalExpr(n.b!);
    if (hasError) return;
    const target = n.a!;
    if (target.kind == NK.VAR) {
      this.setVar(target.str, value);
    } else if (target.kind == NK.INDEX) {
      this.assignIndex(target, value);
    } else {
      fail("代入先が不正です", n.line);
    }
  }

  // 配列の添字はindexBase始まり（0または1。ホスト側のプルダウンで切替可能）
  assignIndex(target: Node, value: Value): void {
    const name = target.str;
    const indices = target.list!;
    let container = this.getVar(name, target.line);
    if (hasError) return;
    for (let i = 0; i < indices.length - 1; i++) {
      const idxVal = this.evalExpr(indices[i]);
      if (hasError) return;
      if (container.kind != VK.ARR || container.arr == null) {
        fail("配列ではありません: " + name, target.line);
        return;
      }
      const idx = <i32>Math.round(idxVal.num) - this.indexBase;
      const a = container.arr!;
      if (idx < 0 || idx >= a.length) {
        fail("添字が範囲外です", target.line);
        return;
      }
      container = a[idx];
    }
    if (container.kind != VK.ARR || container.arr == null) {
      fail("配列ではありません: " + name, target.line);
      return;
    }
    const lastIdxVal = this.evalExpr(indices[indices.length - 1]);
    if (hasError) return;
    const lastIdx = <i32>Math.round(lastIdxVal.num) - this.indexBase;
    const a = container.arr!;
    if (lastIdx < 0 || lastIdx >= a.length) {
      fail("添字が範囲外です", target.line);
      return;
    }
    a[lastIdx] = value;
  }

  execFillAll(n: Node): void {
    const value = this.evalExpr(n.a!);
    if (hasError) return;
    const container = this.getVar(n.str, n.line);
    if (hasError) return;
    if (container.kind != VK.ARR || container.arr == null) {
      fail("配列ではありません: " + n.str, n.line);
      return;
    }
    const a = container.arr!;
    for (let i = 0; i < a.length; i++) a[i] = value;
  }

  execIncDec(n: Node): void {
    const target = n.a!;
    if (target.kind != NK.VAR) {
      fail("増減の対象が変数ではありません", n.line);
      return;
    }
    const cur = this.getVar(target.str, n.line);
    if (hasError) return;
    const amt = this.evalExpr(n.b!);
    if (hasError) return;
    if (cur.kind != VK.NUM || amt.kind != VK.NUM) {
      fail("数値ではありません", n.line);
      return;
    }
    this.setVar(target.str, numVal(n.flag ? cur.num + amt.num : cur.num - amt.num));
  }

  execIf(n: Node): void {
    const cond = this.evalExpr(n.a!);
    if (hasError) return;
    if (isTruthy(cond)) {
      this.execBlock(n.list!);
    } else if (n.elseList != null) {
      this.execBlock(n.elseList!);
    }
  }

  execWhilePre(n: Node): void {
    let guard: i32 = 0;
    while (true) {
      const cond = this.evalExpr(n.a!);
      if (hasError) return;
      if (!isTruthy(cond)) break;
      this.execBlock(n.list!);
      if (hasError) return;
      guard++;
      if (guard > 10000000) {
        fail("ループの繰り返し回数が上限を超えました", n.line);
        return;
      }
    }
  }

  execWhilePost(n: Node): void {
    let guard: i32 = 0;
    while (true) {
      this.execBlock(n.list!);
      if (hasError) return;
      const cond = this.evalExpr(n.a!);
      if (hasError) return;
      if (isTruthy(cond)) break;
      guard++;
      if (guard > 10000000) {
        fail("ループの繰り返し回数が上限を超えました", n.line);
        return;
      }
    }
  }

  execFor(n: Node): void {
    const fromV = this.evalExpr(n.a!);
    if (hasError) return;
    const toV = this.evalExpr(n.b!);
    if (hasError) return;
    const stepV = this.evalExpr(n.c!);
    if (hasError) return;
    if (fromV.kind != VK.NUM || toV.kind != VK.NUM || stepV.kind != VK.NUM) {
      fail("繰返し文の値は数値である必要があります", n.line);
      return;
    }
    let v = fromV.num;
    const to = toV.num;
    const step = Math.abs(stepV.num);
    let guard: i32 = 0;
    if (n.flag) {
      while (v <= to) {
        this.setVar(n.str, numVal(v));
        this.execBlock(n.list!);
        if (hasError) return;
        v += step;
        guard++;
        if (guard > 10000000) {
          fail("ループの繰り返し回数が上限を超えました", n.line);
          return;
        }
      }
    } else {
      while (v >= to) {
        this.setVar(n.str, numVal(v));
        this.execBlock(n.list!);
        if (hasError) return;
        v -= step;
        guard++;
        if (guard > 10000000) {
          fail("ループの繰り返し回数が上限を超えました", n.line);
          return;
        }
      }
    }
  }

  evalExpr(n: Node): Value {
    if (hasError) return nilVal();
    switch (n.kind) {
      case NK.NUM:
        return numVal(n.num);
      case NK.STR:
        return strVal(n.str);
      case NK.BOOL:
        return boolVal(n.num != 0);
      case NK.VAR:
        return this.getVar(n.str, n.line);
      case NK.INDEX:
        return this.evalIndex(n);
      case NK.ARRLIT:
        return this.evalArrLit(n);
      case NK.INPUT:
        return this.evalInput(n);
      case NK.NEG: {
        const v = this.evalExpr(n.a!);
        if (hasError) return nilVal();
        if (v.kind != VK.NUM) {
          fail("数値ではありません", n.line);
          return nilVal();
        }
        return numVal(-v.num);
      }
      case NK.BINOP:
        return this.evalBinop(n);
      case NK.CMP:
        return this.evalCmp(n);
      case NK.AND: {
        // Pythonのandと同様、左辺が偽なら右辺は評価しない（短絡評価）
        const l = this.evalExpr(n.a!);
        if (hasError) return nilVal();
        if (!isTruthy(l)) return boolVal(false);
        const r = this.evalExpr(n.b!);
        if (hasError) return nilVal();
        return boolVal(isTruthy(r));
      }
      case NK.OR: {
        // Pythonのorと同様、左辺が真なら右辺は評価しない（短絡評価）
        const l = this.evalExpr(n.a!);
        if (hasError) return nilVal();
        if (isTruthy(l)) return boolVal(true);
        const r = this.evalExpr(n.b!);
        if (hasError) return nilVal();
        return boolVal(isTruthy(r));
      }
      case NK.NOT: {
        const v = this.evalExpr(n.a!);
        if (hasError) return nilVal();
        return boolVal(!isTruthy(v));
      }
      case NK.CALL:
        return this.evalCall(n);
      default:
        fail("不明な式です", n.line);
        return nilVal();
    }
  }

  evalIndex(n: Node): Value {
    const name = n.str;
    const indices = n.list!;
    let container = this.getVar(name, n.line);
    if (hasError) return nilVal();
    for (let i = 0; i < indices.length; i++) {
      const idxVal = this.evalExpr(indices[i]);
      if (hasError) return nilVal();
      if (idxVal.kind != VK.NUM) {
        fail("添字は数値である必要があります", n.line);
        return nilVal();
      }
      const idx = <i32>Math.round(idxVal.num) - this.indexBase;
      // Pythonの文字列インデックスに倣い、文字列への添字アクセスも1文字の文字列として扱う
      if (container.kind == VK.STR) {
        if (idx < 0 || idx >= container.str.length) {
          fail("添字が範囲外です", n.line);
          return nilVal();
        }
        container = strVal(container.str.charAt(idx));
        continue;
      }
      if (container.kind != VK.ARR || container.arr == null) {
        fail("配列ではありません: " + name, n.line);
        return nilVal();
      }
      const a = container.arr!;
      if (idx < 0 || idx >= a.length) {
        fail("添字が範囲外です", n.line);
        return nilVal();
      }
      container = a[idx];
    }
    return container;
  }

  evalArrLit(n: Node): Value {
    const elems = n.list!;
    const vals: Value[] = [];
    for (let i = 0; i < elems.length; i++) {
      const v = this.evalExpr(elems[i]);
      if (hasError) return nilVal();
      vals.push(v);
    }
    return arrVal(vals);
  }

  // Pythonのinput()と同様、値の有無を事前確認せず常に1行分の入力を要求する。
  // ホスト(JS)側がまだ値を用意できない場合はhostInput()の呼び出し自体を中断し、
  // 実行全体をやり直す「リプレイ方式」で対話的な入力を実現している
  // （dist/index.html・DESIGN.md参照）。
  evalInput(n: Node): Value {
    const s = hostInput(n.str);
    if (s.length > 0) {
      const f = parseFloat(s);
      if (!isNaN(f)) return numVal(f);
    }
    return strVal(s);
  }

  evalBinop(n: Node): Value {
    const l = this.evalExpr(n.a!);
    if (hasError) return nilVal();
    const r = this.evalExpr(n.b!);
    if (hasError) return nilVal();
    const op = n.str;
    // 新仕様: 文字列は "+" で連結できる（DNCL_SPEC_SUMMARY.md 2節）
    if (op == "+" && l.kind == VK.STR && r.kind == VK.STR) {
      return strVal(l.str + r.str);
    }
    if (l.kind != VK.NUM || r.kind != VK.NUM) {
      fail("数値演算が必要です", n.line);
      return nilVal();
    }
    if (op == "+") return numVal(l.num + r.num);
    if (op == "-") return numVal(l.num - r.num);
    if (op == "*") return numVal(l.num * r.num);
    if (op == "/") {
      // Pythonの / と同様、ゼロ除算はエラーとする（未定義挙動のためPythonに準拠）
      if (r.num == 0) {
        fail("ゼロ除算です", n.line);
        return nilVal();
      }
      return numVal(l.num / r.num);
    }
    if (op == "**") return numVal(Math.pow(l.num, r.num));
    if (op == "div") {
      if (r.num == 0) {
        fail("ゼロ除算です", n.line);
        return nilVal();
      }
      return numVal(Math.floor(l.num / r.num));
    }
    if (op == "mod") {
      if (r.num == 0) {
        fail("ゼロ除算です", n.line);
        return nilVal();
      }
      return numVal(l.num - Math.floor(l.num / r.num) * r.num);
    }
    fail("不明な演算子です: " + op, n.line);
    return nilVal();
  }

  evalCmp(n: Node): Value {
    const l = this.evalExpr(n.a!);
    if (hasError) return nilVal();
    const r = this.evalExpr(n.b!);
    if (hasError) return nilVal();
    const op = n.str;
    let cmp: i32 = 0;
    if (l.kind == VK.NUM && r.kind == VK.NUM) {
      cmp = l.num < r.num ? -1 : l.num > r.num ? 1 : 0;
    } else if (l.kind == VK.STR && r.kind == VK.STR) {
      cmp = l.str < r.str ? -1 : l.str > r.str ? 1 : 0;
    } else if (l.kind == VK.BOOL && r.kind == VK.BOOL) {
      cmp = l.num < r.num ? -1 : l.num > r.num ? 1 : 0;
    } else {
      fail("比較できない値の組み合わせです", n.line);
      return nilVal();
    }
    if (op == "==") return boolVal(cmp == 0);
    if (op == "!=") return boolVal(cmp != 0);
    if (op == ">") return boolVal(cmp > 0);
    if (op == ">=") return boolVal(cmp >= 0);
    if (op == "<") return boolVal(cmp < 0);
    if (op == "<=") return boolVal(cmp <= 0);
    fail("不明な比較演算子です: " + op, n.line);
    return nilVal();
  }

  evalCall(n: Node): Value {
    const name = n.str;
    const argNodes = n.list!;
    const args: Value[] = [];
    for (let i = 0; i < argNodes.length; i++) {
      const v = this.evalExpr(argNodes[i]);
      if (hasError) return nilVal();
      args.push(v);
    }
    if (this.funcs.has(name)) return this.callUserFunc(name, args, n.line);
    return this.callBuiltin(name, args, n.line);
  }

  // 関数の戻り値は、関数名と同名のローカル変数に代入された値とする
  // （原文に明示のRETURN構文がないため、関数名を戻り値の器として使う慣例に基づく）
  callUserFunc(name: string, args: Value[], line: i32): Value {
    if (this.callStack.length > 800) {
      fail("再帰が深すぎます", line);
      return nilVal();
    }
    const def = this.funcs.get(name);
    const params = def.params!;
    const scope = new Map<string, Value>();
    for (let i = 0; i < params.length; i++) {
      scope.set(params[i], i < args.length ? args[i] : nilVal());
    }
    this.callStack.push(scope);
    this.execBlock(def.list!);
    const result = scope.has(name) ? scope.get(name) : nilVal();
    this.callStack.pop();
    return result;
  }

  callBuiltin(name: string, args: Value[], line: i32): Value {
    // 新仕様: 表示する(式, 式, ...) はカンマ区切りで連結して1行出力する（DNCL_SPEC_SUMMARY.md 7節）
    if (name == "表示する") {
      let s = "";
      for (let i = 0; i < args.length; i++) s += valueToDisplayString(args[i]);
      hostPrint(s + "\n");
      return nilVal();
    }
    // 新仕様: 要素数(配列) は配列の要素数を返す
    // 要素数(配列) は配列の要素数を返す。Pythonのlen()に倣い文字列の文字数も返せる
    if (name == "要素数") {
      if (args.length < 1) {
        fail("引数が不正です: 要素数", line);
        return nilVal();
      }
      if (args[0].kind == VK.ARR && args[0].arr != null) return numVal(args[0].arr!.length);
      if (args[0].kind == VK.STR) return numVal(args[0].str.length);
      fail("引数が不正です: 要素数", line);
      return nilVal();
    }
    // 新仕様: 整数(x) は0方向への切り捨て（Pythonのint()相当。文字列はint(str)同様に変換を試みる）
    if (name == "整数") {
      if (args.length < 1) {
        fail("引数が不正です: 整数", line);
        return nilVal();
      }
      if (args[0].kind == VK.NUM) {
        const v = args[0].num;
        return numVal(v >= 0 ? Math.floor(v) : Math.ceil(v));
      }
      if (args[0].kind == VK.STR) {
        const v = parseFloat(args[0].str);
        if (!isNaN(v)) return numVal(v >= 0 ? Math.floor(v) : Math.ceil(v));
      }
      fail("引数が不正です: 整数", line);
      return nilVal();
    }
    // 新仕様: 乱数() は0以上1未満の実数乱数を返す
    // 旧仕様: 乱数(m,n) はm以上n以下の整数乱数を返す（後方互換のため引数2個の場合に踏襲）
    if (name == "乱数") {
      if (args.length == 0) {
        return numVal(nextRandom());
      }
      if (args.length == 2 && args[0].kind == VK.NUM && args[1].kind == VK.NUM) {
        const lo = Math.min(args[0].num, args[1].num);
        const hi = Math.max(args[0].num, args[1].num);
        return numVal(lo + Math.floor(nextRandom() * (hi - lo + 1)));
      }
      fail("引数が不正です: 乱数", line);
      return nilVal();
    }
    // Pythonのmax()/min()に倣い、最大値/最小値は複数引数(最大値(1,5))・
    // 配列一つ(最大値(Data))のどちらの呼び方にも対応する
    if (name == "最大値" || name == "最小値") {
      const isMax = name == "最大値";
      let values: Value[];
      if (args.length == 1 && args[0].kind == VK.ARR && args[0].arr != null) {
        values = args[0].arr!;
      } else {
        values = args;
      }
      if (values.length < 1) {
        fail("引数が不正です: " + name, line);
        return nilVal();
      }
      if (values[0].kind != VK.NUM) {
        fail("引数が不正です: " + name, line);
        return nilVal();
      }
      let best = values[0].num;
      for (let i = 1; i < values.length; i++) {
        if (values[i].kind != VK.NUM) {
          fail("引数が不正です: " + name, line);
          return nilVal();
        }
        if (isMax ? values[i].num > best : values[i].num < best) best = values[i].num;
      }
      return numVal(best);
    }
    // 切り上げ/切り捨て/四捨五入。切り捨ては0方向ではなく負の無限大方向への
    // 切り捨て（Pythonのmath.floor()相当）とする点が整数()と異なる
    if (name == "切り上げ") {
      if (args.length < 1 || args[0].kind != VK.NUM) {
        fail("引数が不正です: 切り上げ", line);
        return nilVal();
      }
      return numVal(Math.ceil(args[0].num));
    }
    if (name == "切り捨て") {
      if (args.length < 1 || args[0].kind != VK.NUM) {
        fail("引数が不正です: 切り捨て", line);
        return nilVal();
      }
      return numVal(Math.floor(args[0].num));
    }
    if (name == "四捨五入") {
      if (args.length < 1 || args[0].kind != VK.NUM) {
        fail("引数が不正です: 四捨五入", line);
        return nilVal();
      }
      const v = args[0].num;
      return numVal(v >= 0 ? Math.floor(v + 0.5) : Math.ceil(v - 0.5));
    }
    // 以下は旧仕様の組み込み関数。新仕様には記載がないが、後方互換のため残す
    if (name == "二乗") {
      if (args.length < 1 || args[0].kind != VK.NUM) {
        fail("引数が不正です: 二乗", line);
        return nilVal();
      }
      return numVal(args[0].num * args[0].num);
    }
    if (name == "べき乗") {
      if (args.length < 2 || args[0].kind != VK.NUM || args[1].kind != VK.NUM) {
        fail("引数が不正です: べき乗", line);
        return nilVal();
      }
      return numVal(Math.pow(args[0].num, args[1].num));
    }
    if (name == "奇数") {
      if (args.length < 1 || args[0].kind != VK.NUM) {
        fail("引数が不正です: 奇数", line);
        return nilVal();
      }
      const iv = i64(Math.round(args[0].num));
      return boolVal((iv % 2 as i64) != 0);
    }
    if (name == "二進で表示する") {
      if (args.length < 1 || args[0].kind != VK.NUM) {
        fail("引数が不正です: 二進で表示する", line);
        return nilVal();
      }
      hostPrint(toBinaryString(i64(Math.round(args[0].num))) + "\n");
      return nilVal();
    }
    fail("未定義の関数です: " + name, line);
    return nilVal();
  }
}

export function runProgram(stmts: Node[], indexBase: i32 = 0): void {
  const interp = new Interpreter();
  interp.indexBase = indexBase;
  interp.runProgram(stmts);
}
