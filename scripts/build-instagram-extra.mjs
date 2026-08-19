#!/usr/bin/env node
/**
 * 昼・夜の投稿と、ストーリー用の縦型画像を作る。
 *
 * 朝の投稿（その日の記事）は build-instagram-post.mjs が作る。
 * こちらはそれ以外の枠を担当する。分けてあるのは、
 * 毎日確実に動いている朝の処理を壊さないためである。
 *
 * ── 何を載せられないか ────────────────────────────────
 * 楽天ウェブサービス規約 第10条により、楽天から取得した商品写真・価格は
 * 当サイト以外に出せない。Yahoo!（もしも経由）は SNS 掲載そのものが禁止。
 * したがって **Instagram に価格と商品写真は出せない**。
 * 使えるのは自前で作った画像と、CC / PD の写真だけである。
 *
 * だから昼・夜は「価格を出さなくても成立する題材」にしてある。
 *   昼 … ブランドの物語（data/brands/<id>.json の解説文 + 発祥の地/創業者の写真）
 *   夜 … 時計用語の解説（data/glossary.json + サイトの世界観画像）
 *
 * ストーリーは 1080x1920。同じ題材を縦に組み直す。
 *
 * 出力:
 *   public/social/<date>-s2.jpg   data/social/<date>-s2.json
 *   public/social/<date>-s3.jpg   data/social/<date>-s3.json
 *   public/social/<date>-story.jpg data/social/<date>-story.json
 *
 * 使い方:
 *   node scripts/build-instagram-extra.mjs             … 3つとも作る
 *   node scripts/build-instagram-extra.mjs --slot 2    … 昼だけ
 *   node scripts/build-instagram-extra.mjs --date 2026-08-18 --force
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const only = args.includes('--slot') ? String(args[args.indexOf('--slot') + 1]) : null;
const dateArg = args[args.indexOf('--date') + 1];
// 日本時間で数える。他のスクリプトと揃えること。
// UTC で数えると朝6:20(=UTC 21:20)の実行が前日扱いになる。
const today =
  args.includes('--date') && dateArg ? dateArg : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://watch-price-navi.github.io';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '/watch-price-navi';

const MINCHO = 'Noto Serif CJK JP, Noto Serif JP, serif';
const GOTHIC = 'Noto Sans CJK JP, Noto Sans JP, sans-serif';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * 全角を1、半角を0.5として折り返す。
 * 英数字の連なりは途中で折らない。型番が「IW37 / 9502」と割れると読めなくなる。
 */
function wrap(text, perLine) {
  const chunks = String(text).match(/[A-Za-z0-9.\-/]+|[\s　]+|./g) ?? [];
  const width = (s) => [...s].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);
  const out = [];
  let line = '';
  let w = 0;
  for (const c of chunks) {
    const cw = width(c);
    if (cw > perLine) {
      if (line) {
        out.push(line);
        line = '';
        w = 0;
      }
      out.push(c);
      continue;
    }
    if (w + cw > perLine) {
      out.push(line);
      line = /^[\s　]+$/.test(c) ? '' : c;
      w = /^[\s　]+$/.test(c) ? 0 : cw;
      continue;
    }
    line += c;
    w += cw;
  }
  if (line.trim()) out.push(line);
  return out;
}

/** 日付を種にして、同じものが続かないよう順に回す */
const seed = Number(today.replace(/-/g, ''));

/** ブランドの解説文から、頭の2文だけを取る。長すぎると画像に入らない */
function firstSentences(text, n = 2) {
  const s = String(text ?? '').split(/(?<=。)/).filter((x) => x.trim());
  return s.slice(0, n).join('').trim();
}

/**
 * 投稿の一行目に置く「引き」。
 *
 * 読み手は高級時計を知っている。辞書的な要約を並べても手は止まらない。
 * 数字か、業界の人しか言わない事実を最初に置く。
 * 一覧は data/brand-hooks.json（すべて事実で、誇張しない）。
 */
const hooks = (() => {
  try {
    return readJson(path.join(ROOT, 'data/brand-hooks.json')).hooks ?? {};
  } catch {
    return {};
  }
})();
const hookOf = (id) => hooks[id] ?? null;

/**
 * ハッシュタグ。
 * 「#腕時計」のような広い語は競合が数百万件あり、埋もれて誰にも届かない。
 * ブランド名と、収集家が実際に追っている語を混ぜる。
 */
