#!/usr/bin/env node
/**
 * その日の記事から Instagram 用の正方形画像（1080x1080 JPEG）と本文を作る。
 *
 * 使える画像に制約がある:
 * 楽天・Yahoo! の商品写真は使えない。楽天ウェブサービス規約により、
 * 取得した画像は楽天のページへのリンクを伴う形でしか使えず、
 * Instagram の投稿はプロフィール以外に個別リンクを持てないため条件を満たせない。
 * したがって素材は「自前で作成した画像」と「Wikimedia の PD / CC 画像」に限る。
 *
 * 出力:
 *   public/social/<date>.jpg  … 投稿画像（GitHub Pages 経由で公開URLになる。APIが公開URLを要求するため）
 *   data/social/<date>.json   … 本文・ハッシュタグ・出典表記
 *
 * 使い方: node scripts/build-instagram-post.mjs [--date YYYY-MM-DD] [--force]
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const SIZE = 1080;
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const dateArg = args[args.indexOf('--date') + 1];
// 日本時間で数える。generate-blog.mjs と揃えること。
// UTC で数えると、朝6:20(=UTC 21:20)の実行ではまだ前日扱いになり、
// その日生成した記事ではなく前日の記事を投稿しようとする。
const today = args.includes('--date') && dateArg ? dateArg : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://watch-price-navi.github.io';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '/watch-price-navi';

const outImg = path.join(ROOT, 'public/social', `${today}.jpg`);
const outMeta = path.join(ROOT, 'data/social', `${today}.json`);
if (!FORCE && fs.existsSync(outImg) && fs.existsSync(outMeta)) {
  console.log(`${today} の投稿は既にあります（--force で作り直し）`);
  process.exit(0);
}

// ---- その日の記事を選ぶ（無ければ最新） ----
const blogDir = path.join(ROOT, 'data/blog');
const posts = fs
  .readdirSync(blogDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => {
    try {
      return readJson(path.join(blogDir, f));
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .sort((a, b) => String(b.date).localeCompare(String(a.date)));

const post = posts.find((p) => p.date === today) ?? posts[0];
if (!post) {
  console.log('記事がありません。投稿画像は作りませんでした。');
  process.exit(0);
}

const brandId = String(post.heroModel ?? '').split('/')[0];
const heritage = readJson(path.join(ROOT, 'data/brand-heritage.json')).brands ?? {};
const heritageImgs = readJson(path.join(ROOT, 'data/heritage-images.json')).images ?? {};
const styling = readJson(path.join(ROOT, 'data/styling.json'));

/**
 * 背景を選ぶ。発祥の地 → 創業者 → スタイリング → ブティック の順に探す。
 * 記事と関係のある画像を優先し、無ければサイトの世界観を担う画像に落とす。
 */
