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
const qrcodeLibJs = readFileSync(path.join(rootDir, "vendor", "qrcode-generator.js"), "utf-8");

const SAMPLE_PROGRAM = `# 共通テスト用プログラム表記（2022年11月改訂・新仕様）の例
# 配列から最大値を探す
Data = [3, 7, 2, 9, 4]
saidai = Data[0]
i を 0 から 4 まで 1 ずつ増やしながら繰り返す:
    もし Data[i] > saidai ならば:
        saidai = Data[i]
表示する("saidai = ", saidai)

# べき乗演算子と整数への切り捨て
表示する("2 ** 10 = ", 2 ** 10)
表示する("整数(3.9) = ", 整数(3.9))

# 論理演算子 and/or/not（優先順位は not > and > or）
a = (1 == 1)
b = (1 == 2)
表示する("a or b and (not b) = ", a or b and (not b))

# 外部からの入力（Pythonのinput()のように、この場でその場で入力できます）
namae =【外部からの入力】
表示する("こんにちは、", namae, "さん")
`;

const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DNCL2実行環境</title>
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
    --gutter-bg: #f0f0f2;
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
      --gutter-bg: #232325;
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
  .code-mono {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.85rem;
    line-height: 1.5;
    tab-size: 4;
  }
  /* ---- ソースコードエディタ（行番号ガター + インデントガイド） ---- */
  .editor {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
    height: 340px;
  }
  .line-numbers {
    flex: 0 0 auto;
    padding: 8px 6px 8px 8px;
    text-align: right;
    color: var(--muted);
    background: var(--gutter-bg);
    overflow: hidden;
    white-space: pre;
    user-select: none;
  }
  #src {
    flex: 1 1 auto;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border: none;
    border-left: 1px solid var(--border);
    border-radius: 0;
    background: var(--panel-bg);
    color: var(--text);
    padding: 8px;
    resize: none;
    white-space: pre;
    overflow: auto;
  }
  #src:focus { outline: none; }
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
  button:disabled { opacity: 0.5; cursor: default; }
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
  .inline-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--console-text);
    color: var(--console-text);
    font-family: inherit;
    font-size: inherit;
    outline: none;
    min-width: 4ch;
    width: 16ch;
    max-width: 100%;
    padding: 0 2px;
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
  #sharePanel { display: none; margin-top: 10px; }
  .share-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  #shareUrlInput {
    flex: 1 1 auto;
    min-width: 0;
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.78rem;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: var(--panel-bg);
    color: var(--text);
  }
  .qr-wrap {
    display: inline-block;
    margin-top: 8px;
    padding: 8px;
    background: #ffffff;
    border-radius: 8px;
    line-height: 0;
  }
  .qr-wrap svg { display: block; width: 128px; height: 128px; }
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
  footer a { color: var(--muted); }
</style>
</head>
<body>
<h1>DNCL2実行環境</h1>
<p class="subtitle">大学入学共通テスト用プログラム表記(DNCL2)をブラウザ上で実行します。外部ネットワークへは一切アクセスしません。</p>
<div class="layout">
  <div class="panel">
    <h2>ソースコード</h2>
    <div class="editor">
      <div id="lineNumbers" class="line-numbers code-mono">1</div>
      <textarea id="src" class="code-mono" spellcheck="false"></textarea>
    </div>
    <div class="buttons">
      <button class="primary" id="runBtn">実行</button>
      <button id="showTokensBtn" hidden>トークン一覧を表示</button>
      <button id="shareBtn">共有URL/QRコードを作成</button>
    </div>
    <div id="sharePanel">
      <div class="share-row">
        <input type="text" id="shareUrlInput" readonly>
        <button id="copyShareUrlBtn">コピー</button>
      </div>
      <div class="qr-wrap"><div id="qrContainer"></div></div>
    </div>
    <p class="hint"><a href="about.html">使い方・このツールについて</a></p>
  </div>
  <div class="panel">
    <h2>出力</h2>
    <div id="output" class="code-mono"></div>
    <div class="buttons">
      <button id="clearOutputBtn">出力をクリア</button>
    </div>
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
<footer>Copyright (c) 2026 <a href="https://github.com/e-donkun">Jun Suzuki</a></footer>
<script>
// ==== QRコード生成ライブラリ（vendor/qrcode-generator.js。MIT, Copyright (c) 2009 Kazuhiko Arase） ====
${qrcodeLibJs}
</script>
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

