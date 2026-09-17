# vendor/

外部ライブラリを取り込んだもの（実行時に外部URLをfetchしないという本プロジェクトの
方針のため、ビルド時に単一HTMLへインライン埋め込みする形で利用する）。

## qrcode-generator.js

- 取得元: npm `qrcode-generator@2.0.4` の `dist/qrcode.js`
  https://www.npmjs.com/package/qrcode-generator
- ライセンス: MIT (Copyright (c) 2009 Kazuhiko Arase)
- 用途: `scripts/build-html.mjs` が共有URL用QRコードの描画に使う `qrcode(...)` を
  提供する。共有URLはASCII文字のみのため、UTF-8対応版（`qrcode_UTF8.js`）は
  取り込んでいない。
- 更新方法: `npm pack qrcode-generator@<version>` で取得し `dist/qrcode.js` を
  `qrcode-generator.js` として上書きする。