function hashtags(b) {
  const brandTag = String(b.name_ja).replace(/[^\p{L}\p{N}]/gu, '');
  const brandEnTag = String(b.name_en).replace(/[^A-Za-z0-9]/g, '');
  return [
    `#${brandTag}`,
    `#${brandEnTag}`,
    '#高級時計',
    '#機械式時計',
    '#時計好きと繋がりたい',
    '#watchcollector',
    '#hautehorlogerie',
    '#watchesofinstagram',
    '#luxurywatches',
  ].join(' ');
}

// ---------- 素材 ----------
const heritageImgs = (() => {
  try {
    return readJson(path.join(ROOT, 'data/heritage-images.json')).images ?? {};
  } catch {
    return {};
  }
})();
const styling = (() => {
  try {
    return readJson(path.join(ROOT, 'data/styling.json')).looks ?? [];
  } catch {
    return [];
  }
})();

/**
 * Instagram に出すブランド。
 *
 * サイトは39社すべてを扱うが、アカウントは高級路線に絞る（運営方針・2026-08-17）。
 * カシオやシチズンの投稿は流さない。
 * 一覧と理由は data/instagram-brands.json にある。
 */
const IG_BRANDS = (() => {
  try {
    return new Set((readJson(path.join(ROOT, 'data/instagram-brands.json')).include ?? []).map((x) => x.id));
  } catch {
    return null; // 一覧が読めないときは絞らない（投稿が止まるより、出る方がまし）
  }
})();

const brands = fs
  .readdirSync(path.join(ROOT, 'data/brands'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    try {
      return readJson(path.join(ROOT, 'data/brands', f)).brand;
    } catch {
      return null;
    }
  })
  .filter((b) => b?.id && b?.description_ja)
  .filter((b) => !IG_BRANDS || IG_BRANDS.has(b.id))
  .sort((a, b) => a.id.localeCompare(b.id));

/**
 * 時計の実写。Wikimedia / Openverse の CC・PD 画像だけ。
 * 楽天・Yahoo! の商品写真は規約により Instagram に載せられない。
 */
const watchPhotos = (() => {
  try {
    return readJson(path.join(ROOT, 'data/watch-photos.json'));
  } catch {
    return { models: {}, brands: {} };
  }
})();