// ==== 共有URL（ソースコードをURLの#以降に埋め込む） ====
//
// ソースコードをUTF-8バイト列にしてから生Deflate（zlib/gzipヘッダなしのDEFLATE、
// ブラウザ標準のCompressionStream/DecompressionStreamの"deflate-raw"）で圧縮し、
// base64url（+/ の代わりに -_ を使い、パディング=を省略したもの）にエンコードして
// URLフラグメント（#以降）に格納する。フラグメントは外部サーバーに送信されないため、
// 「外部URLへは一切アクセスしない」という方針とも矛盾しない。
const HAS_COMPRESSION_STREAM = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(str) {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function compressToBase64Url(text) {
  const data = new TextEncoder().encode(text);
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const compressed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
  return bytesToBase64Url(compressed);
}

async function decompressFromBase64Url(hash) {
  const bytes = base64UrlToBytes(hash);
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

function renderQrCode(container, text) {
  container.innerHTML = "";
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  container.innerHTML = qr.createSvgTag(4, 4);
}

// GitHub Pagesなどhttp(s)配信ではディレクトリ直下のindex.htmlが自動解決されるため、
// URLを短くするために末尾のindex.htmlは省く（file://で直接開いた場合は
// ディレクトリの自動解決がされないため省略しない）。
function shareBaseUrl() {
  let pathname = location.pathname;
  if (location.protocol !== "file:") {
    pathname = pathname.replace(/index\.html$/, "");
  }
  return location.origin + pathname;
}

async function showShareUrl(srcEl, sharePanelEl, shareUrlInputEl, qrContainerEl) {
  if (!HAS_COMPRESSION_STREAM) {
    errorBoxEl.textContent = "このブラウザは共有URLの生成に必要なCompressionStream APIに対応していません。";
    errorBoxEl.style.display = "block";
    return;
  }
  const hash = await compressToBase64Url(srcEl.value);
  const url = shareBaseUrl() + "#" + hash;
  history.replaceState(null, "", "#" + hash);
  shareUrlInputEl.value = url;
  sharePanelEl.style.display = "block";
  renderQrCode(qrContainerEl, url);
}

// ==== インタラクティブな【外部からの入力】（Pythonのinput()風のUX） ====
//
// WASM側のrunProgram()は完全に同期実行であり、実行を途中で一時停止して
// 「ユーザーが出力欄に入力し終えるまで待つ」ことはできない。そこで、
// 「まだ答えていない入力が必要になったら、そこで例外を投げて実行全体を中断し、
// ユーザーが入力欄で入力してEnterを押したら、既に得られた回答をすべて
// 使い回しながら最初から実行し直す」というリプレイ方式で対話的な入力を実現する。
// 同じ回答を使う限りプログラムは決定的に同じところまで再現されるはずだが、
// 乱数()だけは例外なので、1回の実行セッション中は同じ乱数シードを使い回すことで
// 再実行のたびに結果が変わらないようにしている（assembly/interpreter.ts参照）。
class NeedInputSignal {}

let sourceCode = "";
let answeredInputs = [];
let inputCallIndex = 0;
let runSeed = 0;
let roundOutput = "";
let flushedLength = 0;

// ==== ホスト実装（DESIGN.md 5.4節） ====
let outputEl, errorBoxEl, runBtnEl;

function hostPrintImpl(ptr) {
  roundOutput += getString(ptr);
}
function hostInputImpl() {
  if (inputCallIndex < answeredInputs.length) {
    return newString(answeredInputs[inputCallIndex++]);
  }
  throw new NeedInputSignal();
}
function hostErrorImpl(ptr) {
  errorBoxEl.textContent = getString(ptr);
  errorBoxEl.style.display = "block";
}

const TT_NAMES = [
  "NUMBER", "STRING", "IDENT", "WORD", "NEWLINE",
  "LPAREN", "RPAREN", "LBRACKET", "RBRACKET", "LBRACE", "RBRACE",
  "LINPUT", "RINPUT", "COMMA", "ASSIGN",
  "PLUS", "MINUS", "MUL", "DIV", "IDIV", "MOD",
  "EQ", "NEQ", "GT", "GE", "LT", "LE",
  "POW", "COLON", "INDENT", "DEDENT", "EOF"
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
      hostInput: () => hostInputImpl(),
      hostError: (ptr) => hostErrorImpl(ptr)
    }
  };
  const { instance } = await WebAssembly.instantiate(bytes, importsObj);
  memory = instance.exports.memory;
  __new = instance.exports.__new;
  wasmExports = instance.exports;
}

