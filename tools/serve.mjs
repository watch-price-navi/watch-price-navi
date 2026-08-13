#!/usr/bin/env node
/** ビルド済みサイト(out/)をローカル配信する簡易サーバー。依存パッケージ不要。 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(projectRoot, 'out');
const port = Number(process.env.PORT) || 3000;

// .env の NEXT_PUBLIC_BASE_PATH を読む。basePath付きでビルドされた out/ は
// HTML内のリンクが /watch-price-navi/... を指すため、そのプレフィックスも受け付ける。
let basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const envFile = path.join(projectRoot, '.env');
if (!basePath && fs.existsSync(envFile)) {
  const m = fs.readFileSync(envFile, 'utf8').match(/^\s*NEXT_PUBLIC_BASE_PATH\s*=\s*(\S+)\s*$/m);
  if (m) basePath = m[1];
}
if (basePath && !basePath.startsWith('/')) basePath = `/${basePath}`;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

if (!fs.existsSync(root)) {
  console.error('out/ がありません。先に npm run build を実行してください。');
  process.exit(1);
}

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // basePath付きのURL(/watch-price-navi/ja/ 等)はプレフィックスを外して解決する
    if (basePath && (urlPath === basePath || urlPath.startsWith(`${basePath}/`))) {
      urlPath = urlPath.slice(basePath.length) || '/';
    }
    // ディレクトリ指定なら index.html を返す
    let filePath = path.join(root, urlPath);
    if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

    // out/ の外に出るパスは拒否する
    if (!path.resolve(filePath).startsWith(path.resolve(root))) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const alt = `${filePath.replace(/\/$/, '')}/index.html`;
      if (fs.existsSync(alt)) {
        filePath = alt;
      } else {
        const notFound = path.join(root, '404.html');
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not Found');
        return;
      }
    }

    res.writeHead(200, { 'content-type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(port, () => {
    console.log(`\n  サイトを配信中です。ブラウザで開いてください:`);
    console.log(`    日本語  http://localhost:${port}/ja/`);
    console.log(`    検索    http://localhost:${port}/ja/search/`);
    console.log(`    ブログ  http://localhost:${port}/ja/blog/`);
    console.log(`    English http://localhost:${port}/en/`);
    console.log(`\n  終了するには、このウィンドウで Ctrl+C を押してください。\n`);
  });
