#!/usr/bin/env node
/**
 * Google Search Console から「何が見られているか」を取り込む。
 *
 * ── なぜこれが要るのか ──────────────────────────────
 * 静的サイトなのでサーバーのログが無い。つまり、これまで
 * 「どのモデルが見られているか」を一切知らないまま作ってきた。
 * 勘で改善しても当たったか外れたか分からない。
 *
 * Search Console は無料で、検索の表示回数・クリック数・掲載順位・検索語を返す。
 * 所有権の確認は既に済んでいる（layout.tsx の verification タグ）。
 *
 * ── 何に使うのか ────────────────────────────────
 * 1. 写真を集める順番     … 見られているモデルから先に集める
 * 2. Instagram の題材     … 表示回数の多いブランドを優先する
 * 3. ブログの題材         … 検索されているのに記事が無いものを書く
 * 4. 題名と説明文の見直し … 表示は多いのにクリックされないページを直す
 *
 * ── 鍵の用意（初回だけ） ──────────────────────────
 * サービスアカウントを作り、そのメールアドレスを Search Console の
 * ユーザーとして追加する。手順は docs/セットアップ手順.md を参照。
 *   GOOGLE_SERVICE_ACCOUNT_JSON … サービスアカウントの鍵（JSON丸ごと）
 *
 * 使い方:
 *   node scripts/fetch-search-console.mjs              … 直近28日
 *   node scripts/fetch-search-console.mjs --days 90    … 期間を変える
 *   node scripts/fetch-search-console.mjs --report     … 取り込まず今の内容を表示
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const REPORT_ONLY = args.includes('--report');
const DAYS = Number(args[args.indexOf('--days') + 1]) || 28;

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const OUT = path.join(ROOT, 'data', 'page-stats.json');
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://watch-price-navi.github.io';
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '/watch-price-navi';

const readJson = (f, fb) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return fb;
  }
};

// ---------- 表示だけして終わる ----------
if (REPORT_ONLY) {
  const s = readJson(OUT, null);
  if (!s) {
    console.log('まだデータがありません。鍵を設定してから取り込んでください。');
    process.exit(0);
  }
  report(s);
  process.exit(0);
}

const KEY_RAW = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
if (!KEY_RAW) {
  console.log('::warning::GOOGLE_SERVICE_ACCOUNT_JSON が未設定です。検索データは取り込めません。');
  console.log('  docs/セットアップ手順.md の「Search Console の鍵」を参照してください。');
  console.log('  鍵が無くても他の処理は動きます（見られている順ではなく、既定の順で進みます）。');
  process.exit(0);
}

let key;
try {
  key = JSON.parse(KEY_RAW);
} catch {
  console.log('::error::GOOGLE_SERVICE_ACCOUNT_JSON がJSONとして読めません。');
  process.exit(1);
}

/**
 * サービスアカウントでアクセストークンを取る。
 * ライブラリを足さずに済ませる（依存を増やすほど壊れやすくなる）。
 * JWT を自分で組んで署名し、Google のトークン発行口と交換する。
 */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claim = b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  });
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  const sig = signer.sign(key.private_key, 'base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`トークンを取れません: ${JSON.stringify(j).slice(0, 200)}`);
  return j.access_token;
}

const ymd = (d) => new Date(d).toISOString().slice(0, 10);
// Search Console のデータは2〜3日遅れる。今日を指定しても空が返る
const endDate = ymd(Date.now() - 3 * 86400_000);
const startDate = ymd(Date.now() - (DAYS + 3) * 86400_000);

/**
 * どのサイトを見るかを、登録済みの一覧から決める。
 *
 * URLを決め打ちにしてはいけない。GitHub Pages のプロジェクトサイトは
 *   公開URL          https://watch-price-navi.github.io/watch-price-navi/
 *   ドメインの根      https://watch-price-navi.github.io/
 * の2通りがあり、Search Console にどちらで登録したかで指定が変わる。
 * 決め打ちにすると、片方では必ず 403 になって理由も分からない。
 *
 * サービスアカウントから見えるサイトを問い合わせ、
 * 公開URLに最も近いものを選ぶ。見つからなければ一覧をそのまま出す
 * （権限の付け忘れが最も多い失敗なので、その場で気づけるようにする）。
 */