function setRunning(isRunning) {
  runBtnEl.disabled = isRunning;
}

function flushNewOutput() {
  const newText = roundOutput.slice(flushedLength);
  flushedLength = roundOutput.length;
  if (newText.length > 0) {
    outputEl.appendChild(document.createTextNode(newText));
    outputEl.scrollTop = outputEl.scrollHeight;
  }
}

function run() {
  sourceCode = document.getElementById("src").value;
  outputEl.textContent = "";
  errorBoxEl.style.display = "none";
  errorBoxEl.textContent = "";
  answeredInputs = [];
  flushedLength = 0;
  runSeed = (Math.random() * 0xffffffff) >>> 0;
  setRunning(true);
  executeRound();
}

// 【外部からの入力】の入力待ち中（インラインの<input>が出力欄に挿入されている状態）に
// 出力をクリアすると、その<input>ごと消えてしまい、Enterを押しても実行が再開されず
// 「実行」ボタンも無効のまま固まってしまう。それを防ぐため、単に表示を消すだけでなく
// 実行状態（応答済み入力・シード・実行ボタンの有効/無効）も含めて完全にリセットする。
function clearOutput() {
  outputEl.textContent = "";
  errorBoxEl.style.display = "none";
  errorBoxEl.textContent = "";
  answeredInputs = [];
  inputCallIndex = 0;
  roundOutput = "";
  flushedLength = 0;
  setRunning(false);
}

function executeRound() {
  roundOutput = "";
  inputCallIndex = 0;
  wasmExports.seedRandom(runSeed);
  let needInput = false;
  try {
    wasmExports.runProgram(newString(sourceCode));
  } catch (e) {
    if (e instanceof NeedInputSignal) {
      needInput = true;
    } else {
      flushNewOutput();
      errorBoxEl.textContent = "内部エラー: " + (e && e.message ? e.message : String(e));
      errorBoxEl.style.display = "block";
      setRunning(false);
      return;
    }
  }
  flushNewOutput();
  if (needInput) {
    showInlinePrompt();
  } else {
    setRunning(false);
  }
}

function showInlinePrompt() {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "inline-input";
  input.autocomplete = "off";
  input.spellcheck = false;
  outputEl.appendChild(input);
  outputEl.scrollTop = outputEl.scrollHeight;
  input.focus();
  input.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter") return;
    ev.preventDefault();
    const value = input.value;
    outputEl.replaceChild(document.createTextNode(value + "\\n"), input);
    answeredInputs.push(value);
    executeRound();
  });
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

// ==== エディタの行番号ガター ====
function updateLineNumbers() {
  const src = document.getElementById("src");
  const lineNumbersEl = document.getElementById("lineNumbers");
  const lineCount = src.value.split("\\n").length;
  const lines = new Array(lineCount);
  for (let i = 0; i < lineCount; i++) lines[i] = i + 1;
  lineNumbersEl.textContent = lines.join("\\n");
}

