#!/usr/bin/env node
/**
 * APIキーを対話形式で入力して .env に保存し、その場で疎通テストまで行う。
 *
 * テキストエディタで .env を直接編集すると、全角スペース混入・行削除・
 * 貼り付けミスに気付けないため、入力・検証・保存をこのスクリプトに集約する。
 *
 * 使い方: 「キー設定.bat」をダブルクリック、または
 *   node tools/setup-keys.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = path.join(ROOT, '.env');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const say = (s = '') => console.log(s);
const ok = (s) => say(`${C.green}  OK  ${C.reset}${s}`);
const ng = (s) => say(`${C.red}  NG  ${C.reset}${s}`);
const warn = (s) => say(`${C.yellow}  --  ${C.reset}${s}`);

/** 入力欄の定義。order は .env に書く順番でもある */
const FIELDS = [
  {
    key: 'GITHUB_USER',
    virtual: true, // .env には直接書かず、他の値の組み立てに使う
    optional: true, // アカウント未取得でも先に進めるようにする
    label: 'GitHub のユーザー名',
    help: 'https://github.com/ で作ったアカウント名（例: uchida-t）。まだ無ければ空欄でEnter。',
    validate: (v) => (/^[A-Za-z0-9-]{1,39}$/.test(v) ? null : '英数字とハイフンのみ、39文字以内です'),
  },
  {
    key: 'RAKUTEN_APP_ID',
    label: '楽天ウェブサービスの アプリID',
    help: 'https://webservice.rakuten.co.jp/app/list に表示されます（新API基盤ではUUID形式）',
    // 新基盤は 8-4-4-4-12 のUUID。旧基盤は数字19桁前後。どちらも受け付ける
    validate: (v) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) || /^[0-9]{15,25}$/.test(v)
        ? null
        : 'UUID形式（xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx）か、数字15〜25桁のはずです',
  },
  {
    key: 'RAKUTEN_ACCESS_KEY',
    label: '楽天ウェブサービスの アクセスキー',
    help: 'アプリIDと同じ画面に表示されます（pk_ で始まる文字列）。新しい楽天APIでは必須です',
    validate: (v) => (v.length >= 20 ? null : '短すぎます。コピーし損ねていないか確認してください'),
  },
  {
    key: 'RAKUTEN_AFFILIATE_ID',
    label: '楽天アフィリエイトID',
    help: 'https://affiliate.rakuten.co.jp/ で確認。ピリオド区切りの4ブロック。後回しOK（空欄でEnter）',
    optional: true,
    validate: (v) => (/^[0-9a-f]{8}\.[0-9a-f]{8}\.[0-9a-f]{8}\.[0-9a-f]{8}$/i.test(v) ? null : 'xxxxxxxx.xxxxxxxx.xxxxxxxx.xxxxxxxx の形のはずです'),
  },
  {
    key: 'YAHOO_APP_ID',
    label: 'Yahoo! の Client ID（アプリケーションID）',
    help: 'https://e.developer.yahoo.co.jp/dashboard/ で発行。長い英数字の文字列',
    validate: (v) => (v.length >= 20 ? null : '短すぎます。Client ID を貼り付けてください'),
  },
  {
    key: 'VC_SID',
    label: 'バリューコマースの sid',
    help: 'サイト公開後に申請するので、いまは空欄でEnter',
    optional: true,
    validate: (v) => (/^[0-9]+$/.test(v) ? null : '数字のはずです'),
  },
  {
    key: 'VC_PID',
    label: 'バリューコマースの pid',
    help: 'sid と同じ画面で確認。いまは空欄でEnter',
    optional: true,
    validate: (v) => (/^[0-9]+$/.test(v) ? null : '数字のはずです'),
  },
  {
    key: 'ANTHROPIC_API_KEY',
    label: 'Anthropic APIキー（ブログをAIに書かせる場合のみ）',
    help: 'https://console.anthropic.com/ で発行。未設定でもテンプレート記事が毎朝自動生成されます',
    optional: true,
    validate: (v) => (v.startsWith('sk-ant-') ? null : 'sk-ant- で始まるはずです'),
  },
];

