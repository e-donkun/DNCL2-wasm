// ホスト(JS側)とのインターフェース宣言（DESIGN.md 5.4節）
@external("env", "hostPrint")
export declare function hostPrint(s: string): void;

// promptはPythonのinput(prompt)と同様、入力欄の前に表示する文言
@external("env", "hostInput")
export declare function hostInput(prompt: string): string;

@external("env", "hostError")
export declare function hostError(message: string): void;
