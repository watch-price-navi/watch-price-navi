#!/usr/bin/env node
/**
 * Instagram で「いま何が話題か」を調べる。投稿はしない。読むだけ。
 *
 * ── 何のために ────────────────────────────────────────
 * どの時計を記事にし、どれを投稿の題材にするかを、勘ではなく数字で決めたい。
 * 手元の価格データは「日本で何が売られているか」しか教えてくれない。
 * 世界で何が話題かは別の情報源が要る。
 *
 * ── 追えるもの・追えないもの ──────────────────────
 * ○ 時計メディア・ディーラーの**ビジネスアカウント**
 *   Business Discovery API で、公開されている投稿・いいね数・コメント数が取れる。
 *   相手がビジネス/クリエイターアカウントであることが条件。
 *
 * △ ハッシュタグの人気投稿
 *   IG Hashtag Search。**7日間に30個のユニークなハッシュタグまで**という上限がある。
 *   使い切ると7日間まったく引けなくなるので、調べる語は絞って固定する。
 *
 * ✕ 個人の富裕層アカウント
 *   個人アカウントはAPIの対象外。非公開も多い。
 *   ページを直接読みに行くのは Meta の規約違反なのでやらない。
 *
 * ── 権限について ──────────────────────────────────
 * これらの読み取りは、投稿用の instagram_business_content_publish とは別の権限が要る。
 * Facebookページに紐づく方式（EAA…トークン）でないと使えない可能性が高い。
 * このスクリプトはまず「何が使えるか」を確かめ、使えないものは理由を出して次へ進む。
 *
 * 使い方:
 *   node scripts/research-instagram.mjs                 … 全部調べる
 *   node scripts/research-instagram.mjs --accounts      … アカウントだけ
 *   node scripts/research-instagram.mjs --hashtags      … ハッシュタグだけ
 *   node scripts/research-instagram.mjs --dry-run       … 何を叩くか出すだけ
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const ONLY_ACCOUNTS = args.includes('--accounts');
const ONLY_HASHTAGS = args.includes('--hashtags');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
if (!IG_USER_ID || !TOKEN) {
  console.log('::error::IG_USER_ID / IG_ACCESS_TOKEN が未設定です。');
  process.exit(1);
}

/*
 * トークンの種類で使えるAPIが変わる。
 * IGAA… … Instagramログイン方式。graph.instagram.com。読み取り系は制限が多い
 * EAA…  … Facebook経由。graph.facebook.com。ハッシュタグ検索はこちらのみ
 */
const VIA_INSTAGRAM_LOGIN = String(TOKEN).startsWith('IGAA');
const API = VIA_INSTAGRAM_LOGIN ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';
console.log(`トークンの種類: ${VIA_INSTAGRAM_LOGIN ? 'Instagramログイン方式' : 'Facebook経由'}（${API}）\n`);

async function get(pathname, params = {}) {
  const q = new URLSearchParams({ ...params, access_token: TOKEN });
  const url = `${API}${pathname}?${q}`;
  if (DRY) {
    console.log(`  [dry] ${pathname} ${JSON.stringify(params)}`);
    return null;
  }
  const res = await fetch(url);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`応答が読めません: ${text.slice(0, 160)}`);
  }
  if (json.error) {
    const e = json.error;
    throw new Error(`${e.code}/${e.error_subcode ?? '-'} ${e.message}`);
  }
  return json;
}

/**
 * 追いかける先。
 *
 * 個人の富裕層は追えないので、**その人たちが見ているメディアと販売店**を見る。
 * ここに挙げたのは、いずれも公開のビジネスアカウントで、
 * 高級時計の話題がどこから広がるかの起点になっている。
 */
const ACCOUNTS = [
  { user: 'hodinkee', why: '米国の時計メディア。相場と新作の話題がここから広がる' },
  { user: 'watchanish', why: '個人発の巨大アカウント。富裕層の生活と時計を同時に見せる' },
  { user: 'thehourglassofficial', why: 'アジア最大級の正規販売店。独立時計師の扱いが早い' },
  { user: 'revolution_watch', why: '独立時計師とオートオルロジュリーに強い' },
  { user: 'phillipswatches', why: 'オークション。実際にいくらで落ちたかが分かる' },
  { user: 'watchesofswitzerland', why: '英国最大の正規販売店' },
  { user: 'fpjourneofficial', why: '独立系の頂点。当サイトでも扱いを始めた' },
  { user: 'richardmille', why: '価格帯の上限を作っているブランド' },
];

/**
 * 調べるハッシュタグ。
 * **7日間に30個まで**という上限があるので、増やさない。
 * 上限を使い切ると7日間まったく引けなくなる。
 */
const HASHTAGS = [
  'patekphilippe', 'richardmille', 'audemarspiguet', 'rolex',
  'alangesohne', 'vacheronconstantin', 'fpjourne', 'independentwatchmaking',
];

const out = { checkedAt: new Date().toISOString(), accounts: [], hashtags: [], notes: [] };

