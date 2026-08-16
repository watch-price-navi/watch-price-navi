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
 * 入口が2種類あり、トークンの見た目で判別する:
 *
 *   EAA… で始まる → Facebookページ経由 (graph.facebook.com)
 *     Facebookページに紐づけた Instagram を操作する昔からの方式。
 *     アプリが「開発中」のままでも、自分が管理者であるアカウントには使える。
 *     ページのトークンは期限が無いので、延長の仕組みが要らない。
 *
 *   IGAA… で始まる → Instagramログイン経由 (graph.instagram.com)
 *     新しい方式。手軽だがアプリを「公開」しないと弾かれ、
 *     公開にはビジネス認証（書類提出・数日）が要る。
 *     こちらは約60日で切れるため、実行のたびに延長を試みる。
 *
 * 当初は後者で組んだが、ビジネス認証で止まるため前者に移した。
 * 判別式にしてあるので、将来ビジネス認証が通れば
 * トークンを差し替えるだけで元の方式にも戻せる。
 *
 * 必要な環境変数:
 *   IG_USER_ID       … Instagram プロフェッショナルアカウントのID（数字）
 *   IG_ACCESS_TOKEN  … アクセストークン
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
// 日本時間で数える（build-instagram-post.mjs と揃える）
const today = args.includes('--date') && dateArg ? dateArg : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

const IG_USER_ID = process.env.IG_USER_ID;
const TOKEN = process.env.IG_ACCESS_TOKEN;
// Instagramログイン方式のトークンだけが IGAA で始まる。それ以外はFacebook経由とみなす
const VIA_INSTAGRAM_LOGIN = String(TOKEN ?? '').startsWith('IGAA');
const API = VIA_INSTAGRAM_LOGIN ? 'https://graph.instagram.com/v21.0' : 'https://graph.facebook.com/v21.0';

// 投稿できなかったときは必ず異常終了する。
// 以前はどの失敗でも exit 0 にしていたため、実際には1件も投稿されていないのに
// ワークフローは緑のままで、気づくまで日数がかかった。
const metaFile = path.join(ROOT, 'data/social', `${today}.json`);
if (!fs.existsSync(metaFile)) {
  console.log(`::error::${today} の投稿データがありません。build-instagram-post.mjs が動いたか確認してください。`);
  process.exit(1);
}
const meta = readJson(metaFile);

if (!IG_USER_ID || !TOKEN) {
  console.log('::error::IG_USER_ID / IG_ACCESS_TOKEN が未設定のため投稿できません。');
  console.log(`  画像: ${meta.image}`);
  process.exit(1);
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
    const err = json?.error ?? {};
    const msg = err.message ?? text.slice(0, 300);
    // よく出るものは、ログを見た人がそのまま対処できるように意味を添える
    const hint =
      /API access blocked/i.test(msg)
        ? '\n  → Metaアプリ側で権限が下りていません。App Dashboard で\n' +
          '     ・アプリが「ライブ」になっているか\n' +
          '     ・instagram_business_content_publish が許可されているか\n' +
          '     ・事業認証(Business Verification)を求める通知が出ていないか を確認してください。'
        : /expired|session has been invalidated|Invalid OAuth/i.test(msg)
          ? '\n  → アクセストークンが切れています。Meta の Graph API Explorer で再発行し、\n' +
            '     GitHub の Secrets の IG_ACCESS_TOKEN を差し替えてください。'
          : /Unsupported get request|does not exist|cannot be loaded/i.test(msg)
            ? '\n  → IG_USER_ID が違う可能性があります。Instagramビジネスアカウントの数字IDを入れてください。\n' +
              '     Facebookページ経由の場合、プロフィール画面のIDとは別物です。'
            : /permission|Insufficient|scope/i.test(msg)
              ? '\n  → トークンに権限が足りません。取得しなおすとき、次をすべて選んでください。\n' +
                '     instagram_basic / instagram_content_publish /\n' +
                '     pages_show_list / pages_read_engagement / business_management'
              : '';
    throw new Error(`${res.status} ${msg}${err.code ? ` (code ${err.code})` : ''}${hint}`);
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

/**
 * 長期トークンを延長する。失敗しても投稿自体は続ける。
 *
 * Facebookページのトークンには期限が無いので何もしない。
 * 「全自動」を名乗るうえでは、こちらのほうが本質的に安全である。
 */
async function refreshToken() {
  if (!VIA_INSTAGRAM_LOGIN) {
    console.log('Facebookページのトークンは期限が無いため、延長は不要です。');
    return;
  }
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
console.log(`  経路: ${VIA_INSTAGRAM_LOGIN ? 'Instagramログイン (graph.instagram.com)' : 'Facebookページ (graph.facebook.com)'}`);
console.log(`  画像: ${meta.image}`);
console.log(`  記事: ${meta.articleUrl}`);

if (DRY) {
  console.log('--dry-run のため送信しませんでした。');
  process.exit(0);
}

await assertImageReachable(meta.image);

/**
 * 投稿先のIDを確かめる。
 *
 * Instagramログイン方式では、トークンに紐づくIDを `me` から引ける。
 * 設定した IG_USER_ID と食い違っていても、こちらを信じたほうが確実である。
 * IDの取り違えは原因が分かりにくく、権限の問題と見分けがつかない。
 * 引けなければ設定値をそのまま使う（Facebookページ方式はこちら）。
 */
async function resolveTarget() {
  if (!VIA_INSTAGRAM_LOGIN) return IG_USER_ID;
  try {
    const me = await call(`${API}/me?fields=user_id,username&access_token=${encodeURIComponent(TOKEN)}`);
    const id = me.user_id ?? me.id;
    if (id && String(id) !== String(IG_USER_ID)) {
      console.log(`::warning::IG_USER_ID(${IG_USER_ID}) ではなく ${id} を使います（@${me.username}）。`);
      console.log('::warning::Secrets の IG_USER_ID をこの値に直しておくと、次回から警告が出なくなります。');
    }
    return id ?? IG_USER_ID;
  } catch (e) {
    console.log(`::warning::IDを確認できなかったため設定値を使います: ${e.message}`);
    return IG_USER_ID;
  }
}
const target = await resolveTarget();

// 1) コンテナを作る
const container = await call(`${API}/${target}/media`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image_url: meta.image, caption: meta.caption, access_token: TOKEN }),
});
console.log(`  コンテナ作成: ${container.id}`);

// 2) 公開する
const published = await call(`${API}/${target}/media_publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ creation_id: container.id, access_token: TOKEN }),
});
console.log(`  公開しました: ${published.id}`);

await refreshToken();