window.addEventListener("DOMContentLoaded", async () => {
  outputEl = document.getElementById("output");
  errorBoxEl = document.getElementById("errorBox");
  runBtnEl = document.getElementById("runBtn");
  const srcEl = document.getElementById("src");
  const lineNumbersEl = document.getElementById("lineNumbers");
  const sharePanelEl = document.getElementById("sharePanel");
  const shareUrlInputEl = document.getElementById("shareUrlInput");
  const qrContainerEl = document.getElementById("qrContainer");

  // URLの#以降に共有用のソースコードが埋め込まれていれば、それを初期値にする
  let initialSource = null;
  const hash = location.hash.replace(/^#/, "");
  if (hash && HAS_COMPRESSION_STREAM) {
    try {
      initialSource = await decompressFromBase64Url(hash);
    } catch (e) {
      console.error("Failed to restore source code from URL", e);
    }
  }
  srcEl.value = initialSource !== null ? initialSource : ${JSON.stringify(SAMPLE_PROGRAM)};
  updateLineNumbers();
  srcEl.addEventListener("input", updateLineNumbers);
  srcEl.addEventListener("scroll", () => {
    lineNumbersEl.scrollTop = srcEl.scrollTop;
  });
  // タブキーでインデント（半角スペース4個）を挿入できるようにする
  srcEl.addEventListener("keydown", (ev) => {
    if (ev.key !== "Tab") return;
    ev.preventDefault();
    const start = srcEl.selectionStart;
    const end = srcEl.selectionEnd;
    srcEl.setRangeText("    ", start, end, "end");
    updateLineNumbers();
  });

  runBtnEl.addEventListener("click", run);
  document.getElementById("clearOutputBtn").addEventListener("click", clearOutput);
  document.getElementById("showTokensBtn").addEventListener("click", showTokens);
  document.getElementById("shareBtn").addEventListener("click", () => {
    showShareUrl(srcEl, sharePanelEl, shareUrlInputEl, qrContainerEl).catch((e) => {
      errorBoxEl.textContent = "共有URLの生成に失敗しました: " + (e && e.message ? e.message : String(e));
      errorBoxEl.style.display = "block";
    });
  });
  document.getElementById("copyShareUrlBtn").addEventListener("click", async () => {
    shareUrlInputEl.select();
    try {
      await navigator.clipboard.writeText(shareUrlInputEl.value);
    } catch (e) {
      // クリップボードAPIが使えない環境では、選択状態にするだけでも
      // 手動コピー（Ctrl+C / Cmd+C）できるようにしておく
    }
  });
  if (!HAS_COMPRESSION_STREAM) {
    document.getElementById("shareBtn").disabled = true;
    document.getElementById("shareBtn").title = "このブラウザは共有URLの生成に対応していません";
  }
  initWasm().catch((e) => {
    errorBoxEl.textContent = "WASM初期化エラー: " + (e && e.message ? e.message : String(e));
    errorBoxEl.style.display = "block";
  });
});
</script>
</body>
</html>
`;

const aboutHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DNCL2実行環境について</title>
<style>
  :root {
    color-scheme: light dark;
    --bg: #f5f5f7;
    --panel-bg: #ffffff;
    --text: #1d1d1f;
    --muted: #6e6e73;
    --border: #d2d2d7;
    --accent: #0071e3;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1c1c1e;
      --panel-bg: #2c2c2e;
      --text: #f5f5f7;
      --muted: #a1a1a6;
      --border: #48484a;
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
  .panel {
    max-width: 700px;
    margin: 0 auto;
    background: var(--panel-bg);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px 24px;
  }
  h1 { font-size: 1.2rem; margin-top: 0; }
  h2 { font-size: 1rem; margin-top: 1.5em; }
  code {
    font-family: "SF Mono", Menlo, Consolas, monospace;
    font-size: 0.9em;
    background: var(--bg);
    padding: 0.1em 0.35em;
    border-radius: 4px;
  }
  a { color: var(--accent); }
  .back { display: inline-block; margin-top: 1.5em; }
</style>
</head>
<body>
<div class="panel">
  <h1>DNCL2実行環境について</h1>
  <p>大学入学共通テスト用プログラム表記(DNCL2)を、ブラウザ上のWebAssemblyで実行するツールです。</p>

  <h2>コメント・ブロック構文</h2>
  <p><code>#</code> から行末まではコメントとして無視されます。ブロックはインデント（半角スペース）で表します。</p>

  <h2>外部からの入力</h2>
  <p><code>【外部からの入力】</code>に到達すると、出力欄にその場で入力欄が表示されます（Pythonの<code>input()</code>と同様です）。</p>

  <h2>共有URL・QRコード</h2>
  <p>「共有URL/QRコードを作成」で、今のソースコードをURLの<code>#</code>以降に埋め込んだリンクとQRコードを作成できます。そのURLを開くとソースコードが復元された状態で開きます。</p>

  <a class="back" href="index.html">← DNCL2実行環境に戻る</a>
</div>
</body>
</html>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, html, "utf-8");
console.log("wrote " + outPath + " (" + (html.length / 1024).toFixed(1) + " KB)");

const aboutOutPath = path.join(outDir, "about.html");
writeFileSync(aboutOutPath, aboutHtml, "utf-8");
console.log("wrote " + aboutOutPath + " (" + (aboutHtml.length / 1024).toFixed(1) + " KB)");