async function pickSite(token) {
  const res = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  if (j.error) throw new Error(`${j.error.code} ${j.error.message}`);
  const list = (j.siteEntry ?? []).map((s) => s.siteUrl);
  if (!list.length) {
    throw new Error(
      'このサービスアカウントから見えるサイトがありません。' +
        'Search Console の「設定 → ユーザーと権限」に、鍵の client_email を追加してください。',
    );
  }
  const want = [`${SITE}${BASE}/`, `${SITE}/`, `sc-domain:${new URL(SITE).hostname}`];
  for (const w of want) {
    const hit = list.find((s) => s === w);
    if (hit) return { siteUrl: hit, list };
  }
  // 完全一致が無ければ、公開URLを含むものを選ぶ
  const partial = list.find((s) => `${SITE}${BASE}/`.startsWith(s.replace(/^sc-domain:/, 'https://')));
  return { siteUrl: partial ?? list[0], list };
}

async function query(token, siteUrl, dimensions, rowLimit = 25000) {
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState: 'all' }),
  });
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error(`応答が読めません: ${text.slice(0, 200)}`);
  }
  if (j.error) throw new Error(`${j.error.code} ${j.error.message}`);
  return j.rows ?? [];
}

const token = await getAccessToken();
console.log(`Search Console: ${startDate} 〜 ${endDate}（${DAYS}日間）\n`);

let pageRows = [];
let queryRows = [];
let siteUrl = null;
try {
  const picked = await pickSite(token);
  siteUrl = picked.siteUrl;
  console.log(`見えるサイト: ${picked.list.join(' / ')}`);
  console.log(`使うサイト  : ${siteUrl}\n`);
  pageRows = await query(token, siteUrl, ['page']);
  queryRows = await query(token, siteUrl, ['query'], 5000);
} catch (e) {
  console.log(`::warning::検索データを取れませんでした: ${e.message}`);
  console.log('  よくある原因:');
  console.log('   1. 鍵の client_email が Search Console のユーザーに追加されていない');
  console.log('      （設定 → ユーザーと権限 → ユーザーを追加。権限は「制限付き」で足ります）');
  console.log('   2. Google Cloud で Search Console API を有効にしていない');
  console.log('   3. 公開して日が浅く、まだ検索データが溜まっていない');
  process.exit(0);
}

/**
 * URL から「どのモデルのページか」を割り出す。
 * /ja/watch/<brand>/<model>/ という形なので、そこから鍵を作る。
 */
function keyOf(url) {
  try {
    const p = new URL(url).pathname.replace(BASE, '');
    const m = p.match(/^\/(?:ja|en)\/watch\/([^/]+)\/([^/]+)\/?$/);
    if (m) return { kind: 'model', key: `${m[1]}/${m[2]}` };
    const b = p.match(/^\/(?:ja|en)\/brands\/([^/]+)\/?$/);
    if (b) return { kind: 'brand', key: b[1] };
    return { kind: 'other', key: p };
  } catch {
    return { kind: 'other', key: url };
  }
}

const models = {};
const brandsAgg = {};
const others = {};
for (const r of pageRows) {
  const { kind, key } = keyOf(r.keys[0]);
  const bucket = kind === 'model' ? models : kind === 'brand' ? brandsAgg : others;
  const cur = bucket[key] ?? { impressions: 0, clicks: 0, positionSum: 0, n: 0 };
  cur.impressions += r.impressions ?? 0;
  cur.clicks += r.clicks ?? 0;
  cur.positionSum += (r.position ?? 0) * (r.impressions ?? 1);
  cur.n += r.impressions ?? 1;
  bucket[key] = cur;
  // モデルのページはブランド側にも足す。ブランド単位の人気が見たいため
  if (kind === 'model') {
    const bid = key.split('/')[0];
    const bb = brandsAgg[bid] ?? { impressions: 0, clicks: 0, positionSum: 0, n: 0 };
    bb.impressions += r.impressions ?? 0;
    bb.clicks += r.clicks ?? 0;
    bb.positionSum += (r.position ?? 0) * (r.impressions ?? 1);
    bb.n += r.impressions ?? 1;
    brandsAgg[bid] = bb;
  }
}
const finish = (o) =>
  Object.fromEntries(
    Object.entries(o).map(([k, v]) => [
      k,
      {
        impressions: v.impressions,
        clicks: v.clicks,
        ctr: v.impressions ? Number((v.clicks / v.impressions).toFixed(4)) : 0,
        position: v.n ? Number((v.positionSum / v.n).toFixed(1)) : null,
      },
    ]),
  );

