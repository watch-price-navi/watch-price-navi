#!/usr/bin/env node
/**
 * Instagram に載せる「時計そのものの実写」を Wikimedia Commons から集める。
 *
 * なぜ楽天・Yahoo! の商品写真を使わないか:
 * 楽天ウェブサービス規約 第8条4項により、取得した画像を含む部分から楽天以外へ
 * リンクできず、第10条により取得データを登録済みアプリ以外の用途に使えない。
 * Instagram は登録済みアプリではないので、商品写真の転載はできない。
 *
 * なぜ生成画像を使わないか:
 * 実在しない時計の絵に実在の型番と価格を添えれば、読者はそれを本物と信じて
 * 買いに行く。偽造であり、やってはいけない。
 *
 * Commons には本物の時計の写真が CC / PD で相当数ある（裏蓋やムーブメントなど
 * 角度違いも）。表示義務があるので、作者・ライセンス・出典を必ず記録する。
 *
 * 取り違え対策:
 * 検索語が当たっても別ブランドの写真が返ることがある。ファイル名にブランド名が
 * 含まれるものだけを採り、型番が含まれるものを優先する。
 * 採否を人が確かめられるよう、Commons のページURLも残す。
 *
 * 使い方:
 *   node scripts/fetch-watch-photos.mjs              # 人手カタログの人気モデル
 *   node scripts/fetch-watch-photos.mjs --all        # 人手カタログ全件
 *   node scripts/fetch-watch-photos.mjs --limit 30   # 上限を指定
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'public/img/watches');
const MANIFEST = path.join(ROOT, 'data/watch-photos.json');
const UA = 'watch-price-navi/1.0 (https://watch-price-navi.github.io/watch-price-navi/)';
const args = process.argv.slice(2);
const ALL = args.includes('--all');
const LIMIT = Number(args[args.indexOf('--limit') + 1]) || (ALL ? 9999 : 120);

/** 表示義務を果たせるライセンスだけを通す */
const ALLOWED = [/public domain/i, /^cc0/i, /^cc[ -]by([ -]sa)?[ -]?\d/i, /^cc[ -]by([ -]sa)?$/i];
/** ロゴやアイコンは時計の写真ではない */
const NOT_A_PHOTO = /logo|icon|symbol|diagram|chart|\bmap\b|signature|coat of arms/i;
/**
 * 写真のファイルだけを対象にする。
 * これが無かったため、19世紀の医学書や地誌のPDFスキャンが大量に混ざっていた。
 */
const IS_IMAGE_FILE = /\.(jpe?g|png|webp)$/i;
/** 時計を指す語。各国語の出品者がいるので主要言語を並べる */
const WATCH_WORD = /watch|wrist|uhr|montre|orologio|reloj|horloge|chronograph|chronometer|時計|腕時計/i;
/** Commons の分類。編集者が付けているので「時計の写真か」の最も確かな根拠になる */
const WATCH_CATEGORY = /watch|uhr(en)?|montre|orolog|horolog|clock|chronograph|movement|時計/i;
/** 贋物の写真を載せてはいけない */
const COUNTERFEIT = /counterfeit|replica|fake|clone|homage/i;

/** 正規表現に使う文字列から記号を外す */
const escRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * ブランド名のうち最も特徴的な語を選ぶ。
 * 先頭語を使うと「A. Lange & Söhne」で "A." になり、しかも正規表現の . が
 * 任意の1文字として働いて、ほぼ全ての検索結果を通してしまっていた。
 */
