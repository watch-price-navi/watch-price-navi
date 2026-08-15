#!/usr/bin/env node
/**
 * 記事に載せる実写（創業者の肖像・発祥の地の風景）を Wikipedia / Wikimedia Commons から取得する。
 *
 * なぜ生成画像を使わないか:
 * 実在の創業者の顔や実在の土地を、作り物の画像で置き換えて「その人／その土地」として
 * 見せるのは偽造にあたる。読者を欺くうえ、信用を失えば取り返しがつかない。
 * 幸い、創業者の多くは19世紀の人物でありパブリックドメインの肖像が残っている。
 *
 * なぜキーワード検索ではなく Wikipedia の記事画像を使うか:
 * Commons をキーワードで検索すると別物が混ざる（例:「Glashütte」は
 * ザクセンの時計の町とブランデンブルクの同名の村の両方が出る）。
 * Wikipedia 記事の代表画像は編集者が検証しており、取り違えが起きにくい。
 *
 * ライセンス:
 * パブリックドメイン / CC0 / CC BY / CC BY-SA のみ採用する。
 * CC BY 系は表示義務があるため、作者名・ライセンス名・出典URLを manifest に記録し、
 * 記事のキャプションに必ず出す。記録できないものは採用しない。
 *
 * 使い方: node scripts/fetch-heritage-images.mjs [--force]
 *   取得済みのものは再取得しない（--force で上書き）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/img/heritage');
const MANIFEST = path.join(ROOT, 'data/heritage-images.json');
const FORCE = process.argv.includes('--force');
const UA = 'watch-price-navi/1.0 (https://watch-price-navi.github.io/watch-price-navi/)';

/** 表示義務を果たせるライセンスだけを通す */
const ALLOWED = [
  /public domain/i,
  /^cc0/i,
  /^cc[ -]by([ -]sa)?[ -]?\d/i,
  /^cc[ -]by([ -]sa)?$/i,
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(host, params) {
  const url = `https://${host}/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** Wikipedia 記事の代表画像のファイル名を得る。英語版に無ければ日本語版を見る */
async function leadImage(title) {
  for (const host of ['en.wikipedia.org', 'ja.wikipedia.org']) {
    try {
      const j = await api(host, { action: 'query', titles: title, prop: 'pageimages', piprop: 'name', redirects: '1' });
      const pages = j?.query?.pages ?? {};
      for (const k of Object.keys(pages)) {
        const name = pages[k]?.pageimage;
        if (name) return name;
      }
    } catch {
      /* 次のホストを試す */
    }
  }
  return null;
}

/** Commons からライセンスと配信URLを取る */
async function fileInfo(fileName, width) {
  const j = await api('commons.wikimedia.org', {
    action: 'query',
    titles: `File:${fileName}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(width),
  });
  const pages = j?.query?.pages ?? {};
  for (const k of Object.keys(pages)) {
    const ii = pages[k]?.imageinfo?.[0];
    if (!ii) continue;
    const md = ii.extmetadata ?? {};
    const strip = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    return {
      url: ii.thumburl || ii.url,
      descriptionUrl: ii.descriptionurl,
      license: strip(md.LicenseShortName?.value) || null,
      licenseUrl: strip(md.LicenseUrl?.value) || null,
      author: strip(md.Artist?.value) || null,
    };
  }
  return null;
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function grab(kind, brandId, wikiTitle, width) {
  const key = `${brandId}-${kind}`;
  const file = await leadImage(wikiTitle);
  if (!file) return { key, skipped: '記事に代表画像なし' };

  const info = await fileInfo(file, width);
  if (!info?.url) return { key, skipped: 'ファイル情報なし' };
  if (!info.license || !ALLOWED.some((re) => re.test(info.license))) {
    return { key, skipped: `ライセンス不可(${info.license ?? '不明'})` };
  }

  const ext = (info.url.match(/\.(jpe?g|png|webp)(?:$|\?)/i)?.[1] ?? 'jpg').toLowerCase();
  const rel = `img/heritage/${key}.${ext}`;
  const dest = path.join(ROOT, 'public', rel);
  if (!FORCE && fs.existsSync(dest)) return { key, cached: true, rel, info, wikiTitle };
  const bytes = await download(info.url, dest);
  return { key, rel, bytes, info, wikiTitle };
}

const heritage = readJson(MANIFEST_SRC());
function MANIFEST_SRC() {
  return path.join(ROOT, 'data/brand-heritage.json');
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : { note: '', images: {} };
manifest.note =
  '記事に使う実写の出典とライセンス。scripts/fetch-heritage-images.mjs が生成する。' +
  'CC BY / CC BY-SA は表示義務があるため、author・license・source をキャプションに必ず出すこと。';
manifest.images ??= {};

let got = 0;
let skipped = 0;
for (const [brandId, h] of Object.entries(heritage.brands)) {
  for (const [kind, title, width] of [
    ['founder', h.founderWiki, 600],
    ['town', h.townWiki, 1400],
  ]) {
    if (!title) continue;
    try {
      const r = await grab(kind, brandId, title, width);
      if (r.skipped) {
        skipped++;
        console.log(`  - ${r.key}: ${r.skipped}`);
        continue;
      }
      manifest.images[r.key] = {
        brand: brandId,
        kind,
        src: `/${r.rel}`,
        subject: r.wikiTitle,
        author: r.info.author,
        license: r.info.license,
        licenseUrl: r.info.licenseUrl,
        source: r.info.descriptionUrl,
      };
      got++;
      console.log(`  ${r.cached ? '=' : '+'} ${r.key}  ${r.info.license}  ${r.info.author ?? ''}`.slice(0, 110));
    } catch (e) {
      skipped++;
      console.log(`  ! ${brandId}-${kind}: ${e.message}`);
    }
    await sleep(120); // Wikimedia への配慮
  }
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n取得 ${got} 件 / 見送り ${skipped} 件 → ${path.relative(ROOT, MANIFEST)}`);