// ---------- ビジネスアカウントを見る ----------
if (!ONLY_HASHTAGS) {
  console.log('■ ビジネスアカウント');
  for (const a of ACCOUNTS) {
    try {
      const j = await get(`/${IG_USER_ID}`, {
        fields: `business_discovery.username(${a.user}){username,followers_count,media_count,media.limit(12){caption,like_count,comments_count,timestamp,permalink}}`,
      });
      if (DRY) continue;
      const b = j.business_discovery;
      const media = b?.media?.data ?? [];
      const avg = media.length
        ? Math.round(media.reduce((n, m) => n + (m.like_count ?? 0), 0) / media.length)
        : 0;
      out.accounts.push({
        username: b.username,
        followers: b.followers_count,
        mediaCount: b.media_count,
        avgLikes: avg,
        why: a.why,
        recent: media.map((m) => ({
          likes: m.like_count ?? 0,
          comments: m.comments_count ?? 0,
          at: m.timestamp,
          url: m.permalink,
          caption: String(m.caption ?? '').slice(0, 220),
        })),
      });
      console.log(`  ✓ @${b.username}  ${Number(b.followers_count).toLocaleString('ja-JP')}人  平均いいね ${avg.toLocaleString('ja-JP')}`);
    } catch (e) {
      console.log(`  ✗ @${a.user}: ${e.message}`);
      out.notes.push(`@${a.user}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

// ---------- ハッシュタグを見る ----------
if (!ONLY_ACCOUNTS) {
  console.log('\n■ ハッシュタグ（7日間に30個までの上限に注意）');
  for (const tag of HASHTAGS) {
    try {
      const s = await get('/ig_hashtag_search', { user_id: IG_USER_ID, q: tag });
      if (DRY) continue;
      const id = s.data?.[0]?.id;
      if (!id) {
        console.log(`  ✗ #${tag}: 見つかりません`);
        continue;
      }
      const m = await get(`/${id}/top_media`, {
        user_id: IG_USER_ID,
        fields: 'caption,like_count,comments_count,permalink,timestamp',
        limit: '20',
      });
      const list = m.data ?? [];
      const avg = list.length ? Math.round(list.reduce((n, x) => n + (x.like_count ?? 0), 0) / list.length) : 0;
      out.hashtags.push({
        tag,
        topCount: list.length,
        avgLikes: avg,
        top: list.map((x) => ({
          likes: x.like_count ?? 0,
          comments: x.comments_count ?? 0,
          at: x.timestamp,
          url: x.permalink,
          caption: String(x.caption ?? '').slice(0, 220),
        })),
      });
      console.log(`  ✓ #${tag}  人気投稿${list.length}件  平均いいね ${avg.toLocaleString('ja-JP')}`);
    } catch (e) {
      console.log(`  ✗ #${tag}: ${e.message}`);
      out.notes.push(`#${tag}: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 900));
  }
}

if (DRY) process.exit(0);

// ---------- 型番の言及を数える ----------
/*
 * 集めた本文から、当サイトのカタログにある型番の言及を数える。
 * どの一本が話題になっているかを、名前ではなく型番で押さえる。
 * 「ノーチラス」では版が分からないが、5711と5811は別の時計である。
 */
const refs = [];
try {
  const dir = path.join(ROOT, 'data', 'brands');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const m of c.models ?? []) {
      const r = String(m.reference ?? '').trim();
      if (r.length >= 4) refs.push({ ref: r, brand: c.brand.name_ja, model: m.name_ja, id: `${c.brand.id}/${m.id}` });
    }
  }
} catch {
  /* カタログが読めなくても調査自体は成立する */
}

const texts = [
  ...out.accounts.flatMap((a) => a.recent.map((r) => r.caption)),
  ...out.hashtags.flatMap((h) => h.top.map((t) => t.caption)),
];
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const blob = norm(texts.join(' '));
const mentions = refs
  .map((r) => ({ ...r, n: blob.split(norm(r.ref)).length - 1 }))
  .filter((r) => r.n > 0)
  .sort((a, b) => b.n - a.n);
out.mentions = mentions.slice(0, 40);

const outFile = path.join(ROOT, 'data', 'instagram-research.json');
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + '\n', 'utf8');

console.log(`\n■ 本文に出てきた型番（当サイトのカタログにあるもの）`);
if (mentions.length === 0) {
  console.log('  該当なし。本文が取れていないか、型番が書かれていない可能性があります');
} else {
  for (const m of mentions.slice(0, 15)) {
    console.log(`  ${String(m.n).padStart(3)}回  ${m.brand.padEnd(16)}${m.model.slice(0, 26).padEnd(28)}${m.ref}`);
  }
}
console.log(`\n→ ${path.relative(ROOT, outFile)} に書き出しました`);
if (out.notes.length) {
  console.log('\n■ 取れなかったもの（権限やAPIの制限）');
  for (const n of out.notes) console.log(`  ${n}`);
}