/** 既存の .env から値を読む */
function readEnv() {
  const out = {};
  if (!fs.existsSync(ENV_FILE)) return out;
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

/** 貼り付け事故を吸収する */
function clean(raw) {
  return raw
    .replace(/[　\s]+/g, '')      // 全角スペース・空白をすべて除去
    .replace(/^["'<]+|["'>]+$/g, '')  // 引用符・山括弧
    .replace(/^[A-Z0-9_]+=/, '');     // 「RAKUTEN_APP_ID=1234」ごと貼られた場合
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let stdinClosed = false;
rl.on('close', () => { stdinClosed = true; });

/** 入力を1行受け取る。stdinが閉じた（EOF・Ctrl+C）場合は null を返す */
const ask = (q) =>
  new Promise((res) => {
    if (stdinClosed) return res(null);
    rl.question(q, res);
    rl.once('close', () => res(null));
  });

async function prompt(field, current) {
  const shown = current ? `${C.dim}（現在: ${current.slice(0, 6)}…設定済み。Enterで変更なし）${C.reset}` : '';
  say('');
  say(`${C.bold}${C.cyan}■ ${field.label}${C.reset}`);
  say(`${C.dim}  ${field.help}${C.reset}`);

  // どの項目も空欄でスキップできる。足りない分は最後にまとめて案内する。
  for (;;) {
    const raw = await ask(`  入力${shown ? ' ' + shown : ''} > ${C.dim}(未取得なら空欄でEnter)${C.reset} `);
    if (raw === null) return current ?? '';        // EOF: これ以上聞けない
    const v = clean(raw);
    if (v === '') return current ?? '';            // 空欄 = 変更なし / 後回し
    const err = field.validate ? field.validate(v) : null;
    if (err) {
      ng(err);
      const again = await ask(`  この値のまま進めますか？ (y=進む / Enter=入力し直す) > `);
      if (again === null) return v;
      if (again.trim().toLowerCase() !== 'y') continue;
    }
    return v;
  }
}

// ---------- 疎通テスト ----------

async function testRakuten(env) {
  if (!env.RAKUTEN_APP_ID) return warn('楽天: アプリIDが未設定のためテストしません');
  const params = new URLSearchParams({
    format: 'json',
    applicationId: env.RAKUTEN_APP_ID,
    keyword: 'セイコー 腕時計',
    hits: '3',
  });
  const headers = { 'User-Agent': 'watch-price-navi/1.0' };
  let endpoint = 'https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601';
  if (env.RAKUTEN_ACCESS_KEY) {
    endpoint = 'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
    params.set('accessKey', env.RAKUTEN_ACCESS_KEY);
    headers.Origin = env.RAKUTEN_ORIGIN || 'http://localhost:3000';
  }
  try {
    const res = await fetch(`${endpoint}?${params}`, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let code = '';
      try { code = JSON.parse(body).errors?.errorMessage ?? ''; } catch { /* JSONでないことがある */ }
      ng(`楽天: HTTP ${res.status}${code ? ` (${code})` : ''}`);

      // 実際に返ってくるエラーごとに、直し方を具体的に案内する
      if (code === 'REQUESTED_SCOPES_NOT_ALLOWED') {
        say('      → アプリに「楽天市場商品検索API」の利用権限(スコープ)が付いていません。');
        say('      → https://webservice.rakuten.co.jp/app/list でアプリを開き、');
        say('         APIアクセススコープで「楽天市場商品検索API(IchibaItem/Search)」を有効にして保存してください。');
      } else if (code === 'REQUEST_CONTEXT_BODY_HTTP_REFERRER_MISSING') {
        say('      → Originヘッダが送られていません。.env の RAKUTEN_ORIGIN が空の可能性があります。');
      } else if (/REFERRER|ORIGIN|DOMAIN/i.test(code)) {
        say(`      → Origin（現在: ${headers.Origin ?? 'なし'}）が、楽天アプリ登録の「許可サイト」と一致していません。`);
        say('      → 許可サイト欄はドメインのみ（https:// なし）で登録します。');
      } else if (/ACCESS[_ ]?KEY/i.test(code) || res.status === 401) {
        say('      → アクセスキーが違います。https://webservice.rakuten.co.jp/app/list で確認し直してください。');
      } else {
        say('      → アプリID・アクセスキー・許可サイトのいずれかを確認してください。');
      }
      if (body && !code) say(`${C.dim}      応答: ${body.slice(0, 200)}${C.reset}`);
      return;
    }
    const data = await res.json();
    const n = (data.Items ?? []).length;
    ok(`楽天: 接続成功（商品${n}件を取得。${env.RAKUTEN_ACCESS_KEY ? '新API' : '旧API・2026-08-17で廃止'}）`);
    if (!env.RAKUTEN_ACCESS_KEY) {
      warn('楽天: アクセスキーが未設定です。旧APIは間もなく廃止されるので必ず設定してください');
    }
  } catch (e) {
    ng(`楽天: 接続できませんでした（${e.message}）`);
  }
}

async function testYahoo(env) {
  if (!env.YAHOO_APP_ID) return warn('Yahoo!: Client IDが未設定のためテストしません');
  const params = new URLSearchParams({ appid: env.YAHOO_APP_ID, query: 'セイコー 腕時計', results: '3' });
  try {
    const res = await fetch(`https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?${params}`, {
      headers: { 'User-Agent': 'watch-price-navi/1.0' },
    });
    if (!res.ok) {
      ng(`Yahoo!: HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) {
        say('      → Client ID の誤り、またはアプリの種類が「サーバーサイド」になっていない可能性があります。');
      }
      return;
    }
    const data = await res.json();
    ok(`Yahoo!: 接続成功（商品${(data.hits ?? []).length}件を取得）`);
  } catch (e) {
    ng(`Yahoo!: 接続できませんでした（${e.message}）`);
  }
}

// ---------- メイン ----------

say('');
say(`${C.bold}時計価格ナビ ─ APIキー設定${C.reset}`);
say(`${C.dim}取得したキーを貼り付けてEnterを押してください。あとで設定するものは空欄のままEnterでOKです。${C.reset}`);
say(`${C.dim}貼り付けは右クリックでできます。途中でやめるときは Ctrl+C。${C.reset}`);

const existing = readEnv();
const answers = {};
for (const f of FIELDS) {
  const current = f.virtual
    ? (existing.NEXT_PUBLIC_SITE_URL || '').match(/https:\/\/([^.]+)\.github\.io/)?.[1] ?? ''
    : existing[f.key];
  answers[f.key] = await prompt(f, current && !current.includes('YOUR_GITHUB') ? current : '');
}
rl.close();

const user = answers.GITHUB_USER;
// GitHubアカウントが未取得のうちは localhost を Origin に使う。
// 楽天のアプリ登録で「許可サイト」に http://localhost:3000 を入れておけばテストは通る。
const siteUrl = user
  ? `https://${user}.github.io`
  : (existing.NEXT_PUBLIC_SITE_URL && !existing.NEXT_PUBLIC_SITE_URL.includes('YOUR_GITHUB')
      ? existing.NEXT_PUBLIC_SITE_URL
      : 'http://localhost:3000');
const basePath = user ? '/watch-price-navi' : (existing.NEXT_PUBLIC_BASE_PATH ?? '/watch-price-navi');

const env = {
  RAKUTEN_APP_ID: answers.RAKUTEN_APP_ID,
  RAKUTEN_ACCESS_KEY: answers.RAKUTEN_ACCESS_KEY,
  RAKUTEN_ORIGIN: siteUrl,
  RAKUTEN_AFFILIATE_ID: answers.RAKUTEN_AFFILIATE_ID,
  RAKUTEN_GENRE_ID: existing.RAKUTEN_GENRE_ID || '558929',
  YAHOO_APP_ID: answers.YAHOO_APP_ID,
  VC_SID: answers.VC_SID,
  VC_PID: answers.VC_PID,
  ANTHROPIC_API_KEY: answers.ANTHROPIC_API_KEY,
  BLOG_MODEL: existing.BLOG_MODEL || '',
  NEXT_PUBLIC_SITE_URL: siteUrl,
  NEXT_PUBLIC_BASE_PATH: basePath,
  NEXT_PUBLIC_ADSENSE_CLIENT: existing.NEXT_PUBLIC_ADSENSE_CLIENT || '',
  NEXT_PUBLIC_ADSENSE_SLOT: existing.NEXT_PUBLIC_ADSENSE_SLOT || '',
  NEXT_PUBLIC_VC_PID: answers.VC_PID || existing.NEXT_PUBLIC_VC_PID || '',
  NEXT_PUBLIC_CONTACT_EMAIL: existing.NEXT_PUBLIC_CONTACT_EMAIL || '',
};

const body = `# 時計価格ナビ 環境変数（tools/setup-keys.mjs が生成）
# このファイルは git 管理外です。安全にキーを書けます。
# 書き換えるときは「キー設定.bat」をもう一度実行するのが安全です。

# --- 楽天 ---
RAKUTEN_APP_ID=${env.RAKUTEN_APP_ID}
RAKUTEN_ACCESS_KEY=${env.RAKUTEN_ACCESS_KEY}
# 新APIが要求する Origin。楽天アプリ登録の「許可サイト」とドメインを一致させること
RAKUTEN_ORIGIN=${env.RAKUTEN_ORIGIN}
RAKUTEN_AFFILIATE_ID=${env.RAKUTEN_AFFILIATE_ID}
RAKUTEN_GENRE_ID=${env.RAKUTEN_GENRE_ID}

# --- Yahoo! ---
YAHOO_APP_ID=${env.YAHOO_APP_ID}
VC_SID=${env.VC_SID}
VC_PID=${env.VC_PID}

# --- ブログ自動生成（任意）---
ANTHROPIC_API_KEY=${env.ANTHROPIC_API_KEY}
BLOG_MODEL=${env.BLOG_MODEL}

# --- サイト表示（ビルド時に埋め込まれる公開情報）---
NEXT_PUBLIC_SITE_URL=${env.NEXT_PUBLIC_SITE_URL}
NEXT_PUBLIC_BASE_PATH=${env.NEXT_PUBLIC_BASE_PATH}
NEXT_PUBLIC_ADSENSE_CLIENT=${env.NEXT_PUBLIC_ADSENSE_CLIENT}
NEXT_PUBLIC_ADSENSE_SLOT=${env.NEXT_PUBLIC_ADSENSE_SLOT}
NEXT_PUBLIC_VC_PID=${env.NEXT_PUBLIC_VC_PID}
NEXT_PUBLIC_CONTACT_EMAIL=${env.NEXT_PUBLIC_CONTACT_EMAIL}
`;

if (fs.existsSync(ENV_FILE)) {
  fs.copyFileSync(ENV_FILE, `${ENV_FILE}.backup`);
}
fs.writeFileSync(ENV_FILE, body, 'utf8');

say('');
say(`${C.bold}保存しました${C.reset} → ${ENV_FILE}`);
if (fs.existsSync(`${ENV_FILE}.backup`)) say(`${C.dim}（元の内容は .env.backup に退避しました）${C.reset}`);

say('');
say(`${C.bold}接続テストをします…${C.reset}`);
await testRakuten(env);
await testYahoo(env);

say('');
const missing = [];
if (!env.RAKUTEN_APP_ID) missing.push('楽天のアプリID …… https://webservice.rakuten.co.jp/');
if (!env.RAKUTEN_ACCESS_KEY) missing.push('楽天のアクセスキー …… アプリIDと同じ画面');
if (!env.YAHOO_APP_ID) missing.push('Yahoo!のClient ID …… https://e.developer.yahoo.co.jp/dashboard/');

if (missing.length === 0) {
  say(`${C.bold}次にやること${C.reset}`);
  say('  1. このウィンドウを閉じて「価格を取得.bat」を実行すると、実際に価格が入ります');
  say('  2. 「サイトを開く.bat」でローカルで確認できます');
  say('  3. GitHubに公開する手順は docs/セットアップ手順.md を見てください');
} else {
  say(`${C.yellow}${C.bold}まだ足りないキー${C.reset}${C.dim}（取得したら、もう一度この「キー設定.bat」を実行するだけでOK）${C.reset}`);
  for (const m of missing) say(`  ・${m}`);
  say('');
  say(`${C.dim}すでに入力した分は保存済みなので、消えることはありません。${C.reset}`);
}
say('');
