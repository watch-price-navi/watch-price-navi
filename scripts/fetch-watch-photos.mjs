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
// --limit 0（モデルは調べずブランド写真だけ集める）を効かせるため、
// 「値が無いとき」と「0のとき」を区別する
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : ALL ? 9999 : 120;
/** 1回に調べるブランド数。39社しかないので、数回の実行で一巡する */
const BRAND_LIMIT = Number(args[args.indexOf('--brand-limit') + 1]) || 6;

/** 表示義務を果たせるライセンスだけを通す */
const ALLOWED = [/public domain/i, /^cc0/i, /^cc[ -]by([ -]sa)?[ -]?\d/i, /^cc[ -]by([ -]sa)?$/i];
/** ロゴやアイコンは時計の写真ではない */
const NOT_A_PHOTO = /logo|icon|symbol|diagram|chart|\bmap\b|signature|coat of arms/i;

/*
 * 店舗・看板・広告の写真。
 *
 * Commons では、香港やマカオのモールにあるブティックの外観が
 * 「Richard Mille watches」のような時計の分類に入っている。
 * 分類だけでは弾けないので、ファイル名でも見る。
 * 実測（2026-08-17）で、高級ブランドの写真93枚のうち17枚がこれだった。
 * リシャール・ミルは1枚しか無く、それが店の外観だったため投稿の背景が
 * 「RICHARD MILLE と書かれたガラス張りの店」になっていた。
 */
const NOT_THE_PRODUCT =
  /boutique|storefront|\bstore\b|\bshop\b|shopping|mall|building|facade|signage|\bsign\b|advertis|advert\b|billboard|booth|showroom|factory|museum|headquarters|entrance|\bstreet\b|station|plaza|avenue|exterior|window display/i;
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
/**
 * モデル名を検索できる形まで削る。
 *
 * 正式名称は具体的すぎて当たらない。実測（2026-08-17）:
 *   「Audemars Piguet 15202ST.OO.1240ST.01」         0件
 *   「Audemars Piguet Royal Oak "Jumbo" Extra-Thin」 0件
 *   「Audemars Piguet Royal Oak」                   13件
 * 引用符や括弧を落とし、先頭2語だけにすると届く。
 */
