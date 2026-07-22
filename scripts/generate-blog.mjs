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
const today = /^\d{4}-\d{2}-\d{2}$/.test(dateArg || '') ? dateArg : new Date().toISOString().slice(0, 10);

const brandsDir = path.join(ROOT, 'data', 'brands');
const blogDir = path.join(ROOT, 'data', 'blog');
fs.mkdirSync(blogDir, { recursive: true });

// ---- カタログ読み込み ----
const catalogs = [];
for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
  try {
    catalogs.push(JSON.parse(fs.readFileSync(path.join(brandsDir, f), 'utf8')));
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
    try { return JSON.parse(fs.readFileSync(path.join(blogDir, f), 'utf8')); } catch { return null; }
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

// ============ Claude API で執筆 ============
async function writeWithApi() {
  const prompt = `あなたは日本の腕時計専門メディアの編集者兼ライターです。今日(${today})の記事を1本執筆してください。

【主役モデル】
${fmtModel(hero)}

【ブランド背景】
${hero.brand.name_ja}(${hero.brand.name_en}) / ${hero.brand.country} / 創業${hero.brand.founded ?? '不明'}年
${hero.brand.description_ja}

【記事に登場させる関連モデル(この中から3〜5件を選んで言及)】
${related.map(fmtModel).join('\n')}

【今日の切り口】
${angle.ja}

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
  "body_ja": "本文(Markdown、1600〜2200字。## の見出しを3〜5個。事実に基づき、時計へのロマンと購買意欲を高める文体。関連モデルへは [モデル名](/ja/watch/ブランドID/モデルID/) 形式の内部リンクを3〜5個入れる)",
  "body_en": "English body (Markdown, 500-700 words, same structure, links use /en/watch/... form)",
  "heroModel": "${hero.key}",
  "relatedModels": [${related.map((r) => `"${r.key}"`).join(', ')}],
  "topics": ["${angle.id}"]
}

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
    console.warn(`API執筆に失敗したためテンプレートで生成します: ${e.message}`);
    post = writeWithTemplate();
  }
} else {
  console.log('ANTHROPIC_API_KEY 未設定のためテンプレートで生成します');
  post = writeWithTemplate();
}

// 生成物の検証（壊れた記事をサイトに載せない）
const catalogKeys = new Set(allModels.map((x) => x.key));
post.slug = slug;
post.date = today;
post.heroModel = catalogKeys.has(post.heroModel) ? post.heroModel : hero.key;
post.relatedModels = (Array.isArray(post.relatedModels) ? post.relatedModels : []).filter((k) => catalogKeys.has(k));
if (post.relatedModels.length === 0) post.relatedModels = related.map((r) => r.key);
if (!post.title_ja || !post.body_ja || (post.body_ja || '').length < 200) {
  console.warn('生成結果が不十分なためテンプレート版に差し替えます');
  post = writeWithTemplate();
}

const outFile = path.join(blogDir, `${slug}.json`);
fs.writeFileSync(outFile, JSON.stringify(post, null, 2), 'utf8');
console.log(`記事を作成しました: ${path.relative(ROOT, outFile)}`);
console.log(`  タイトル: ${post.title_ja}`);
console.log(`  主役: ${post.heroModel} / 関連 ${post.relatedModels.length}件`);