const out = {
  note:
    'Search Console から取り込んだ、実際に検索で表示・クリックされた記録。' +
    '写真を集める順番、Instagram の題材、ブログの題材、題名の見直しに使う。' +
    'impressions は表示回数、ctr はクリック率、position は平均掲載順位（小さいほど上）。',
  fetchedAt: new Date().toISOString(),
  period: { startDate, endDate, days: DAYS },
  models: finish(models),
  brands: finish(brandsAgg),
  pages: finish(others),
  queries: queryRows
    .map((r) => ({
      q: r.keys[0],
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      ctr: r.impressions ? Number(((r.clicks ?? 0) / r.impressions).toFixed(4)) : 0,
      position: Number((r.position ?? 0).toFixed(1)),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 500),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');
report(out);
console.log(`\n→ ${path.relative(ROOT, OUT)} に書き出しました`);

function report(s) {
  const cat = (() => {
    const map = {};
    try {
      const dir = path.join(ROOT, 'data', 'brands');
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
        const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        for (const m of c.models ?? []) map[`${c.brand.id}/${m.id}`] = `${c.brand.name_ja} ${m.name_ja}`;
        map[c.brand.id] = c.brand.name_ja;
      }
    } catch {
      /* 名前が引けなくても数字は出す */
    }
    return map;
  })();

  const top = (o, n) =>
    Object.entries(o)
      .sort((a, b) => b[1].impressions - a[1].impressions)
      .slice(0, n);

  const mods = top(s.models ?? {}, 15);
  console.log('■ よく表示されているモデル');
  if (!mods.length) console.log('  まだ記録がありません（公開から日が浅いか、検索に出ていません）');
  for (const [k, v] of mods) {
    console.log(
      `  ${String(v.impressions).padStart(6)}回表示 / ${String(v.clicks).padStart(4)}click  順位${String(v.position ?? '-').padStart(5)}  ${cat[k] ?? k}`,
    );
  }

  const brs = top(s.brands ?? {}, 10);
  console.log('\n■ よく表示されているブランド');
  for (const [k, v] of brs) {
    console.log(`  ${String(v.impressions).padStart(6)}回表示 / ${String(v.clicks).padStart(4)}click  ${cat[k] ?? k}`);
  }

  console.log('\n■ 検索されている言葉（上位15）');
  for (const q of (s.queries ?? []).slice(0, 15)) {
    console.log(`  ${String(q.impressions).padStart(6)}回 / ${String(q.clicks).padStart(4)}click  順位${String(q.position).padStart(5)}  ${q.q}`);
  }

  /*
   * 表示は多いのにクリックされないページ＝題名か説明文が悪い。
   * 順位が悪いだけなら中身の問題だが、順位が良いのにクリックされないなら
   * 見出しの問題である。直せば効果がすぐ出る。
   */
  const weak = Object.entries(s.models ?? {})
    .filter(([, v]) => v.impressions >= 50 && v.ctr < 0.01 && (v.position ?? 99) <= 20)
    .sort((a, b) => b[1].impressions - a[1].impressions)
    .slice(0, 10);
  if (weak.length) {
    console.log('\n■ 順位は良いのにクリックされていない（題名の見直しが効く）');
    for (const [k, v] of weak) {
      console.log(`  表示${String(v.impressions).padStart(6)}  CTR${(v.ctr * 100).toFixed(2)}%  順位${v.position}  ${cat[k] ?? k}`);
    }
  }
}
