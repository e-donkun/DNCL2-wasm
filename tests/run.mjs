// Node.js用の単体テスト（@assemblyscript/loaderでdebugビルドのwasmを読み込んで実行する）
import { instantiate } from "@assemblyscript/loader";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wasmPath = path.join(__dirname, "..", "build", "dncl.debug.wasm");
const wasmBuffer = readFileSync(wasmPath);

// 1回の実行ごとに新しくinstantiateしてテスト間の状態を分離する
async function runDncl(src, inputs) {
  let output = "";
  let error = null;
  const queue = (inputs || []).slice();
  let ex;
  const { exports } = await instantiate(wasmBuffer, {
    env: {
      hostPrint(ptr) {
        output += ex.__getString(ptr);
      },
      hostHasInput() {
        return queue.length > 0;
      },
      hostInput() {
        const v = queue.length > 0 ? queue.shift() : "";
        return ex.__newString(v);
      },
      hostError(ptr) {
        error = ex.__getString(ptr);
      }
    }
  });
  ex = exports;
  ex.runProgram(ex.__newString(src));
  return { output, error };
}

const tests = [];
function test(name, src, expected, opts) {
  tests.push({ name, src, expected, opts: opts || {} });
}

// 1. 1からnまでの和を表示する関数を定義して呼び出す
test(
  "1: 1からnまでの和",
  `
関数 wa(n) を
    goukei ← 0
    i を 1 から n まで 1 ずつ増やしながら，
        goukei ← goukei + i
    を繰り返す
    wa ← goukei
と定義する
wa(5) を表示する
`,
  "15\n"
);

// 2. べき乗を求める関数（ループ版）を定義して呼び出す
test(
  "2: べき乗（ループ版）",
  `
関数 power(m, n) を
    kekka ← 1
    i を 1 から n まで 1 ずつ増やしながら，
        kekka ← kekka × m
    を繰り返す
    power ← kekka
と定義する
power(2, 10) を表示する
`,
  "1024\n"
);

// 3. 配列に対する順次繰返し文（合計・最大値探索）
test(
  "3: 配列の合計・最大値",
  `
Data ← {3, 7, 2, 9, 4}
goukei ← 0
saidai ← Data[0]
i を 0 から 4 まで 1 ずつ増やしながら，
    goukei ← goukei + Data[i]
    もし Data[i] > saidai ならば saidai ← Data[i] を実行する
を繰り返す
goukei を表示する
saidai を表示する
`,
  "25\n9\n"
);

// 4. if / elif / else の分岐（複数行形式）
test(
  "4a: if/elif/else（複数行）",
  `
x ← 5
もし x > 10 ならば
    "big" を表示する
を実行し，そうでなくもし x > 0 ならば
    "small positive" を表示する
を実行し，そうでなければ
    "non positive" を表示する
を実行する
`,
  "small positive\n"
);

// 4. if / else の分岐（単一行形式）
test(
  "4b: if/else（単一行）",
  `
y ← -3
もし y > 0 ならば "pos" を表示する を実行し，そうでなければ "non-pos" を表示する を実行する
`,
  "non-pos\n"
);

// 5. 前判定ループ（while）
test(
  "5a: 前判定ループ",
  `
i ← 1
goukei ← 0
i <= 5 の間，
    goukei ← goukei + i
    i ← i + 1
を繰り返す
goukei を表示する
`,
  "15\n"
);

// 5. 後判定ループ（do-while、5の階乗）
test(
  "5b: 後判定ループ",
  `
j ← 1
seki ← 1
繰り返し，
    seki ← seki × j
    j ← j + 1
を，j > 5 になるまで実行する
seki を表示する
`,
  "120\n"
);

// 6. 論理演算子の左結合評価順 (A かつ B) でない ≠ A かつ (B でない)
test("6a: A かつ B でない の左結合", `偽 かつ 偽 でない を表示する\n`, "真\n");

// 6. 論理演算子の左結合評価順 (A かつ B) または C ≠ A かつ (B または C)
test("6b: A かつ B または C の左結合", `偽 かつ 真 または 真 を表示する\n`, "真\n");

// 追加: 配列要素への代入、増減の糖衣構文、外部入力
test(
  "7: 配列要素への代入・増減構文・外部入力",
  `
A ← {0, 0, 0}
A[1] ← 42
kosu ← 10
kosu を 5 増やす
kosu を 3 減らす
v ←【外部からの入力】
A[1] を表示する
kosu を表示する
v を表示する
`,
  "42\n12\nhello\n",
  { inputs: ["hello"] }
);

// 追加: 数値の整数表示（小数点なし）
test("8: 数値の整数表示", `(3 + 4) × 2 を表示する\n`, "14\n");

async function main() {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      const { output, error } = await runDncl(t.src, t.opts.inputs);
      if (error) {
        console.log(`FAIL ${t.name}: 実行時エラー: ${error}`);
        fail++;
        continue;
      }
      if (output === t.expected) {
        console.log(`PASS ${t.name}`);
        pass++;
      } else {
        console.log(`FAIL ${t.name}`);
        console.log(`  期待値: ${JSON.stringify(t.expected)}`);
        console.log(`  実際値: ${JSON.stringify(output)}`);
        fail++;
      }
    } catch (e) {
      console.log(`FAIL ${t.name}: 例外: ${e && e.stack ? e.stack : e}`);
      fail++;
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main();
