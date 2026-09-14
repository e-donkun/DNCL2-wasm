// build/dncl.wasmをbase64化し、外部fetchなしの単一HTMLファイルに埋め込む（DESIGN.md 6節）
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const wasmPath = path.join(rootDir, "build", "dncl.wasm");
const outDir = path.join(rootDir, "dist");
const outPath = path.join(outDir, "index.html");

const wasmBase64 = readFileSync(wasmPath).toString("base64");

const SAMPLE_PROGRAM = `# 1からnまでの和を表示する関数を定義して呼び出す例
関数 wa(n) を
    goukei ← 0
    i を 1 から n まで 1 ずつ増やしながら，
        goukei ← goukei + i
    を繰り返す
    wa ← goukei
と定義する

wa(10) を表示する

# 配列と条件分岐の例
Data ← {3, 7, 2, 9, 4}
saidai ← Data[0]
i を 0 から 4 まで 1 ずつ増やしながら，
    もし Data[i] > saidai ならば
        saidai ← Data[i]
    を実行する
を繰り返す
"saidai = " を表示する
saidai を表示する
`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DNCL → WebAssembly コンソール</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f7;
    --panel-bg: #ffffff;
    --text: #1d1d1f;
    --muted: #6e6e73;
    --border: #d2d2d7;
    --accent: #0071e3;
    --accent-text: #ffffff;
    --console-bg: #1e1e1e;
    --console-text: #d4d4d4;
    --error-bg: #fdecea;
    --error-text: #b3261e;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1c1e;
      --panel-bg: #2c2c2e;
      --text: #f5f5f7;
      --muted: #a1a1a6;
      --border: #48484a;
      --console-bg: #000000;
      --console-text: #d4d4d4;
      --error-bg: #3a1f1d;
      --error-text: #ff6b60;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif;
    padding: 16px;
  }
  h1 {
    font-size: 1.25rem;
    margin: 0 0 4px;
  }
  .subtitle {
    color: var(--muted);
    font-size: 0.85rem;
    margin: 0 0 16px;
  }
  .layout {
    display: grid;
    grid-template-columns: 1fr;
    gap: 16px;
    max-width: 1100px;
    margin: 0 auto;
  }
  @media (min-width: 900px) {
    .layout { grid-template-columns: 1fr 1fr; }
  }
  .panel {
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 12px;
  }
  .panel h2 {
    font-size: 0.95rem;
    margin: 0 0 8px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.85rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-bg);
    color: var(--text);
    padding: 8px;
    resize: vertical;
  }
  #src { height: 320px; }
  #inputQueue { height: 80px; }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0;
  }
  button {
    font-size: 0.85rem;
    padding: 8px 14px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--panel-bg);
    color: var(--text);
    cursor: pointer;
  }
  button.primary {
    background: var(--accent);
    color: var(--accent-text);
    border-color: var(--accent);
  }
  button:hover { filter: brightness(0.95); }
  #output {
    background: var(--console-bg);
    color: var(--console-text);
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.85rem;
    min-height: 200px;
    max-height: 420px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    border-radius: 8px;
    padding: 10px;
  }
  #errorBox {
    display: none;
    margin-top: 8px;
    background: var(--error-bg);
    color: var(--error-text);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 0.85rem;
    white-space: pre-wrap;
  }
  #tokenPanel { display: none; margin-top: 12px; }
  table.tokens {
    width: 100%;
    border-collapse: collapse;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.78rem;
  }
  table.tokens th, table.tokens td {
    border: 1px solid var(--border);
    padding: 4px 6px;
    text-align: left;
  }
  table.tokens th { color: var(--muted); }
  .hint { color: var(--muted); font-size: 0.78rem; margin-top: 6px; }
  footer { text-align: center; color: var(--muted); font-size: 0.75rem; margin-top: 20px; }
</style>
</head>
<body>
<h1>DNCL → WebAssembly コンソール</h1>
<p class="subtitle">共通テスト手順記述標準言語（DNCL）をブラウザ上のWebAssemblyで実行します。外部ネットワークへは一切アクセスしません。</p>
<div class="layout">
  <div class="panel">
    <h2>ソースコード</h2>
    <textarea id="src" spellcheck="false"></textarea>
    <div class="buttons">
      <button class="primary" id="runBtn">実行</button>
      <button id="clearOutputBtn">出力をクリア</button>
      <button id="showTokensBtn">トークン一覧を表示</button>
    </div>
    <h2>外部からの入力（【外部からの入力】用・1行1値）</h2>
    <textarea id="inputQueue" spellcheck="false" placeholder="1行に1つずつ値を入力してください"></textarea>
    <p class="hint"># から行末まではコメントとして無視されます。全角・半角の記号どちらも使用できます。</p>
  </div>
  <div class="panel">
    <h2>出力</h2>
    <div id="output"></div>
    <div id="errorBox"></div>
    <div id="tokenPanel">
      <h2>トークン一覧</h2>
      <div style="overflow-x:auto">
        <table class="tokens" id="tokenTable">
          <thead><tr><th>#</th><th>種別</th><th>テキスト</th><th>数値</th><th>行</th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  </div>
</div>
<footer>DNCL → WebAssembly コンソール（AssemblyScriptでビルド、単一HTMLファイル・外部fetchなし）</footer>
<script>
"use strict";

