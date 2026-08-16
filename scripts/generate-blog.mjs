#!/usr/bin/env node
/**
 * 毎朝のブログ記事を1本自動生成する。
 *
 * ANTHROPIC_API_KEY があれば Claude API で執筆（高品質・1記事あたり数円）。
 * 無い場合はカタログデータからテンプレート記事を組み立てる（無料・記事は簡素）。
 *
 * 使い方:
 *   node scripts/generate-blog.mjs                # 今日の記事を生成(既にあればスキップ)
 *   node scripts/generate-blog.mjs --force        # 既存でも上書き
 *   node scripts/generate-blog.mjs --date 2026-08-01
 */

import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();

// ---- .env 読み込み ----
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.BLOG_MODEL || 'claude-sonnet-5';

const args = process.argv.slice(2);
const force = args.includes('--force');
const dateArg = args[args.indexOf('--date') + 1];
// 「今日」はJST基準で決める。UTC基準だと朝6時JST(=前日21時UTC)の定期実行が前日日付になり、
// 手動実行と日付が衝突して記事の出ない日ができてしまう。
const todayJst = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const today = /^\d{4}-\d{2}-\d{2}$/.test(dateArg || '') ? dateArg : todayJst;

const brandsDir = path.join(ROOT, 'data', 'brands');
const blogDir = path.join(ROOT, 'data', 'blog');
fs.mkdirSync(blogDir, { recursive: true });

// ---- カタログ読み込み ----
const catalogs = [];
for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
  try {
    catalogs.push(readJson(path.join(brandsDir, f)));
  } catch { /* 壊れたファイルは無視 */ }
}
if (catalogs.length === 0) {
  console.error('カタログが空です。data/brands を確認してください。');
  process.exit(1);
}

const existing = fs.readdirSync(blogDir).filter((f) => f.endsWith('.json'));
if (!force && existing.some((f) => f.startsWith(today))) {
  console.log(`${today} の記事は既に存在します（--force で上書き可）`);
  process.exit(0);
}

// 既出テーマを読み、直近の重複を避ける
const pastPosts = existing
  .map((f) => {
    try { return readJson(path.join(blogDir, f)); } catch { return null; }
  })
  .filter(Boolean);
const usedHeroes = new Set(pastPosts.map((p) => p.heroModel).filter(Boolean));
const recentThemes = pastPosts
  .sort((a, b) => (a.date < b.date ? 1 : -1))
  .slice(0, 20)
  .map((p) => `${p.date}: ${p.title_ja}`);

// ---- 今日の主役モデルを決める（日付から決定的に選び、既出は避ける） ----
const allModels = catalogs.flatMap((c) =>
  c.models.map((m) => ({ brand: c.brand, model: m, key: `${c.brand.id}/${m.id}` }))
);
const dayNum = Math.floor(new Date(`${today}T00:00:00Z`).getTime() / 86_400_000);

// 人気モデル優先で、まだ主役にしていないものから選ぶ
const candidates = [
  ...allModels.filter((x) => x.model.popular && !usedHeroes.has(x.key)),
  ...allModels.filter((x) => !x.model.popular && !usedHeroes.has(x.key)),
  ...allModels, // すべて使い切ったら一巡目に戻る
];
const hero = candidates[dayNum % candidates.length];

// 関連モデル: 同ブランド or 同タグから4件
const heroTags = new Set(hero.model.tags ?? []);
const related = allModels
  .filter((x) => x.key !== hero.key)
  .map((x) => {
    let score = 0;
    if (x.brand.id === hero.brand.id) score += 3;
    for (const tg of x.model.tags ?? []) if (heroTags.has(tg)) score += 2;
    if (x.model.popular) score += 1;
    return { ...x, score };
  })
  .filter((x) => x.score > 0)
  .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
  .slice(0, 5);

const ANGLES = [
  { id: 'story', ja: 'このモデルの歴史と誕生秘話、時計ファンを惹きつけるロマン' },
  { id: 'scene', ja: '実際にどんなシーンで映えるか、着けこなしと相棒としての魅力' },
  { id: 'howto', ja: '購入前に知っておきたい選び方のポイントと、新品・中古それぞれの狙い方' },
  { id: 'brand', ja: 'ブランドの技術的な凄みと、このモデルがブランドの中で持つ意味' },
  { id: 'ranking', ja: '同じ系統の名作との比較。どれを選ぶべきかの指針' },
];
const angle = ANGLES[dayNum % ANGLES.length];

const slug = `${today}-${hero.brand.id}-${hero.model.id}`.slice(0, 80);