/** そのブランドの時計の写真。無ければ null。watchPool はブランドプール出身の印 */
function brandWatchPhoto(brandId) {
  const list = watchPhotos.brands?.[brandId]?.photos ?? [];
  // 日替わりの1枚が消えていても諦めず、次の候補を順に試す
  for (let i = 0; i < list.length; i++) {
    const p = list[(seed + i) % list.length];
    const src = path.join(ROOT, 'public', p.file.replace(/^\//, ''));
    if (fs.existsSync(src)) {
      return { src, credit: { author: p.author, license: p.license, source: p.source }, watchPool: true };
    }
  }
  return null;
}

/**
 * Search Console から取り込んだ実際の表示回数。
 * 見られているブランドを先に投稿する。無ければ 0 として扱う。
 */
const viewRank = (() => {
  try {
    const s = readJson(path.join(ROOT, 'data/page-stats.json'));
    return (id) => s.brands?.[id]?.impressions ?? 0;
  } catch {
    return () => 0;
  }
})();

/**
 * 時計の写真があるブランドを優先する。
 * 時計のアカウントなのに時計が写っていない、という状態を避けるため。
 * 次点が発祥の地・創業者の写真、最後がサイトの世界観画像。
 *
 * 写真がある中では、**よく見られているブランドを先に**回す。
 * ただし毎日同じブランドになると飽きられるので、
 * 上位8社の中から日替わりで選ぶ。
 */
function pickBrand() {
  const withWatch = brands.filter((b) => (watchPhotos.brands?.[b.id]?.photos ?? []).length);
  if (withWatch.length) {
    const ranked = [...withWatch].sort((a, b) => viewRank(b.id) - viewRank(a.id));
    const pool = ranked.slice(0, Math.min(8, ranked.length));
    return pool[seed % pool.length];
  }
  const withImg = brands.filter((b) => heritageImgs[`${b.id}-town`] || heritageImgs[`${b.id}-founder`]);
  const pool = withImg.length ? withImg : brands;
  return pool[seed % pool.length];
}

function brandImage(brandId, { neutralFallback = false } = {}) {
  // まず時計そのもの。読者が見たいのは時計であって風景ではない
  const watch = brandWatchPhoto(brandId);
  if (watch) return watch;
  const town = heritageImgs[`${brandId}-town`];
  if (town) return { src: path.join(ROOT, 'public', town.src.replace(/^\//, '')), credit: town };
  const founder = heritageImgs[`${brandId}-founder`];
  if (founder) return { src: path.join(ROOT, 'public', founder.src.replace(/^\//, '')), credit: founder };
  // neutralFallback: 型番を名指しする文脈（ストーリー等）では、他ブランドの時計に
  // 落とさない。断り書きを付けても「別ブランドの時計」は誤解が強すぎるため、
  // 時計が主役でない世界観画像に落とす
  return neutralFallback ? neutralImage() : fallbackImage();
}

function neutralImage() {
  if (styling.length) {
    const l = styling[seed % styling.length];
    return { src: path.join(ROOT, 'public', l.image.replace(/^\//, '')), credit: null };
  }
  return { src: path.join(ROOT, 'public/img/hero-a.webp'), credit: null };
}

function fallbackImage() {
  // 用語解説でも、まずは時計が写っているものを使う。
  // ただし高級路線のアカウントなので、対象ブランドの時計に限る
  const withWatch = Object.values(watchPhotos.brands ?? {}).filter(
    (b) => (b.photos ?? []).length && (!IG_BRANDS || IG_BRANDS.has(b.brandId)),
  );
  if (withWatch.length) {
    const b = withWatch[seed % withWatch.length];
    const p = b.photos[seed % b.photos.length];
    const src = path.join(ROOT, 'public', p.file.replace(/^\//, ''));
    if (fs.existsSync(src)) return { src, credit: { author: p.author, license: p.license, source: p.source } };
  }
  if (styling.length) {
    const l = styling[seed % styling.length];
    return { src: path.join(ROOT, 'public', l.image.replace(/^\//, '')), credit: null };
  }
  return { src: path.join(ROOT, 'public/img/hero-a.webp'), credit: null };
}

/**
 * 画像を1枚組む。
 * 縦（ストーリー）も横（投稿）も同じ関数で作れるよう、寸法を引数にした。
 */
async function compose({ bgFile, w, h, eyebrow, title, body, footer, credit, out, chip }) {
  if (!fs.existsSync(bgFile)) throw new Error(`背景がありません: ${bgFile}`);

  const pad = Math.round(w * 0.067);
  const titleSize = Math.round(w * (h > w ? 0.062 : 0.058));
  const titleLines = wrap(title, h > w ? 11 : 12);
  const bodySize = Math.round(w * 0.0255);
  const bodyLines = wrap(body ?? '', h > w ? 21 : 23).slice(0, h > w ? 9 : 7);

  /*
   * 文字は上からではなく、下から積む。
   * 上端を固定すると、文が短い日に本文と署名の間が大きく空いて間の抜けた絵になる。
   * 何行になっても署名のすぐ上に収まるよう、下端から逆算する。
   */
  const titleLH = Math.round(titleSize * 1.42);
  const bodyLH = Math.round(bodySize * 1.85);
  const footerY = h - Math.round(h * 0.089);
  const bodyBottom = footerY - Math.round(h * 0.072);
  const bodyTop = bodyBottom - (bodyLines.length - 1) * bodyLH;
  // 見出しと本文の間は、見出しの字の大きさに合わせて空ける。
  // 固定値にすると、見出しが大きい日に字面がぶつかる
  const titleTop = bodyTop - Math.round(titleSize * 1.15) - (titleLines.length - 1) * titleLH;

  /*
   * ストーリー用のリンク表示（chip）。
   * API はタップできるリンクスタンプを付けられない（Meta の仕様。手動投稿のみ可）。
   * せめて「どこを押せば開けるか」とURLを、リンク風の錠剤型の意匠で目立たせる。
   * 絵文字は使わない（CIのlibrsvgには絵文字フォントが無く豆腐になる）。
   */
  let chipSvg = '';
  if (chip) {
    const cfs = Math.round(w * 0.026);
    const ch2 = Math.round(cfs * 2.2);
    const cw2 = Math.round([...chip.url].length * cfs * 0.6 + cfs * 2.6);
    const cy2 = footerY - ch2 + Math.round(cfs * 0.4);
    chipSvg = `<text x="${pad}" y="${cy2 - Math.round(cfs * 0.9)}" fill="#cfc6b6" font-size="${Math.round(w * 0.022)}" letter-spacing="1" font-family=${JSON.stringify(GOTHIC)}>${esc(chip.hint)}</text>
  <rect x="${pad}" y="${cy2}" width="${cw2}" height="${ch2}" rx="${Math.round(ch2 / 2)}" fill="rgba(201,164,106,0.14)" stroke="#c9a46a" stroke-width="1.5"/>
  <text x="${pad + Math.round(cw2 / 2)}" y="${cy2 + Math.round(ch2 * 0.66)}" text-anchor="middle" fill="#f7f2e8" font-size="${cfs}" letter-spacing="1" font-family=${JSON.stringify(GOTHIC)}>${esc(chip.url)}</text>`;
  }

  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!--
      時計が主役。上半分は暗くしない。
      以前は中ほどまで濃く敷いていたため、せっかくの実写が沈んで見えなかった。
      文字が乗る下部だけを確実に暗くする。
    --><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(18,13,9)" stop-opacity="0.58"/>
      <stop offset="20%" stop-color="rgb(18,13,9)" stop-opacity="0.06"/>
      <stop offset="${h > w ? 46 : 40}%" stop-color="rgb(18,13,9)" stop-opacity="0.10"/>
      <stop offset="${h > w ? 60 : 55}%" stop-color="rgb(18,13,9)" stop-opacity="0.62"/>
      <stop offset="${h > w ? 74 : 72}%" stop-color="rgb(18,13,9)" stop-opacity="0.90"/>
      <stop offset="100%" stop-color="rgb(18,13,9)" stop-opacity="0.96"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#scrim)"/>
  <rect x="${Math.round(pad * 0.47)}" y="${Math.round(pad * 0.47)}" width="${w - Math.round(pad * 0.94)}" height="${h - Math.round(pad * 0.94)}" fill="none" stroke="rgba(201,164,106,0.30)" stroke-width="1"/>
  <text x="${pad}" y="${Math.round(h * (h > w ? 0.072 : 0.104))}" fill="#c9a46a" font-size="${Math.round(w * 0.0195)}" letter-spacing="8" font-weight="600" font-family=${JSON.stringify(GOTHIC)}>時計価格ナビ</text>
  <text x="${pad}" y="${titleTop - titleLH - Math.round(h * 0.028)}" fill="#c9a46a" font-size="${Math.round(w * 0.019)}" letter-spacing="6" font-family=${JSON.stringify(GOTHIC)}>${esc(eyebrow)}</text>
  <line x1="${pad}" y1="${titleTop - titleLH - Math.round(h * 0.016)}" x2="${pad + 80}" y2="${titleTop - titleLH - Math.round(h * 0.016)}" stroke="#c9a46a" stroke-width="1"/>
  ${titleLines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${titleTop + i * titleLH}" fill="#f7f2e8" font-size="${titleSize}" letter-spacing="2" font-family=${JSON.stringify(MINCHO)}>${esc(l)}</text>`,
    )
    .join('\n  ')}
  ${bodyLines
    .map(
      (l, i) =>
        `<text x="${pad}" y="${bodyTop + i * bodyLH}" fill="#ded6c8" font-size="${bodySize}" letter-spacing="1" font-family=${JSON.stringify(GOTHIC)}>${esc(l)}</text>`,
    )
    .join('\n  ')}
  ${
    chip
      ? chipSvg
      : `<text x="${pad}" y="${footerY}" fill="#cfc6b6" font-size="${Math.round(w * 0.0195)}" letter-spacing="1" font-family=${JSON.stringify(GOTHIC)}>${esc(footer)}</text>
  <text x="${pad}" y="${h - Math.round(h * 0.057)}" fill="#a79d8e" font-size="${Math.round(w * 0.0157)}" letter-spacing="2" font-family=${JSON.stringify(GOTHIC)}>watch-price-navi.github.io</text>`
  }
  ${credit ? `<text x="${w - pad}" y="${h - Math.round(h * 0.057)}" text-anchor="end" fill="#8a8175" font-size="${Math.round(w * 0.012)}" font-family=${JSON.stringify(GOTHIC)}>${esc(credit)}</text>` : ''}
</svg>`;

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const base = await sharp(bgFile).resize(w, h, { fit: 'cover', position: 'attention' }).toBuffer();
  // Instagram の API は JPEG のみ受け付ける
  await sharp(base).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 88, mozjpeg: true }).toFile(out);
}

/** 写真の出典。CC の条件なので必ず書く。作者名が無い写真は出典サイト名で補う */
const creditLine = (c) => {
  if (!c) return null;
  const author = String(c.author ?? '').trim();
  if (author) return [author, c.license].filter(Boolean).join(' / ');
  let host = '';
  try {
    host = new URL(c.source).host.replace(/^www\./, '');
  } catch {
    // source が無い・URLでないときはライセンス名だけになる
  }
  return [c.license, host].filter(Boolean).join(' / ');
};

/** 本文用の出典行。作者名の無い写真は出典ページのURLまで載せて表示義務を果たす */
function captionCredit(c) {
  if (!c) return '';
  const line = `Photo: ${creditLine(c)}`;
  const noAuthor = !String(c.author ?? '').trim();
  return noAuthor && c.source ? `${line}\n${c.source}` : line;
}

// ---------- 昼：ブランドの物語 ----------
async function buildBrandStory() {
  const b = pickBrand();
  const img = brandImage(b.id);
  // 画像に載せる一文も「引き」を使う。創業年と所在地の要約では手が止まらない
  const lead = hookOf(b.id)?.ja ?? firstSentences(b.description_ja, 1);

  const out = path.join(ROOT, 'public/social', `${today}-s2.jpg`);
  await compose({
    bgFile: img.src,
    w: 1080,
    h: 1080,
    eyebrow: 'BRAND STORY',
    title: b.name_ja,
    body: lead,
    footer: `${b.country ?? ''}　創業${b.founded ?? ''}年`.trim(),
    credit: creditLine(img.credit),
    out,
  });

  const url = `${SITE}${BASE}/brands/${b.id}/`;
  const hook = hookOf(b.id);
  /*
   * 読み手は高級時計を知っている前提で書く。
   * 辞書的な要約を並べても手は止まらない。最初の一文に、数字か意外な事実を置く。
   * 本文は3文まで。長く書くほど読まれなくなる。
   *
   * 英文で「founded in 1875, スイス.」のように国名が日本語のまま出ていた。
   * b.country は日本語表記なので、英文には使わない。
   */
  const caption = [
    b.name_ja,
    '',
    hook?.ja ?? firstSentences(b.description_ja, 1),
    '',
    firstSentences(b.description_ja, 3),
    '',
    `価格はプロフィールのリンクから。毎日更新しています。`,
    '',
    '· · ·',
    '',
    hook?.en ?? firstSentences(b.description_en ?? '', 1),
    '',
    firstSentences(b.description_en ?? '', 2),
    '',
    'Live prices via the link in bio.',
    img.credit ? `\n${captionCredit(img.credit)}` : '',
    '',
    hashtags(b),
  ]
    .filter((x) => x !== null)
    .join('\n');

  writeMeta(`${today}-s2`, {
    slot: 2,
    kind: 'brand-story',
    brandId: b.id,
    image: `${SITE}${BASE}/social/${today}-s2.jpg`,
    images: [`${SITE}${BASE}/social/${today}-s2.jpg`],
    articleUrl: url,
    caption,
  });
  console.log(`昼（ブランドの物語）: ${b.name_ja}`);
}

// ---------- 夜：時計用語の解説 ----------
async function buildGlossary() {
  const terms = readJson(path.join(ROOT, 'data/glossary.json')).terms ?? [];
  if (!terms.length) {
    console.log('用語集が空です。夜の投稿は作りませんでした。');
    return;
  }
  const t = terms[seed % terms.length];
  const img = fallbackImage();

  const out = path.join(ROOT, 'public/social', `${today}-s3.jpg`);
  await compose({
    bgFile: img.src,
    w: 1080,
    h: 1080,
    eyebrow: 'WATCH GLOSSARY',
    title: t.termJa,
    body: t.leadJa,
    footer: t.termEn,
    credit: creditLine(img.credit),
    out,
  });

  const caption = [
    `${t.termJa}｜${t.termEn}`,
    '',
    t.leadJa,
    '',
    t.bodyJa,
    '',
    'プロフィールのリンクから、条件を絞って時計を探せます。',
    '',
    '· · ·',
    '',
    `${t.termEn} — ${t.enLead}`,
    '',
    'Search by movement, case size and material via the link in bio.',
    img.credit ? `\n${captionCredit(img.credit)}` : '',
    '',
    ['#腕時計', '#時計好きと繋がりたい', '#機械式時計', '#時計知識', '#watchesofinstagram', '#horology'].join(' '),
  ].join('\n');

  writeMeta(`${today}-s3`, {
    slot: 3,
    kind: 'glossary',
    termId: t.id,
    image: `${SITE}${BASE}/social/${today}-s3.jpg`,
    images: [`${SITE}${BASE}/social/${today}-s3.jpg`],
    articleUrl: `${SITE}${BASE}/search/`,
    caption,
  });
  console.log(`夜（用語解説）: ${t.termJa}`);
}

// ---------- ストーリー（1080x1920） ----------
async function buildStory() {
  // その日の記事があればそれを、無ければ用語解説をストーリーにする
  let eyebrow = 'TODAY';
  let title = '';
  let body = '';
  let bgFile = null;
  let credit = null;
  try {
    // 記事のファイル名は <日付>-<スラッグ>.json なので、日付で拾えない。中身の date を見る
    const dir = path.join(ROOT, 'data/blog');
    const p = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return readJson(path.join(dir, f));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .find((x) => x.date === today);
    if (!p) throw new Error('その日の記事がありません');
    title = p.title_ja ?? '';
    body = String(p.description_ja ?? '').slice(0, 110);
    const bid = String(p.heroModel ?? '').split('/')[0];
    const img = brandImage(bid, { neutralFallback: true });
    bgFile = img.src;
    // ブランドプールの写真は記事のモデルとは別物。
    // 記事の時計の写真だと誤解されないよう断り書きを付ける
    credit = [creditLine(img.credit), img.watchPool ? '（同ブランドの別モデル）' : null]
      .filter(Boolean)
      .join('');
  } catch {
    const terms = readJson(path.join(ROOT, 'data/glossary.json')).terms ?? [];
    const t = terms[seed % terms.length];
    eyebrow = 'WATCH GLOSSARY';
    title = t.termJa;
    body = t.leadJa;
    const img = fallbackImage();
    bgFile = img.src;
    credit = creditLine(img.credit);
  }

  const out = path.join(ROOT, 'public/social', `${today}-story.jpg`);
  await compose({
    bgFile,
    w: 1080,
    h: 1920,
    eyebrow,
    title,
    body,
    footer: '',
    // タップできるリンクはAPIでは付けられないので、リンク風の意匠で誘導する
    chip: { hint: '記事と最安値は、プロフィールのリンクから', url: 'watch-price-navi.github.io' },
    credit,
    out,
  });

  writeMeta(`${today}-story`, {
    kind: 'story',
    image: `${SITE}${BASE}/social/${today}-story.jpg`,
    images: [`${SITE}${BASE}/social/${today}-story.jpg`],
    // ストーリーには本文が付かない。API も caption を受け取らない
    caption: '',
  });
  console.log('ストーリー: 作成しました');
}

function writeMeta(name, obj) {
  const f = path.join(ROOT, 'data/social', `${name}.json`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ date: today, ...obj }, null, 2), 'utf8');
}

/** 既にあるものは作り直さない（--force で上書き） */
function done(name) {
  return (
    !FORCE &&
    fs.existsSync(path.join(ROOT, 'public/social', `${name}.jpg`)) &&
    fs.existsSync(path.join(ROOT, 'data/social', `${name}.json`))
  );
}

const jobs = [
  ['2', `${today}-s2`, buildBrandStory],
  ['3', `${today}-s3`, buildGlossary],
  ['story', `${today}-story`, buildStory],
];
for (const [key, name, fn] of jobs) {
  if (only && only !== key) continue;
  if (done(name)) {
    console.log(`${name} は既にあります（--force で作り直し）`);
    continue;
  }
  try {
    await fn();
  } catch (e) {
    // 1枠が作れなくても他の枠は出す。全部止めるより、出せるものを出す
    console.log(`::warning::${name} を作れませんでした: ${e.message}`);
  }
}