// ==== base64エンコードされたWASMバイナリ（ビルド成果物。外部fetchは行わない） ====
const WASM_BASE64 = "${wasmBase64}";

// ==== 文字列マーシャリング用の最小限のグルーコード ====
// @assemblyscript/loaderのdemangle対象部分を、単一HTML用に手書きで再実装したもの。
const SIZE_OFFSET = -4;
const STRING_ID = 2;

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let memory = null;
let __new = null;
let wasmExports = null;

function newString(str) {
  const length = str.length;
  const ptr = __new(length << 1, STRING_ID);
  const U16 = new Uint16Array(memory.buffer);
  for (let i = 0, p = ptr >>> 1; i < length; ++i) U16[p + i] = str.charCodeAt(i);
  return ptr;
}

function getString(ptr) {
  if (!ptr) return "";
  const buffer = memory.buffer;
  const len = new Uint32Array(buffer)[(ptr + SIZE_OFFSET) >>> 2] >>> 1;
  const arr = new Uint16Array(buffer, ptr, len);
  let s = "";
  const CHUNK = 4096;
  for (let i = 0; i < len; i += CHUNK) {
    s += String.fromCharCode.apply(null, arr.subarray(i, Math.min(i + CHUNK, len)));
  }
  return s;
}

// ==== ホスト実装（DESIGN.md 5.4節） ====
let currentInputQueue = [];
let outputEl, errorBoxEl;

function hostPrintImpl(ptr) {
  outputEl.append(document.createTextNode(getString(ptr)));
  outputEl.scrollTop = outputEl.scrollHeight;
}
function hostHasInputImpl() {
  return currentInputQueue.length > 0;
}
function hostInputImpl() {
  const v = currentInputQueue.length > 0 ? currentInputQueue.shift() : "";
  return newString(v);
}
function hostErrorImpl(ptr) {
  errorBoxEl.textContent = getString(ptr);
  errorBoxEl.style.display = "block";
}

const TT_NAMES = [
  "NUMBER", "STRING", "IDENT", "WORD", "NEWLINE",
  "LPAREN", "RPAREN", "LBRACKET", "RBRACKET", "LBRACE", "RBRACE",
  "LINPUT", "RINPUT", "COMMA", "ARROW",
  "PLUS", "MINUS", "MUL", "DIV", "IDIV", "MOD",
  "EQ", "NEQ", "GT", "GE", "LT", "LE", "EOF"
];

async function initWasm() {
  const bytes = base64ToBytes(WASM_BASE64);
  const importsObj = {
    env: {
      abort(msgPtr, filePtr, line, column) {
        throw new Error("abort: " + getString(msgPtr) + " at " + getString(filePtr) + ":" + line + ":" + column);
      },
      seed() { return Date.now(); },
      hostPrint: (ptr) => hostPrintImpl(ptr),
      hostHasInput: () => hostHasInputImpl(),
      hostInput: () => hostInputImpl(),
      hostError: (ptr) => hostErrorImpl(ptr)
    }
  };
  const { instance } = await WebAssembly.instantiate(bytes, importsObj);
  memory = instance.exports.memory;
  __new = instance.exports.__new;
  wasmExports = instance.exports;
}

function run() {
  const src = document.getElementById("src").value;
  outputEl.textContent = "";
  errorBoxEl.style.display = "none";
  errorBoxEl.textContent = "";
  currentInputQueue = document.getElementById("inputQueue").value.split("\\n").filter((s) => s.length > 0);
  try {
    wasmExports.runProgram(newString(src));
  } catch (e) {
    errorBoxEl.textContent = "内部エラー: " + (e && e.message ? e.message : String(e));
    errorBoxEl.style.display = "block";
  }
}

function showTokens() {
  const src = document.getElementById("src").value;
  const jsonPtr = wasmExports.tokenizeDebug(newString(src));
  const tokens = JSON.parse(getString(jsonPtr));
  const tbody = document.querySelector("#tokenTable tbody");
  tbody.innerHTML = "";
  tokens.forEach((t, i) => {
    const tr = document.createElement("tr");
    const typeName = TT_NAMES[t.type] || String(t.type);
    tr.innerHTML =
      "<td>" + i + "</td>" +
      "<td>" + typeName + "</td>" +
      "<td>" + escapeHtml(t.text) + "</td>" +
      "<td>" + t.num + "</td>" +
      "<td>" + t.line + "</td>";
    tbody.appendChild(tr);
  });
  document.getElementById("tokenPanel").style.display = "block";
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.addEventListener("DOMContentLoaded", () => {
  outputEl = document.getElementById("output");
  errorBoxEl = document.getElementById("errorBox");
  document.getElementById("src").value = ${JSON.stringify(SAMPLE_PROGRAM)};
  document.getElementById("runBtn").addEventListener("click", run);
  document.getElementById("clearOutputBtn").addEventListener("click", () => {
    outputEl.textContent = "";
    errorBoxEl.style.display = "none";
  });
  document.getElementById("showTokensBtn").addEventListener("click", showTokens);
  initWasm().catch((e) => {
    errorBoxEl.textContent = "WASM初期化エラー: " + (e && e.message ? e.message : String(e));
    errorBoxEl.style.display = "block";
  });
});
</script>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html, "utf-8");
console.log("wrote " + outPath + " (" + (html.length / 1024).toFixed(1) + " KB)");
