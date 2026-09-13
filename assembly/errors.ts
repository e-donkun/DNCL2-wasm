// 構文解析・実行時エラーを例外を使わず共有するグローバルフラグ方式（DESIGN.md 5.1節）
export let hasError: bool = false;
export let errorMessage: string = "";

export function fail(msg: string, line: i32): void {
  if (!hasError) {
    hasError = true;
    errorMessage = msg + " (line " + line.toString() + ")";
  }
}

export function resetError(): void {
  hasError = false;
  errorMessage = "";
}
