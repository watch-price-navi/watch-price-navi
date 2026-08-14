#!/usr/bin/env node
/**
 * 出品が1店しかないモデルの「軽量ページ」を生成する（ビルド後に実行）。
 *
 * なぜ必要か:
 * Next.js が出力する1ページは、本文HTMLに加えて画面を再構築するための内部データ
 * （RSCペイロード）を持つため、内容を削っても32KB前後から下がらない。
 * 掲載29,000モデル全部を通常ページにすると1.7GBになり、GitHub Pages の上限1GBを
 * 超えて公開自体が失敗する。
 *
 * 一方で「出品1店」のモデルは比較する中身が無く、必要な情報は
 * 商品名・型番・価格・販売店リンクだけ。これを素のHTMLで書けば1ページ2KB弱で済む。
 * 18,000件でも40MB程度に収まり、型番で検索した人が必ずページに辿り着ける。
 *
 * 使い方: npm run build のあとに自動実行される（package.json の postbuild）
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogs } from './lib/catalog.mjs';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'out');
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
const MIN_OFFERS = Number(process.env.MIN_OFFERS_FOR_PAGE ?? 2);

if (!fs.existsSync(OUT)) {
  console.log('out/ がありません。先に next build を実行してください。');
  process.exit(0);
}

const summaryFile = path.join(ROOT, 'data/prices/summary.json');
if (!fs.existsSync(summaryFile)) {
  console.log('価格データが無いため軽量ページの生成をスキップしました。');
  process.exit(0);
}
const summary = readJson(summaryFile);

/** ビルド済みトップページから CSS のパスを拾う（ファイル名はビルドごとに変わる） */
function findCss() {
  const top = path.join(OUT, 'ja/index.html');
  if (!fs.existsSync(top)) return null;
  const m = fs.readFileSync(top, 'utf8').match(/href="([^"]*_next\/static\/css\/[^"]+\.css)"/);
  return m ? m[1] : null;
}
const cssHref = findCss();

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const yen = (n) => `¥${Number(n).toLocaleString('ja-JP')}`;

function page({ brand, model, entry, offer }) {
  const name = `${brand.name_ja} ${model.name_ja}`;
  const ref = model.reference ? ` ${model.reference}` : '';
  const url = `${SITE}${BASE}/ja/watch/${brand.id}/${model.id}/`;
  const img = entry.image ? esc(entry.image) : null;
  const spec = [
    model.caseSizeMm ? `${model.caseSizeMm}mm` : null,
    model.caseMaterial,
    model.movementType,
  ].filter(Boolean).join(' ・ ');

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}${esc(ref)} の価格｜時計価格ナビ</title>
<meta name="description" content="${esc(name)}${esc(ref)} の販売価格。楽天市場・Yahoo!ショッピングから毎日自動収集しています。">
<link rel="canonical" href="${esc(url)}">
${cssHref ? `<link rel="stylesheet" href="${esc(cssHref)}">` : ''}
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${brand.name_en} ${model.name_en}`,
    brand: { '@type': 'Brand', name: brand.name_en },
    ...(model.reference ? { mpn: model.reference } : {}),
    ...(entry.image ? { image: entry.image } : {}),
    offers: { '@type': 'Offer', priceCurrency: 'JPY', price: entry.lowestPrice, availability: 'https://schema.org/InStock' },
  })}</script>
</head>
<body>
<div class="pr-bar">本サイトはアフィリエイト広告（PR）を利用しています</div>
<header class="site-header"><div class="container">
<a class="logo" href="${BASE}/ja/">時計価格ナビ<span class="logo-sub">Watch Price Navi</span></a>
</div></header>
<main class="container">
<nav class="breadcrumb"><a href="${BASE}/ja/">ホーム</a> › <a href="${BASE}/ja/brands/${brand.id}/">${esc(brand.name_en)}</a> › ${esc(model.name_ja)}</nav>
<div class="page-head"><h1>${esc(name)}${esc(ref)}</h1>
<p class="page-sub">${esc(model.summary_ja)}</p></div>
<section class="model-hero">
<div class="mh-image">${img ? `<img src="${img}" alt="${esc(name)}" loading="lazy">` : `<div class="pc-noimg">${esc(brand.name_en)}</div>`}</div>
<div class="price-panel">
<div class="pp-label">販売価格</div>
<div class="pp-main">${yen(entry.lowestPrice)}</div>
<div class="pp-sub">${esc(entry.shop)}（${entry.source === 'rakuten' ? '楽天市場' : 'Yahoo!ショッピング'}）・現在この1店のみ取扱い</div>
<a class="btn btn-deal" href="${esc(offer.url)}" target="_blank" rel="sponsored nofollow noopener">店舗で見る →</a>
</div>
</section>
${spec ? `<section class="section"><h2 class="section-title">基本仕様</h2><p>${esc(spec)}</p></section>` : ''}
<section class="section">
<p class="small-note">取扱店が1店のため、価格比較表は表示していません。価格は取得時点のものです。リンクには広告（アフィリエイト）を含みます。</p>
<p><a class="btn btn-outline" href="${BASE}/ja/search/?brand=${brand.id}">${esc(brand.name_ja)}の他のモデルを探す →</a></p>
</section>
</main>
<footer class="site-footer"><div class="container"><div class="credits">
<div><a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noopener">Supported by Rakuten Developers</a></div>
<div><a href="https://developer.yahoo.co.jp/sitemap/" target="_blank" rel="noopener">Webサービス by Yahoo! JAPAN</a></div>
</div></div></footer>
</body></html>`;
}

let written = 0;
let skipped = 0;

for (const cat of loadCatalogs(ROOT)) {
  const brand = cat.brand;
  for (const model of cat.models) {
    const key = `${brand.id}/${model.id}`;
    const entry = summary[key];
    if (!entry) continue;
    // 通常ページが既にあるものは触らない
    if ((entry.offerCount ?? 0) >= MIN_OFFERS) continue;

    const dir = path.join(OUT, 'ja/watch', brand.id, model.id);
    if (fs.existsSync(path.join(dir, 'index.html'))) { skipped++; continue; }

    let offer = null;
    const pf = path.join(ROOT, 'data/prices', brand.id, `${model.id}.json`);
    if (fs.existsSync(pf)) {
      try { offer = readJson(pf).offers?.[0] ?? null; } catch { /* 壊れていれば飛ばす */ }
    }
    if (!offer?.url) continue;

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), page({ brand, model, entry, offer }), 'utf8');
    written++;
  }
}

console.log(`軽量ページ: ${written.toLocaleString()}件を生成（通常ページ既存のため据置 ${skipped.toLocaleString()}件）`);