function distinctiveWord(brandEn) {
  const words = String(brandEn).split(/[^A-Za-zÀ-ÿ]+/).filter((w) => w.length >= 4);
  return words.sort((a, b) => b.length - a.length)[0] ?? brandEn;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const url = `https://commons.wikimedia.org/w/api.php?${new URLSearchParams({ format: 'json', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const strip = (v) => String(v ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

/** 作者欄は説明文やURLが混ざる。人名として読める部分だけ残す */
function cleanAuthor(raw) {
  const s = strip(raw).replace(/https?:\/\/\S+/g, '').replace(/Unknown author/gi, 'Unknown').replace(/[.。]\s.*$/, '').trim();
  return s.length > 1 && s.length <= 40 ? s : '';
}

/**
 * 1モデル分の写真を探す。ブランド名がファイル名に入っているものだけ採用し、
 * 型番が入っているものを先頭に寄せる（同じ時計である確度が高い）。
 */
async function findPhotos(brandEn, modelEn, reference, want) {
  const queries = [
    reference ? `${brandEn} ${reference}` : null,
    `${brandEn} ${modelEn}`,
  ].filter(Boolean);

  const found = new Map();
  for (const q of queries) {
    let j;
    try {
      j = await api({
        action: 'query',
        generator: 'search',
        gsrsearch: q + ' filetype:bitmap',
        gsrnamespace: '6',
        gsrlimit: '12',
        prop: 'imageinfo|categories',
        cllimit: 'max',
        iiprop: 'url|extmetadata|mime',
        iiurlwidth: '1200',
      });
    } catch {
      continue;
    }
    const pages = j?.query?.pages ?? {};
    for (const k of Object.keys(pages)) {
      const page = pages[k];
      const ii = page?.imageinfo?.[0];
      if (!ii) continue;
      const title = String(page.title ?? '').replace(/^File:/, '');
      if (NOT_A_PHOTO.test(title)) continue;
      if (!IS_IMAGE_FILE.test(title)) continue;
      if (ii.mime && !/^image\//.test(ii.mime)) continue;
      // ブランド名を含まないものは別物の可能性が高い
      if (!new RegExp(escRe(distinctiveWord(brandEn)), 'i').test(title)) continue;
      // 贋物の写真を載せてはいけない
      if (COUNTERFEIT.test(title)) continue;

      /*
       * ファイル名だけでは「時計の写真か」を判定できない。
       * 実際に、ドレスデンにあるランゲの店舗建物、ブルガリのコンセプトカー
       * （Vision Gran Turismo）、創業者の肖像が、すべてブランド名を含むために
       * 通過していた。
       * Commons は編集者が分類を付けているので、そこに時計の分類があるかで見る。
       * これが最も確実な「時計である」根拠になる。
       */
      const cats = (page.categories ?? []).map((c) => String(c.title ?? ''));
      if (!cats.some((c) => WATCH_CATEGORY.test(c))) continue;

      const md = ii.extmetadata ?? {};
      const license = strip(md.LicenseShortName?.value);
      if (!license || !ALLOWED.some((re) => re.test(license))) continue;

      if (found.has(title)) continue;
      found.set(title, {
        title,
        src: ii.thumburl || ii.url,
        license,
        licenseUrl: strip(md.LicenseUrl?.value) || null,
        author: cleanAuthor(md.Artist?.value),
        source: ii.descriptionurl,
        // 型番が名前に入っていれば、その型番の写真である確度が高い
        exact: reference ? new RegExp(reference.replace(/[.\-/]/g, '[.\\-/]?'), 'i').test(title) : false,
      });
    }
    await sleep(250);
    if (found.size >= want * 2) break;
  }

  return [...found.values()].sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, want);
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

// ---- 対象モデル ----
const brandsDir = path.join(ROOT, 'data/brands');
const targets = [];
for (const f of fs.readdirSync(brandsDir).filter((x) => x.endsWith('.json'))) {
  const cat = readJson(path.join(brandsDir, f));
  for (const m of cat.models ?? []) {
    if (!ALL && !m.popular) continue;
    targets.push({ brandId: cat.brand.id, brandEn: cat.brand.name_en, brandJa: cat.brand.name_ja, model: m });
  }
}
targets.length = Math.min(targets.length, LIMIT);
console.log(`対象 ${targets.length} モデルを調べます\n`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : { note: '', models: {} };
manifest.note =
  'Instagram に載せる時計の実写。Wikimedia Commons の CC / PD 画像のみ。' +
  '表示義務があるので author・license・source を投稿の本文に必ず出すこと。' +
  'exact=false は同じ型番の写真とは限らない（同シリーズの別個体）。その旨を明記して使う。';
manifest.models ??= {};

let withPhotos = 0;
let files = 0;
for (const t of targets) {
  const key = `${t.brandId}/${t.model.id}`;
  if (manifest.models[key]?.photos?.length) {
    withPhotos++;
    continue;
  }
  let photos = [];
  try {
    photos = await findPhotos(t.brandEn, t.model.name_en, t.model.reference, 3);
  } catch (e) {
    console.log(`  ! ${key}: ${e.message}`);
    continue;
  }
  if (photos.length === 0) continue;

  const saved = [];
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const ext = (p.src.match(/\.(jpe?g|png|webp)(?:$|\?)/i)?.[1] ?? 'jpg').toLowerCase();
    const name = `${t.brandId}-${t.model.id}-${i + 1}.${ext}`;
    try {
      await download(p.src, path.join(OUT_DIR, name));
    } catch {
      continue;
    }
    saved.push({
      file: `/img/watches/${name}`,
      commonsTitle: p.title,
      author: p.author || null,
      license: p.license,
      licenseUrl: p.licenseUrl,
      source: p.source,
      exact: p.exact,
    });
    files++;
    await sleep(150);
  }
  if (saved.length) {
    manifest.models[key] = { brandId: t.brandId, modelId: t.model.id, reference: t.model.reference ?? null, photos: saved };
    withPhotos++;
    console.log(`  + ${key}  ${saved.length}枚  ${saved[0].exact ? '(型番一致)' : '(同シリーズ)'}`);
  }
  await sleep(200);
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n写真のあるモデル ${withPhotos} 件 / 画像 ${files} 枚 → ${path.relative(ROOT, MANIFEST)}`);