function coreName(modelEn) {
  const s = String(modelEn ?? '')
    .replace(/["'“”()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.split(' ').filter(Boolean).slice(0, 2).join(' ');
}

async function findPhotos(brandEn, modelEn, reference, want) {
  const core = coreName(modelEn);
  const queries = [
    reference ? `${brandEn} ${reference}` : null,
    `${brandEn} ${modelEn}`,
    // 正式名称で当たらないときのために、短くした名前でも引く
    core && core !== modelEn ? `${brandEn} ${core}` : null,
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
      // 店舗や看板は時計そのものではない
      if (NOT_THE_PRODUCT.test(title)) continue;
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

/* ─────────────────────────────────────────────────────────────
 * Openverse（Flickr・Wikimedia などを横断する CC 画像の検索）
 *
 * Commons だけでは足りなかった。高級時計の写真が少なく、60モデル中4件しか
 * 取れていない。Openverse は Flickr を含むので、時計愛好家が撮った
 * 裏蓋・留め金・ムーブメントといった角度違いに手が届く。
 * 実測（オメガ スピードマスター）で、裏蓋・クラスプ・真横・Cal.1861 が揃った。
 *
 * 型番では引けない（`126610LN` は0件）。CC画像に型番は付いていないので、
 * モデル名で引いて「同シリーズの別個体」として扱う。exact=false を必ず立てる。
 *
 * 改変を許すライセンスに限る。カルーセルに載せるには縦横比を揃える必要があり、
 * 余白を足す時点で改変にあたりうるため。ND（改変禁止）は除く。
 *
 * 鍵は要らないが回数制限がある。1モデル1回に留め、間隔を空けて叩く。
 * ───────────────────────────────────────────────────────────── */
const OPENVERSE = 'https://api.openverse.org/v1/images/';
/** 改変を許すものだけ。nd は含めない */
const OV_LICENSE = /^(cc0|pdm|by|by-sa)$/i;
/**
 * 時計の写真であることを示す語。
 * Commons のような分類が無いので語で見る。上の WATCH_WORD より広く、
 * 角度違い（文字盤・ムーブメント・ベゼル）も拾えるようにする。
 */
const OV_WATCH_WORD =
  /watch|wristwatch|chronograph|chronometer|horolog|timepiece|\bdial\b|movement|cali[bv]er|bezel|時計|腕時計/i;
/** ブランド名を含んでも時計ではないもの。店舗の建物やコンセプトカーで実際に混ざった */
const NOT_A_WATCH =
  /\bstore\b|\bshop\b|boutique|building|museum|factory|\bcar\b|automobile|poster|advert|billboard|magazine|packaging|\bbox\b|\blogo\b|signage|storefront|portrait of/i;

/**
 * 鍵があれば使う。無くても動くが、続けて叩くと Cloudflare のボット判定に当たる。
 * 鍵は https://api.openverse.org/v1/auth_tokens/register/ に
 * 名前・説明・メールを送るだけで取れる（無料）。
 * 取れたら OPENVERSE_CLIENT_ID / OPENVERSE_CLIENT_SECRET に入れる。
 */
let ovToken = null;
async function openverseAuth() {
  const id = process.env.OPENVERSE_CLIENT_ID;
  const secret = process.env.OPENVERSE_CLIENT_SECRET;
  if (!id || !secret || ovToken !== null) return ovToken;
  try {
    const res = await fetch('https://api.openverse.org/v1/auth_tokens/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'client_credentials' }),
    });
    const j = await res.json();
    ovToken = j.access_token ?? '';
    if (ovToken) console.log('Openverse: 鍵で認証しました');
  } catch {
    ovToken = '';
  }
  return ovToken;
}

async function findOnOpenverse(brandEn, modelEn, reference, want) {
  const q = `${brandEn} ${modelEn}`.replace(/\s+/g, ' ').trim();
  let j;
  try {
    const url = `${OPENVERSE}?${new URLSearchParams({
      q,
      license_type: 'commercial',
      page_size: '30',
    })}`;
    const token = await openverseAuth();
    const headers = { 'User-Agent': UA, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}${res.status === 401 || res.status === 429 ? '（回数制限。しばらく空けるか鍵を設定する）' : ''}`);
    j = await res.json();
  } catch (e) {
    throw new Error(`Openverse: ${e.message}`);
  }

  const brandWord = new RegExp(escRe(distinctiveWord(brandEn)), 'i');
  const refRe = reference ? new RegExp(escRe(reference).replace(/[.\-/]/g, '[.\\-/]?'), 'i') : null;
  const out = [];
  for (const r of j.results ?? []) {
    const license = String(r.license ?? '');
    if (!OV_LICENSE.test(license)) continue;
    const title = strip(r.title);
    const tags = (r.tags ?? []).map((t) => strip(t.name)).join(' ');
    const hay = `${title} ${tags}`;
    // 分類が無いぶん、ブランド名と時計の語の両方を要求して取り違えを防ぐ
    if (!brandWord.test(hay)) continue;
    if (!OV_WATCH_WORD.test(hay)) continue;
    if (NOT_A_WATCH.test(hay)) continue;
    if (COUNTERFEIT.test(hay)) continue;
    if (NOT_A_PHOTO.test(title)) continue;
    // 小さすぎるものは拡大に耐えない
    if (Number(r.width) && Number(r.width) < 600) continue;
    const src = r.url || r.thumbnail;
    if (!src) continue;

    out.push({
      title: title || q,
      src,
      license: `CC ${license.toUpperCase()}${r.license_version ? ' ' + r.license_version : ''}`,
      licenseUrl: r.license_url ?? null,
      author: cleanAuthor(r.creator),
      source: r.foreign_landing_url ?? r.url,
      provider: r.source ?? 'openverse',
      // 型番で引けないので基本 false。題名に型番があれば拾う
      exact: refRe ? refRe.test(hay) : false,
    });
    if (out.length >= want * 2) break;
  }
  return out.sort((a, b) => Number(b.exact) - Number(a.exact)).slice(0, want);
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`download ${res.status}`);
  const type = res.headers.get('content-type') ?? '';
  // Openverse の url は拡張子が無いことがある。中身で確かめる
  if (!/^image\//.test(type)) throw new Error(`画像ではない (${type})`);
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
/*
 * 見られているモデルから先に集める。
 *
 * これまではカタログのファイル順（アルファベット順）で調べていたので、
 * 誰も見ていないモデルの写真を集め、よく見られているモデルの写真が
 * いつまでも無い、ということが起きていた。
 *
 * data/page-stats.json は Search Console から取り込んだ実際の表示回数。
 * 無ければ（鍵が未設定・公開して日が浅い）従来どおりの順で進む。
 */
const viewRank = (() => {
  try {
    const s = readJson(path.join(ROOT, 'data', 'page-stats.json'));
    return (key) => s.models?.[key]?.impressions ?? 0;
  } catch {
    return () => 0;
  }
})();
targets.sort((a, b) => viewRank(`${b.brandId}/${b.model.id}`) - viewRank(`${a.brandId}/${a.model.id}`));

/*
 * 切り詰める前に「もう調べたもの」を外す。
 *
 * 順序を逆にしていたため、毎日ファイル順の先頭12件を選んでは全部スキップし、
 * 1件も新しく調べていなかった。写真のあるモデルが4件から増えなかったのはこれが理由。
 * その4件はこの仕組みを入れる前に取れたものだった。
 */
const manifestPre = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : { models: {}, checked: {} };
const recentlyChecked = (key) => {
  if (manifestPre.models?.[key]?.photos?.length) return true;
  const last = manifestPre.checked?.[key];
  return Boolean(last && Date.now() - Date.parse(last) < 30 * 86400_000);
};
const fresh = targets.filter((t) => !recentlyChecked(`${t.brandId}/${t.model.id}`));
targets.length = 0;
targets.push(...fresh.slice(0, LIMIT));
console.log(`未調査 ${fresh.length} モデルのうち ${targets.length} 件を調べます\n`);

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = fs.existsSync(MANIFEST) ? readJson(MANIFEST) : { note: '', models: {} };
manifest.note =
  'Instagram に載せる時計の実写。Wikimedia Commons と Openverse(Flickr等) の CC / PD 画像のみ。' +
  '改変を許すライセンスに限る（カルーセルは縦横比を揃える必要があり、余白を足す時点で改変にあたりうるため）。' +
  '表示義務があるので author・license・source を投稿の本文に必ず出すこと。' +
  'exact=false は同じ型番の写真とは限らない（同シリーズの別個体）。その旨を明記して使う。' +
  'checked は調べた日。何も無くても記録し、30日は調べ直さない（相手の回数制限に当たらないため）。';
manifest.models ??= {};
manifest.checked ??= {};

let withPhotos = 0;
let files = 0;
for (const t of targets) {
  const key = `${t.brandId}/${t.model.id}`;
  if (manifest.models[key]?.photos?.length) {
    withPhotos++;
    continue;
  }
  // 一度調べて何も無かったモデルを毎回調べ直さない。
  // 相手の回数制限に当たると、写真のあるモデルまで取り逃す。
  // 30日たてば新しい写真が投稿されている可能性があるので調べ直す。
  const last = manifest.checked?.[key];
  if (last && Date.now() - Date.parse(last) < 30 * 86400_000) continue;

  let photos = [];
  try {
    photos = await findPhotos(t.brandEn, t.model.name_en, t.model.reference, 4);
  } catch (e) {
    console.log(`  ! ${key} (Commons): ${e.message}`);
  }
  // Commons だけでは足りない。カルーセルには最低3枚ほしいので Openverse でも探す
  if (photos.length < 3) {
    try {
      const more = await findOnOpenverse(t.brandEn, t.model.name_en, t.model.reference, 6);
      const seen = new Set(photos.map((p) => p.src));
      for (const p of more) if (!seen.has(p.src)) photos.push(p);
      await sleep(1200); // 鍵なしなので控えめに
    } catch (e) {
      console.log(`  ! ${key} (Openverse): ${e.message}`);
    }
  }
  manifest.checked ??= {};
  manifest.checked[key] = new Date().toISOString().slice(0, 10);
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
      provider: p.provider ?? 'wikimedia',
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

/* ─── ブランド単位の写真も貯める ─────────────────────────────
 *
 * Instagram に時計が1本も写っていないのでは、時計のアカウントとして意味がない。
 * ブランドの物語を語る投稿の背景には、その会社の時計そのものが要る。
 *
 * 型番までは一致しないので「同ブランドの別のモデル」として扱う。
 * ブランドの物語を語る投稿ではそれで筋が通る（特定の1本の話をしていないため）。
 * 型番の話をする投稿（朝の表紙・ストーリー）にも使うが、その場合は
 * 「同ブランドの別モデル」と画像と本文の両方に必ず明記する（2026-08-19に方針変更。
 * 表紙が発祥地の風景になるのは時計のアカウントとして違和感がある、という運営の指摘による）。
 */
manifest.brands ??= {};
manifest.brandsChecked ??= {};
/*
 * Instagram は高級路線に絞っている（data/instagram-brands.json）。
 * 写真を貯める順番もそれに合わせる。カシオの写真から埋めても投稿には使えない。
 * 一覧に載っていないブランドも後回しで集める（サイト側では使うため）。
 */
const igOrder = (() => {
  try {
    return (readJson(path.join(ROOT, 'data/instagram-brands.json')).include ?? []).map((x) => x.id);
  } catch {
    return [];
  }
})();
const brandList = [];
for (const f of fs.readdirSync(brandsDir).filter((x) => x.endsWith('.json'))) {
  const cat = readJson(path.join(brandsDir, f));
  if (cat.brand?.id) brandList.push(cat.brand);
}
brandList.sort((a, b) => {
  const ia = igOrder.indexOf(a.id);
  const ib = igOrder.indexOf(b.id);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});
let brandShots = 0;
for (const b of brandList) {
  if ((manifest.brands[b.id]?.photos ?? []).length >= 4) continue;
  const last = manifest.brandsChecked[b.id];
  if (last && Date.now() - Date.parse(last) < 14 * 86400_000) continue;
  if (brandShots >= BRAND_LIMIT) break;

  let photos = [];
  try {
    // 「<ブランド> watch」で引く。分類に時計が入っているものだけ通るので、
    // 建物や創業者の肖像は findPhotos 側の判定で落ちる
    photos = await findPhotos(b.name_en, 'watch', null, 6);
  } catch (e) {
    console.log(`  ! ${b.id} (ブランド写真): ${e.message}`);
  }
  manifest.brandsChecked[b.id] = new Date().toISOString().slice(0, 10);
  brandShots++;
  if (!photos.length) continue;

  const saved = manifest.brands[b.id]?.photos ?? [];
  const have = new Set(saved.map((p) => p.commonsTitle));
  for (const p of photos) {
    if (have.has(p.title) || saved.length >= 6) continue;
    const ext = (p.src.match(/\.(jpe?g|png|webp)(?:$|\?)/i)?.[1] ?? 'jpg').toLowerCase();
    const name = `brand-${b.id}-${saved.length + 1}.${ext}`;
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
      provider: p.provider ?? 'wikimedia',
      // ブランド単位なので、特定の型番の写真ではない
      exact: false,
    });
    files++;
    await sleep(150);
  }
  if (saved.length) {
    manifest.brands[b.id] = { brandId: b.id, photos: saved };
    console.log(`  ◎ ${b.id} ブランド写真 ${saved.length}枚`);
  }
  await sleep(300);
}

fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
console.log(`\n写真のあるモデル ${withPhotos} 件 / 画像 ${files} 枚 → ${path.relative(ROOT, MANIFEST)}`);
console.log(`写真のあるブランド ${Object.keys(manifest.brands).length} 社`);