/* ─── 下書き置き場 ───────────────────────────────────────────
 *
 * Claude API を有料で叩かずに、読み物として成立する記事を毎朝出すための仕組み。
 *
 * 型にはめただけの記事は「ケース径38mm、ケース素材はtitanium」の羅列にしかならず、
 * 読み物にならない。かといってAPIには課金が要る。
 * そこで、書き溜めた下書きを data/blog-drafts/ に置き、1日1本ずつ公開する。
 * 公開済みかどうかは記事に残す draftId で判断するので、同じ下書きは二度出ない。
 *
 * 下書きが尽きたらテンプレートに落ちる（記事が出ない日は作らない）。
 * 残り本数を毎回ログに出すので、少なくなったら書き足せばよい。
 */
const draftsDir = path.join(ROOT, 'data/blog-drafts');

function listDrafts() {
  if (!fs.existsSync(draftsDir)) return [];
  const used = new Set(pastPosts.map((p) => p.draftId).filter(Boolean));
  return fs
    .readdirSync(draftsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ id: f.replace(/\.json$/, ''), file: path.join(draftsDir, f) }))
    .filter((d) => !used.has(d.id));
}

const countDrafts = () => listDrafts().length;

function takeDraft() {
  for (const d of listDrafts()) {
    let j;
    try {
      j = readJson(d.file);
    } catch {
      continue;
    }
    // 壊れた下書きで穴を空けない。読めないものは飛ばして次を使う
    if (!j.title_ja || !j.body_ja || String(j.body_ja).length < 200) {
      console.log(`::warning::下書き ${d.id} は中身が足りないので飛ばします`);
      continue;
    }
    return { ...j, draftId: d.id };
  }
  return null;
}

function fmtModel(x) {
  const m = x.model;
  return [
    `- ${x.key} : ${m.name_ja} / ${m.name_en}`,
    m.reference ? `型番 ${m.reference}` : null,
    m.caseSizeMm ? `${m.caseSizeMm}mm` : null,
    m.caseMaterial || null,
    m.movementType || null,
    m.caliber ? `Cal.${m.caliber}` : null,
    m.waterResistanceM ? `${m.waterResistanceM}m防水` : null,
    (m.tags || []).join('/') || null,
    m.summary_ja,
  ]
    .filter(Boolean)
    .join(' ｜ ');
}

// ============ 誌面に載せられる実写 ============
/**
 * 記事に差し込める実写（創業者の肖像・発祥地の風景）を調べ、
 * 「この語を本文に書けば写真が入る」という形で執筆側に渡す。
 *
 * 写真は本文からその語を探して差し込む仕組み（lib/blog-figures.ts）なので、
 * 語が本文に出てこなければ写真は入らない。逆に言えば、執筆時に
 * 創業者と土地に触れさせることが、そのまま誌面の写真点数になる。
 */
function heritageHints(brandIds) {
  let heritage = {};
  let images = {};
  try {
    heritage = readJson(path.join(ROOT, 'data/brand-heritage.json')).brands ?? {};
    images = readJson(path.join(ROOT, 'data/heritage-images.json')).images ?? {};
  } catch {
    return [];
  }
  const hints = [];
  for (const id of [...new Set(brandIds)]) {
    const h = heritage[id];
    if (!h) continue;
    if (h.founderJa && images[`${id}-founder`]) hints.push(`「${h.founderJa}」…創業者の肖像写真あり`);
    if (h.townJa && images[`${id}-town`]) hints.push(`「${h.townJa}」…発祥の地の風景写真あり`);
  }
  return hints;
}

