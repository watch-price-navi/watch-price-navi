#!/usr/bin/env node
/**
 * Instagram へ自動投稿する。
 *
 * Instagram のコンテンツ公開APIは2段階:
 *   1) POST /<IG_ID>/media          … 画像URLと本文を渡して「コンテナ」を作る
 *   2) POST /<IG_ID>/media_publish  … そのコンテナIDを指定して公開する
 * 画像は公開URLで渡す必要があり、JPEG のみ受け付ける。
 * サイトを GitHub Pages で配信しているので、リポジトリに置いた画像がそのまま公開URLになる。
 * したがって「公開が終わってから」呼ぶこと（先に呼ぶと画像が404で取得できない）。
 *
 * トークンについて:
 * 長期トークンでも約60日で切れる。切れれば投稿は止まり「全自動」ではなくなるので、
 * 実行のたびに延長を試みる。延長は現在のトークンが生きているうちしかできないため、
 * 毎日動かしていれば実質無期限になる。
 *
 * 必要な環境変数:
 *   IG_USER_ID       … Instagram プロフェッショナルアカウントのID（数字）
 *   IG_ACCESS_TOKEN  … 長期アクセストークン
 *
 * 使い方: node scripts/post-to-instagram.mjs [--date YYYY-MM-DD] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const dateArg = args[args.indexOf('--date') + 1];
const today = args.includes('--date') && dateArg ? dateArg : new Date().toISOString().slice(0, 10);

const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
const API = 'https://graph.instagram.com/v21.0';

const metaFile = path.join(ROOT, 'data/social', `${today}.json`);
if (!fs.existsSync(metaFile)) {
  console.log(`${today} の投稿データがありません。先に build-instagram-post.mjs を実行してください。`);
  process.exit(0);
}
const meta = readJson(metaFile);

if (!IG_USER_ID || !TOKEN) {
  console.log('::warning::IG_USER_ID / IG_ACCESS_TOKEN が未設定のため投稿を見送りました。');
  console.log(`  画像: ${meta.image}`);
  console.log('  設定すると、この画像と本文が毎日自動で投稿されます。');
  process.exit(0);
}

async function call(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = json?.error?.message ?? text.slice(0, 300);
    throw new Error(`${res.status} ${msg}`);
  }
  return json;
}

/** 画像が本当に公開URLで取れるか確かめる。取れないまま投稿すると必ず失敗する */
async function assertImageReachable(url) {
  const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-1023' } });
  if (!res.ok) throw new Error(`画像を取得できません（${res.status}）: ${url}`);
  const type = res.headers.get('content-type') ?? '';
  if (!/jpe?g/i.test(type)) throw new Error(`JPEG ではありません（${type}）: ${url}`);
}

/** 長期トークンを延長する。失敗しても投稿自体は続ける */
async function refreshToken() {
  try {
    const j = await call(`${API}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(TOKEN)}`);
    if (j.access_token && j.access_token !== TOKEN) {
      // 新しいトークンは GitHub Secrets に自動反映できないため、ログに出さず期限だけ知らせる
      console.log(`::warning::アクセストークンが更新されました。有効期限 約${Math.round((j.expires_in ?? 0) / 86400)}日。`);
      console.log('::warning::この値は Secrets に自動保存できません。期限が近づいたら再発行してください。');
    } else {
      console.log(`トークンの有効期限を延長しました（残り約${Math.round((j.expires_in ?? 0) / 86400)}日）`);
    }
  } catch (e) {
    console.log(`::warning::トークンの延長に失敗しました: ${e.message}`);
  }
}

console.log(`投稿対象: ${today}`);
console.log(`  画像: ${meta.image}`);
console.log(`  記事: ${meta.articleUrl}`);

if (DRY) {
  console.log('--dry-run のため送信しませんでした。');
  process.exit(0);
}

await assertImageReachable(meta.image);

// 1) コンテナを作る
const container = await call(`${API}/${IG_USER_ID}/media`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image_url: meta.image, caption: meta.caption, access_token: TOKEN }),
});
console.log(`  コンテナ作成: ${container.id}`);

// 2) 公開する
const published = await call(`${API}/${IG_USER_ID}/media_publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ creation_id: container.id, access_token: TOKEN }),
});
console.log(`  公開しました: ${published.id}`);

await refreshToken();
