// ホスト(JS側)とのインターフェース宣言（DESIGN.md 5.4節）
@external("env", "hostPrint")
export declare function hostPrint(s: string): void;

@external("env", "hostHasInput")
export declare function hostHasInput(): bool;

@external("env", "hostInput")
export declare function hostInput(): string;

@external("env", "hostError")
export declare function hostError(message: string): void;