// ============ Claude API で執筆 ============
async function writeWithApi() {
  const hints = heritageHints([hero.brand.id, ...related.map((r) => r.brand.id)]);

  const prompt = `あなたは高級誌（The Rake、GQ、SAFARI、Leon）の腕時計特集を手がける編集者兼ライターです。今日(${today})の記事を1本執筆してください。

書くのはブログ記事ではなく「誌面」です。読者が写真とともに読み進め、読み終えたときに一本の時計に恋をしている、という体験を作ってください。

【主役モデル】
${fmtModel(hero)}

【ブランド背景】
${hero.brand.name_ja}(${hero.brand.name_en}) / ${hero.brand.country} / 創業${hero.brand.founded ?? '不明'}年
${hero.brand.description_ja}

【記事に登場させる関連モデル(この中から3〜5件を選んで言及)】
${related.map(fmtModel).join('\n')}

【今日の切り口】
${angle.ja}

【本文に書けば写真が入る語（誌面の写真点数はここで決まる）】
${hints.length ? hints.join('\n') : '（この記事のブランドには実写がありません。モデルへの内部リンクで写真を稼いでください）'}
これらの語を本文にそのまま（一字一句同じ表記で）書くと、その段落の直後に実写が入ります。
創業の経緯や産地に触れる段落を必ず設け、上の語を自然な文脈で使ってください。

【既出記事(重複を避ける)】
${recentThemes.join('\n') || '（まだ記事はありません）'}

【出力形式】
有効なJSONのみを出力すること。前後に説明文やコードフェンスを付けない。

{
  "slug": "${slug}",
  "date": "${today}",
  "title_ja": "読みたくなる日本語タイトル(30〜45字。型番やブランド名を含めSEOを意識)",
  "title_en": "English title",
  "description_ja": "記事要約120字前後",
  "description_en": "English summary, 1-2 sentences",
  "body_ja": "本文(Markdown、2200〜2800字。## の見出しを4〜6個。関連モデルへは [モデル名](/ja/watch/ブランドID/モデルID/) 形式の内部リンクを5〜8個。> で始まる引用を1つだけ入れる)",
  "body_en": "English body (Markdown, 700-900 words, same structure, one > blockquote, links use /en/watch/... form)",
  "heroModel": "${hero.key}",
  "relatedModels": [${related.map((r) => `"${r.key}"`).join(', ')}],
  "topics": ["${angle.id}"]
}

【誌面としての作法】
- 書き出しの一段落は情景から入る。スペックや結論から始めない。ここだけ大きく組まれるので、
  読者がその場に立っているような一文で始めること
- 内部リンクは1つにつき商品写真が1枚入る。段落に埋め込む形で本文に散らし、
  一箇所にまとめない（写真が固まると誌面が崩れる）
- 引用(>)は記事の山場に1つだけ置く。段を割って大きく組まれるので、
  記事全体を貫く一行を選ぶこと。誰かの発言でなくてよい
- 見出しは内容の要約ではなく、次を読ませる言葉にする

【厳守】
- スペック・型番・歴史は上記データと一般に知られた事実の範囲で正確に書く。不確かなことは書かない
- 具体的な価格を断定しない。「最新の価格は当サイトの価格ページで確認できる」という誘導にする
- 記事の最後に、当サイトが楽天市場・Yahoo!ショッピングの価格を毎日自動更新していることを自然に案内する
- 誇大表現・虚偽・投資助言はしない
- モデルIDは上記のものを一字一句正確に使う`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content ?? []).map((c) => c.text ?? '').join('');
  const jsonStr = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  return JSON.parse(jsonStr);
}

// ============ テンプレートで執筆（APIキーなしのフォールバック） ============
function writeWithTemplate() {
  const m = hero.model;
  const b = hero.brand;
  const specJa = [
    m.reference ? `型番は${m.reference}` : null,
    m.caseSizeMm ? `ケース径${m.caseSizeMm}mm` : null,
    m.caseMaterial ? `ケース素材は${m.caseMaterial}` : null,
    m.caliber ? `搭載キャリバーは${m.caliber}` : null,
    m.waterResistanceM ? `${m.waterResistanceM}m防水` : null,
  ].filter(Boolean).join('、');

  const relLinksJa = related
    .slice(0, 4)
    .map((r) => `- [${r.brand.name_ja} ${r.model.name_ja}](/ja/watch/${r.brand.id}/${r.model.id}/) — ${r.model.summary_ja}`)
    .join('\n');
  const relLinksEn = related
    .slice(0, 4)
    .map((r) => `- [${r.brand.name_en} ${r.model.name_en}](/en/watch/${r.brand.id}/${r.model.id}/) — ${r.model.summary_en}`)
    .join('\n');

  const body_ja = `## ${b.name_ja} ${m.name_ja}とは

${m.summary_ja}

${specJa ? `スペック面では、${specJa}という構成です。` : ''}

## ブランドの背景

${b.description_ja}

## この一本が選ばれる理由

${m.name_ja}が長く支持されてきた理由は、単なるスペックの足し算では説明できません。${b.name_ja}が積み重ねてきた設計思想が、日常で袖口から覗いたときの佇まいに表れます。${m.tags?.includes('diver') ? '本格的な防水性能を備えながら、スーツにも似合う懐の深さがあります。' : ''}${m.tags?.includes('dress') ? '装いを選ばない端正な顔立ちは、長く付き合うほどに味わいが増します。' : ''}${m.tags?.includes('chronograph') ? 'クロノグラフ機構が生む機械的な高揚感も、この時計の大きな魅力です。' : ''}

## 一緒に検討したいモデル

${relLinksJa}

## いま、いくらで買えるのか

当サイトでは楽天市場・Yahoo!ショッピングの出品価格を毎日自動で収集し、型番ごとの最安値を掲載しています。新品・中古それぞれの最安値と販売店の一覧は、[${b.name_ja} ${m.name_ja}の価格ページ](/ja/watch/${b.id}/${m.id}/)からご確認ください。相場は日々動くため、購入を検討中の方はブックマークして値動きを追うのがおすすめです。`;

  const body_en = `## About the ${b.name_en} ${m.name_en}

${m.summary_en}

## The brand behind it

${b.description_en}

## Why this watch endures

The ${m.name_en} has stayed relevant not because of any single specification, but because of how ${b.name_en}'s design philosophy shows itself on the wrist every day.

## Watches to consider alongside it

${relLinksEn}

## What does it cost right now?

We collect listings from Rakuten and Yahoo! Shopping Japan every day and publish the lowest price for each reference. See the current new and pre-owned prices on the [${b.name_en} ${m.name_en} price page](/en/watch/${b.id}/${m.id}/).`;

  return {
    slug,
    date: today,
    title_ja: `${b.name_ja} ${m.name_ja}${m.reference ? ` ${m.reference}` : ''}の魅力と最安値の探し方`,
    title_en: `${b.name_en} ${m.name_en}${m.reference ? ` ${m.reference}` : ''}: What Makes It Special`,
    description_ja: `${b.name_ja}${m.name_ja}の魅力を解説。スペック、ブランドの背景、一緒に検討したいモデル、そして最新の最安値の調べ方までまとめました。`,
    description_en: `A closer look at the ${b.name_en} ${m.name_en} — its specifications, the brand behind it, alternatives worth considering, and where to find the lowest price today.`,
    body_ja,
    body_en,
    heroModel: hero.key,
    relatedModels: related.map((r) => r.key),
    topics: [angle.id],
  };
}

