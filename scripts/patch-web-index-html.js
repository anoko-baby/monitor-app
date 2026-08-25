// `npx expo export -p web`の出力(dist/index.html)にtheme-color等のmetaタグを追記する。
// Expo Router標準の app/+html.tsx はstatic export("web": {"output": "static"})でのみ有効で、
// このプロジェクトはSPA出力(デフォルト)を使っている(static出力はSupabaseクライアント初期化が
// SSR時にwindow未定義でクラッシュするため見送った経緯がある)ため、ビルド後にHTMLへ直接注入する。
// iOS Safari(15以降)はtheme-colorを見てステータスバー/下部ツールバー背景色をページに合わせてくれる。
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const extraTags = [
  '<meta name="theme-color" content="#3E3A34" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
].join('\n    ');

if (html.includes('theme-color')) {
  console.log('theme-color meta already present, skipping patch');
} else {
  const patched = html.replace('</head>', `    ${extraTags}\n  </head>`);
  fs.writeFileSync(indexPath, patched);
  console.log('Patched dist/index.html with theme-color meta tags');
}
