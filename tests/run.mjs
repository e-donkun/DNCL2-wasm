// Node.js用の単体テスト（@assemblyscript/loaderでdebugビルドのwasmを読み込んで実行する）
// 2022年11月改訂の新DNCL（共通テスト用プログラム表記）を中心に、
// 後方互換として残した旧DNCLの構文もあわせて検証する。
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
  const prompts = [];
  const queue = (inputs || []).slice();
  let ex;
  const { exports } = await instantiate(wasmBuffer, {
    env: {
      hostPrint(ptr) {
        output += ex.__getString(ptr);
      },
      hostInput(promptPtr) {
        prompts.push(ex.__getString(promptPtr));
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
  return { output, error, prompts };
}

const tests = [];
function test(name, src, expected, opts) {
  tests.push({ name, src, expected, opts: opts || {} });
}

// ---- 新仕様: 代入・算術・文字列 ----

test(
  "1: 代入と算術演算（**含む）",
  `
kosu = 3 , kingaku = 300
kingaku_goukei = kingaku * kosu
表示する(kingaku_goukei)
表示する(2 ** 10)
表示する(7 ÷ 2)
表示する(7 % 2)
`,
  "900\n1024\n3\n1\n"
);

test(
  "2: 文字列の連結",
  `
message = "祇園精舎の" + "鐘の声"
表示する(message)
`,
  "祇園精舎の鐘の声\n"
);

test(
  "3: 配列リテラルと表示する()のカンマ連結",
  `
Data = [10,20,30,40,50,60]
表示する(要素数(Data))
表示する(Data[0],"と",Data[5])
`,
  "6\n10と60\n"
);

test(
  "4: 配列のすべての値を書き換える",
  `
A = [1,2,3]
Aのすべての値を0にする
表示する(A[0],A[1],A[2])
`,
  "000\n"
);

test(
  "5: 比較演算子",
  `
表示する(1==1, 1!=2, 3>2, 2>=2, 1<2, 2<=2)
`,
  "真真真真真真\n"
);

// ---- 新仕様: 論理演算子の優先順位（not > and > or、PDFに明記なしのため標準的な優先順位を採用）----

test(
  "6a: not は and より強く結合する",
  `
a = (1==2)
b = (1==2)
表示する(not a and b)
`,
  "偽\n" // (not a) and b = 真 and 偽 = 偽。もし not(a and b) なら 真になり結果が変わる
);

test(
  "6b: and は or より強く結合する",
  `
a = (1==1)
b = (1==2)
c = (1==2)
表示する(a or b and c)
`,
  "真\n" // a or (b and c) = 真 or 偽 = 真。旧仕様のような左結合(a or b) and c なら 偽になる
);

// ---- 新仕様: 制御文（if/elif/else、コロン+インデント）----

test(
  "7: if/elif/elseブロック",
  `
x = 5
もし x < 3 ならば:
    y = 1
そうでなくもし x < 10 ならば:
    y = 2
そうでなければ:
    y = 3
表示する(y)
`,
  "2\n"
);

// ---- 新仕様: 順次繰返し文（for、コロン+インデント）----

test(
  "8: forループと配列の合計",
  `
Data = [10,20,30,40,50]
goukei = 0
x を 0 から 4 まで 1 ずつ増やしながら繰り返す:
    goukei = goukei + Data[x]
表示する(goukei)
`,
  "150\n"
);

// ---- 新仕様: 条件繰返し文（while、コロン+インデント）----

test(
  "9: whileループ",
  `
n = 0
goukei = 0
n < 10 の間繰り返す:
    goukei = goukei + n
    n = n + 1
表示する(goukei)
`,
  "45\n"
);

// ---- 新仕様: 外部入力 ----

test(
  "10: 外部からの入力",
  `
v =【外部からの入力】
表示する(v)
`,
  "99\n",
  { inputs: ["99"] }
);

// ---- PDF記載の共通テスト用プログラム表記例（二分探索）をそのまま検証 ----

const BINARY_SEARCH = `
Data=[3,18,29,33,48,52,62,77,89,97]
kazu=要素数(Data)
表示する("0～99の数字を入力してください")
atai=【外部からの入力】
hidari=0 , migi=kazu-1
owari=0
hidari <= migi and owari==0 の間繰り返す:
    aida=(hidari+migi)÷2
    もし Data[aida]==atai ならば:
        表示する(atai,"は",aida,"番目にありました")
        owari=1
    そうでなくもし Data[aida]<atai ならば:
        hidari=aida+1
    そうでなければ:
        migi=aida-1
もし owari==0 ならば:
    表示する(atai,"は見つかりませんでした")
`;

test(
  "11a: 公式サンプル(二分探索) 発見できる場合",
  BINARY_SEARCH,
  "0～99の数字を入力してください\n52は5番目にありました\n",
  { inputs: ["52"] }
);

test(
  "11b: 公式サンプル(二分探索) 発見できない場合",
  BINARY_SEARCH,
  "0～99の数字を入力してください\n85は見つかりませんでした\n",
  { inputs: ["85"] }
);

// ---- 後方互換: 旧仕様の記法も引き続き動作すること ----

test(
  "12: 旧仕様の代入(←)・配列リテラル({})",
  `
A ← {1,2,3}
表示する(A[0])
`,
  "1\n"
);

test(
  "13: 旧仕様の if...を実行する 閉じ語スタイル（コロンなし）",
  `
もし not (1==2) ならば
    表示する("ok")
を実行する
`,
  "ok\n" // not(1==2) = not 偽 = 真
);

test(
  "14: 旧仕様の関数定義(関数...と定義する)",
  `
関数 wa(n) を
    goukei ← 0
    i を 1 から n まで 1 ずつ増やしながら，
        goukei ← goukei + i
    を繰り返す
    wa ← goukei
と定義する
表示する(wa(5))
`,
  "15\n"
);

test(
  "15: 旧仕様の後判定ループ(繰り返し,...になるまで実行する)",
  `
j ← 1
seki ← 1
繰り返し，
    seki ← seki × j
    j ← j + 1
を，j > 5 になるまで実行する
表示する(seki)
`,
  "120\n"
);

// ---- Python3への準拠（未定義挙動の実装判断） ----

test(
  "16: 真偽判定は文字列・配列も長さで判定する(Pythonのbool()相当)",
  `
もし "" ならば:
    表示する("空文字は真")
そうでなければ:
    表示する("空文字は偽")
もし [] ならば:
    表示する("空配列は真")
そうでなければ:
    表示する("空配列は偽")
もし "a" ならば:
    表示する("非空文字は真")
`,
  "空文字は偽\n空配列は偽\n非空文字は真\n"
);

test(
  "17: andは左辺が偽なら右辺を評価しない(短絡評価)",
  `
関数 inc() を
    表示する("called")
    inc ← 真
と定義する
kekka = (1==2) and inc()
表示する(kekka)
`,
  "偽\n"
);

test(
  "18: 文字列に対する添字アクセス(Pythonの文字列インデックス相当)",
  `
s = "hello"
表示する(s[0], s[4])
表示する(要素数(s))
`,
  "ho\n5\n"
);

test(
  "19: 0除算はエラーになる(Pythonのゼロ除算例外相当)",
  `
表示する(1/0)
`,
  null,
  { expectError: true }
);

test(
  "20a: 最大値/最小値（引数2つ）",
  `
表示する(最大値(1, 5), 最小値(1, 5))
表示する(最大値(2, 2))
`,
  "51\n2\n"
);

test(
  "20b: 最大値/最小値（配列1つ）",
  `
Data = [3, 7, 2, 9, 4]
表示する(最大値(Data), 最小値(Data))
`,
  "92\n"
);

test(
  "21: 切り上げ/切り捨て/四捨五入",
  `
表示する(切り上げ(3.1), 切り捨て(3.9), 四捨五入(3.5))
表示する(切り上げ(-3.1), 切り捨て(-3.1), 四捨五入(-3.5))
`,
  "434\n-3-4-4\n"
);

test(
  "22: 【外部からの入力】のプロンプトがホストに渡される",
  `
namae =【外部からの入力】
表示する(namae)
`,
  "太郎\n",
  { inputs: ["太郎"], expectPrompts: ["外部からの入力"] }
);

async function main() {
  let pass = 0;
  let fail = 0;
  for (const t of tests) {
    try {
      const { output, error, prompts } = await runDncl(t.src, t.opts.inputs);
      if (t.opts.expectError) {
        if (error) {
          console.log(`PASS ${t.name}`);
          pass++;
        } else {
          console.log(`FAIL ${t.name}: エラーになるはずが正常終了しました（出力: ${JSON.stringify(output)}）`);
          fail++;
        }
        continue;
      }
      if (error) {
        console.log(`FAIL ${t.name}: 実行時エラー: ${error}`);
        fail++;
        continue;
      }
      if (t.opts.expectPrompts && JSON.stringify(prompts) !== JSON.stringify(t.opts.expectPrompts)) {
        console.log(`FAIL ${t.name}`);
        console.log(`  期待プロンプト: ${JSON.stringify(t.opts.expectPrompts)}`);
        console.log(`  実際プロンプト: ${JSON.stringify(prompts)}`);
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
