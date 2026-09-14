// エクスポート・ホストimport宣言（DESIGN.md 5.4節）
import { tokenize } from "./lexer";
import { parseProgram } from "./parser";
import { runProgram as interpretProgram } from "./interpreter";
import { hasError, errorMessage, resetError } from "./errors";
import { hostError } from "./host";

export function runProgram(src: string): void {
  resetError();
  const tokens = tokenize(src);
  const stmts = parseProgram(tokens);
  if (!hasError) {
    interpretProgram(stmts);
  }
  if (hasError) {
    hostError(errorMessage);
  }
}

// 字句解析結果をJSON文字列で返す（デバッグ/字句解析結果の可視化用。DESIGN.md 5.4節）
export function tokenizeDebug(src: string): string {
  const tokens = tokenize(src);
  let s = "[";
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0) s += ",";
    const t = tokens[i];
    s +=
      '{"type":' +
      t.type.toString() +
      ',"text":' +
      jsonStr(t.text) +
      ',"num":' +
      t.num.toString() +
      ',"line":' +
      t.line.toString() +
      "}";
  }
  s += "]";
  return s;
}

function jsonStr(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c == 34) out += '\\"';
    else if (c == 92) out += "\\\\";
    else if (c == 10) out += "\\n";
    else out += String.fromCharCode(c);
  }
  out += '"';
  return out;
}