function pickBackground() {
  const town = heritageImgs[`${brandId}-town`];
  if (town) return { file: path.join(ROOT, 'public', town.src.replace(/^\//, '')), credit: town, kind: 'town' };
  const founder = heritageImgs[`${brandId}-founder`];
  if (founder) return { file: path.join(ROOT, 'public', founder.src.replace(/^\//, '')), credit: founder, kind: 'founder' };

  const looks = styling.looks ?? [];
  if (looks.length) {
    // 日付で回して、同じ絵が続かないようにする
    const idx = Number(today.replace(/-/g, '')) % looks.length;
    const l = looks[idx];
    return { file: path.join(ROOT, 'public', l.image.replace(/^\//, '')), credit: null, kind: 'styling' };
  }
  return { file: path.join(ROOT, 'public/img/hero-a.webp'), credit: null, kind: 'boutique' };
}

const bg = pickBackground();
if (!fs.existsSync(bg.file)) {
  console.log(`背景画像が見つかりません: ${bg.file}`);
  process.exit(1);
}

// ---- 文字を組む ----
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * 全角を1、半角を0.5として折り返す（日本語の見出しは文字数で折るのが確実）。
 * 英数字の連なりは途中で折らない。型番が「IW37 / 9502」と割れると読めなくなるため。
 */
function wrap(text, perLine) {
  // 英数字の並び（型番・年号）をひとつの塊として扱う
  const chunks = String(text).match(/[A-Za-z0-9.\-/]+|[\s　]+|./g) ?? [];
  const width = (s) => [...s].reduce((n, c) => n + (/[\x00-\x7F]/.test(c) ? 0.5 : 1), 0);

  const out = [];
  let line = '';
  let w = 0;
  for (const c of chunks) {
    const cw = width(c);
    // 塊そのものが1行に入らないときだけ、やむを得ず割る
    if (cw > perLine) {
      if (line) {
        out.push(line);
        line = '';
        w = 0;
      }
      for (const ch of c) {
        const chw = width(ch);
        if (w + chw > perLine) {
          out.push(line);
          line = '';
          w = 0;
        }
        line += ch;
        w += chw;
      }
      continue;
    }
    if (w + cw > perLine) {
      out.push(line);
      line = '';
      w = 0;
      if (/^[\s　]+$/.test(c)) continue; // 行頭の空白は捨てる
    }
    line += c;
    w += cw;
  }
  if (line) out.push(line);
  return out;
}

const title = String(post.title_ja ?? '').replace(/｜.*$/, '').trim();

/**
 * 見出しは長さがまちまち（型番入りは50字を超える）。
 * 行数に合わせて字の大きさを変え、切り落とさずに収める。
 * それでも入らないときだけ、語の途中で切らずに「…」で締める。
 */
const FIT = [
  { perLine: 12, max: 2, size: 58, lineH: 74 },
  { perLine: 13, max: 3, size: 52, lineH: 66 },
  { perLine: 15, max: 4, size: 45, lineH: 58 },
  { perLine: 16, max: 5, size: 40, lineH: 52 },
];
let fit = FIT[FIT.length - 1];
let lines = [];
for (const f of FIT) {
  const w = wrap(title, f.perLine);
  if (w.length <= f.max) {
    fit = f;
    lines = w;
    break;
  }
  fit = f;
  lines = w;
}
if (lines.length > fit.max) {
  lines = lines.slice(0, fit.max);
  lines[fit.max - 1] = lines[fit.max - 1].replace(/.$/, '…');
}

const MINCHO = "'Noto Serif CJK JP','Noto Serif JP','Yu Mincho','YuMincho','Hiragino Mincho ProN','MS PMincho',serif";
const GOTHIC = "'Noto Sans CJK JP','Noto Sans JP','Hiragino Sans','Yu Gothic',sans-serif";

const lineH = fit.lineH;
const blockH = lines.length * lineH;
const startY = SIZE - 176 - blockH + lineH * 0.78;

/**
 * 出典表記を1行に収める。
 * Commons の作者欄は説明文やURLが混ざっていることがあり、そのまま出すと崩れる。
 * URLと余分な説明を落とし、人名として読める部分だけを使う。名前が取れなければ
 * ライセンス名だけを出す（表示義務はライセンス名と出所で果たせる）。
 */
function cleanAuthor(raw) {
  const s = String(raw ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/Unknown author/gi, 'Unknown')
    .replace(/[.。]\s.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 2 && s.length <= 40 ? s : '';
}

const creditAuthor = bg.credit ? cleanAuthor(bg.credit.author) : '';
const creditText = bg.credit
  ? `Photo: ${[creditAuthor, bg.credit.license].filter(Boolean).join(' / ')}`
  : '';

const overlay = Buffer.from(`<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(18,13,9)" stop-opacity="0.55"/>
      <stop offset="18%" stop-color="rgb(18,13,9)" stop-opacity="0.18"/>
      <stop offset="42%" stop-color="rgb(18,13,9)" stop-opacity="0.42"/>
      <stop offset="70%" stop-color="rgb(18,13,9)" stop-opacity="0.90"/>
      <stop offset="100%" stop-color="rgb(18,13,9)" stop-opacity="0.95"/>
    </linearGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#scrim)"/>
  <rect x="34" y="34" width="${SIZE - 68}" height="${SIZE - 68}" fill="none" stroke="rgba(201,164,106,0.30)" stroke-width="1"/>
  <text x="72" y="112" fill="#c9a46a" font-size="21" letter-spacing="8" font-weight="600" font-family=${JSON.stringify(GOTHIC)}>時計価格ナビ</text>
  <line x1="72" y1="${startY - lineH - 34}" x2="152" y2="${startY - lineH - 34}" stroke="#c9a46a" stroke-width="1"/>
  ${lines
    .map(
      (l, i) =>
        `<text x="72" y="${startY + i * lineH}" fill="#f7f2e8" font-size="${fit.size}" letter-spacing="2" font-family=${JSON.stringify(MINCHO)}>${esc(l)}</text>`,
    )
    .join('\n  ')}
  <text x="72" y="${SIZE - 96}" fill="#cfc6b6" font-size="21" letter-spacing="1" font-family=${JSON.stringify(GOTHIC)}>楽天・Yahoo!の価格を毎日自動更新</text>
  <text x="72" y="${SIZE - 62}" fill="#a79d8e" font-size="17" letter-spacing="2" font-family=${JSON.stringify(GOTHIC)}>watch-price-navi.github.io</text>
  ${creditText ? `<text x="${SIZE - 72}" y="${SIZE - 62}" text-anchor="end" fill="#8a8175" font-size="13" font-family=${JSON.stringify(GOTHIC)}>${esc(creditText)}</text>` : ''}
</svg>`);

fs.mkdirSync(path.dirname(outImg), { recursive: true });
fs.mkdirSync(path.dirname(outMeta), { recursive: true });

// Instagram の API は JPEG のみ受け付ける
const base = await sharp(bg.file).resize(SIZE, SIZE, { fit: 'cover', position: 'attention' }).toBuffer();
await sharp(base).composite([{ input: overlay }]).jpeg({ quality: 88, mozjpeg: true }).toFile(outImg);

/* ─── 2枚目以降：その時計の実写を角度違いで並べる ───────────────
 *
 * 1本の時計を、文字盤・裏蓋・側面・留め金と見せられるのがカルーセルの値打ち。
 * 使えるのは CC / PD の写真だけである。楽天・Yahoo! の商品写真は
 * 規約 第10条により Instagram には載せられない。
 *
 * 切り抜かず、余白を足して正方形にする。切り抜きは構図を変える改変にあたるが、
 * 余白を足すのは技術的な調整に留まるため。撮った人の意図を損なわない。
 *
 * 作者・ライセンス・出典は本文に必ず書く（後段の caption で組む）。
 * 型番一致でない写真は「同型の別個体」と明記する。読者が自分の買う個体の
 * 写真だと誤解したまま買いに行くのを防ぐ。
 */
const extraImages = [];
const photoCredits = [];
try {
  const manifest = readJson(path.join(ROOT, 'data/watch-photos.json'));
  const entry = manifest.models?.[String(post.heroModel ?? '')];
  for (const [i, p] of (entry?.photos ?? []).slice(0, 9).entries()) {
    const src = path.join(ROOT, 'public', p.file.replace(/^\//, ''));
    if (!fs.existsSync(src)) continue;
    const name = `${today}-${i + 2}.jpg`;
    await sharp(src)
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 20, g: 16, b: 12 } })
      .jpeg({ quality: 88, mozjpeg: true })
      .toFile(path.join(ROOT, 'public/social', name));
    extraImages.push(`${SITE}${BASE}/social/${name}`);
    photoCredits.push(
      [cleanAuthor(p.author) || 'Unknown', p.license, p.exact ? null : '（同型の別個体）'].filter(Boolean).join(' / '),
    );
  }
} catch {
  // 写真が無くても投稿は成立する。1枚で出す
}
if (extraImages.length) console.log(`実写 ${extraImages.length}枚を追加（カルーセル）`);

// ---- 本文 ----
const url = `${SITE}${BASE}/ja/blog/${post.slug}/`;
const tags = [
  '#腕時計',
  '#時計好きな人と繋がりたい',
  '#腕時計好きな人と繋がりたい',
  '#高級時計',
  '#時計',
  '#時計好き',
  '#時計選び',
  '#腕時計コーデ',
  '#watch',
  '#watchesofinstagram',
  '#luxurywatches',
  '#watchcollector',
  '#horology',
  '#wristwatch',
];

/**
 * 説明文を切り詰める。
 * 英語は語の途中で切ると読めなくなるので、直前の空白まで戻す。
 * 日本語は分かち書きしないのでそのまま切ってよい。
 */
function trim(s, n) {
  const t = String(s ?? '').trim();
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

const titleEn = String(post.title_en ?? '').replace(/｜.*$/, '').trim();
const descEn = trim(post.description_en, 180);

// 日本語のあとに英語を続ける。世界からも読まれるようにするため。
// 区切りを挟まないと、Instagram の折りたたみ表示で地続きに見えて読みにくい。
const caption = [
  title,
  '',
  trim(post.description_ja, 160),
  '',
  '記事はプロフィールのリンクから読めます。',
  '楽天市場・Yahoo!ショッピングの価格を毎日自動で集めて、型番ごとの最安値を載せています。',
  ...(titleEn || descEn
    ? [
        '',
        '· · ·',
        '',
        titleEn,
        ...(descEn ? ['', descEn] : []),
        '',
        'Read the full article via the link in our profile.',
        'We collect prices from Japan’s largest marketplaces every day and list the lowest price for each reference.',
      ]
    : []),
  creditText ? `\n${creditText} via Wikimedia Commons` : '',
  // 写真の表示義務。何枚目が誰の写真かが分かる形で並べる
  ...(photoCredits.length
    ? ['', '写真 / Photos:', ...photoCredits.map((c, i) => `${i + 2}. ${c}`)]
    : []),
  '',
  tags.join(' '),
]
  .filter((x) => x !== null)
  .join('\n')
  // Instagram の本文は2,200字まで。超えると投稿そのものが弾かれる
  .slice(0, 2200);

fs.writeFileSync(
  outMeta,
  JSON.stringify(
    {
      date: today,
      slug: post.slug,
      image: `${SITE}${BASE}/social/${today}.jpg`,
      // 2枚以上あれば投稿側がカルーセルにする。1枚目は必ず表紙
      images: [`${SITE}${BASE}/social/${today}.jpg`, ...extraImages],
      articleUrl: url,
      background: bg.kind,
      credit: bg.credit ? { author: bg.credit.author, license: bg.credit.license, source: bg.credit.source } : null,
      caption,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);

// 毎日1枚ずつ増えていくので、古いものは捨てる。
// 投稿済みの画像は Instagram 側に残るため、リポジトリに置き続ける必要はない。
// ただし直近ぶんは、投稿の再試行で参照される可能性があるので残す。
const KEEP_DAYS = 60;
for (const dir of [path.join(ROOT, 'public/social'), path.join(ROOT, 'data/social')]) {
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\./.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_DAYS))) {
    fs.rmSync(path.join(dir, f));
  }
}

const kb = (fs.statSync(outImg).size / 1024).toFixed(0);
console.log(`投稿画像: ${path.relative(ROOT, outImg)}  ${kb}KB  背景=${bg.kind}`);
console.log(`本文    : ${path.relative(ROOT, outMeta)}`);