// ---- 実行 ----
let post;
if (API_KEY) {
  try {
    post = await writeWithApi();
    console.log(`Claude API (${MODEL}) で執筆しました`);
  } catch (e) {
    console.log(`::warning::API執筆に失敗したためテンプレートで生成します: ${e.message}`);
    post = writeWithTemplate();
  }
} else {
  /*
   * ここに落ちると、型にはめただけの記事が毎日積み上がる。
   * 「ケース径38mm、ケース素材はtitanium」のような羅列で、読み物にならない。
   *
   * 実際、自動運用が始まってから今日まで（2026-08-14〜16）の記事はすべてこれだった。
   * 静かに console.log していたため、緑の実行の中に紛れて誰も気づかなかった。
   * 失敗ではないが、望んだ状態でもない。目に入るようにする。
   */
  const draft = takeDraft();
  if (draft) {
    post = draft;
    console.log(`下書き「${draft.draftId}」を公開します（残り${countDrafts() - 1}本）`);
  } else {
    console.log('::warning::下書きが尽きたため、型にはめただけの記事になります。');
    console.log('::warning::data/blog-drafts/ に下書きを足すと、翌朝から順に公開されます。');
    post = writeWithTemplate();
  }
}

// 生成物の検証（壊れた記事をサイトに載せない）
const catalogKeys = new Set(allModels.map((x) => x.key));
post.date = today;
/*
 * 下書きはその時計のために書かれているので、主役を差し替えてはいけない。
 * 差し替えると本文と写真が食い違う（サブマリーナーの話にセイコーの写真が付く）。
 * slug も下書きの主役から作る。
 */
const fromDraft = Boolean(post.draftId);
if (fromDraft && catalogKeys.has(post.heroModel)) {
  post.slug = `${today}-${String(post.heroModel).replace('/', '-')}`.slice(0, 80);
  if (usedHeroes.has(post.heroModel)) {
    console.log(`::warning::下書き ${post.draftId} の主役 ${post.heroModel} は過去に出ています。`);
  }
} else {
  post.slug = slug;
}
/*
 * 主役は「カタログにある」だけでなく「まだ主役にしていない」ことも要る。
 * 候補を選ぶ側では既出を外していたが、AIが返した主役はカタログにありさえすれば
 * そのまま通していた。そのため7/18と7/19が同じスノーフレークを主役にし、
 * 記事一覧に同じ写真のカードが並んだ。
 * 記事の顔はその記事の時計なので、主役が重なれば絵も重なる。
 */
post.heroModel = fromDraft
  ? catalogKeys.has(post.heroModel)
    ? post.heroModel
    : hero.key
  : catalogKeys.has(post.heroModel) && !usedHeroes.has(post.heroModel)
    ? post.heroModel
    : hero.key;
post.relatedModels = (Array.isArray(post.relatedModels) ? post.relatedModels : []).filter((k) => catalogKeys.has(k));
if (post.relatedModels.length === 0) post.relatedModels = related.map((r) => r.key);
if (!post.title_ja || !post.body_ja || (post.body_ja || '').length < 200) {
  console.log('::warning::生成結果が不十分なためテンプレート版に差し替えます');
  post = writeWithTemplate();
}

const outFile = path.join(blogDir, `${post.slug}.json`);
fs.writeFileSync(outFile, JSON.stringify(post, null, 2), 'utf8');
console.log(`記事を作成しました: ${path.relative(ROOT, outFile)}`);
console.log(`  タイトル: ${post.title_ja}`);
console.log(`  主役: ${post.heroModel} / 関連 ${post.relatedModels.length}件`);
