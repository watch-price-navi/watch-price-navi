import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './json';

export interface BrandInfo {
  id: string;
  name_en: string;
  name_ja: string;
  country: string;
  founded: number | null;
  officialUrl: string | null;
  description_ja: string;
  description_en: string;
}

export interface WatchModel {
  id: string;
  name_en: string;
  name_ja: string;
  reference: string | null;
  collection_en: string | null;
  collection_ja: string | null;
  caseSizeMm: number | null;
  movementType: string | null;
  caliber: string | null;
  listPriceJpy: number | null;
  priceFloorJpy: number;
  searchKeywordJa: string;
  searchKeywordEn: string;
  tags: string[];
  popular: boolean;
  summary_ja: string;
  summary_en: string;
  caseMaterial?: string | null;
  waterResistanceM?: number | null;
  gender?: string | null;
  releaseYear?: number | null;
  addedAt?: string | null;
  /** 'auto' は出品データから自動収録したモデル（人手カタログの補完） */
  source?: 'auto' | undefined;
  listingCount?: number;
}

export interface BrandCatalog {
  brand: BrandInfo;
  models: WatchModel[];
}

export interface Offer {
  source: 'rakuten' | 'yahoo';
  title: string;
  price: number;
  url: string;
  shop: string;
  image: string | null;
  condition: 'new' | 'used' | 'unknown';
}

export interface PriceData {
  updatedAt: string;
  offers: Offer[];
}

export interface SummaryEntry {
  lowestPrice: number;
  source: string;
  shop: string;
  offerCount: number;
  updatedAt: string;
  image?: string | null;
  lowestNew?: number | null;
  lowestUsed?: number | null;
}

export interface Dealer {
  id: string;
  name_ja: string;
  name_en: string;
  homepage: string;
  searchUrlTemplate: string | null;
  handles: 'new' | 'used' | 'both';
  /** 成果報酬のある提携先。true なら rel="sponsored" と広告表示を出す */
  affiliate?: boolean;
  /**
   * ASP発行の成果計測リンク。指定時はこれをそのまま使う。
   * ASPのリンクは飛び先が固定でモデル名を渡せないため、searchUrlTemplate より優先する
   * （URLを加工すると成果が計上されない）。
   */
  affiliateUrl?: string;
  /**
   * eBay Partner Network のキャンペーンID。
   * 公開ページのリンクにそのまま現れる値なので秘密情報ではない。
   * 型番ごとの検索URLに付けて使うため、affiliateUrl とは別に持つ。
   */
  campaignId?: string;
  note_ja: string;
  note_en: string;
}

const dataDir = path.join(process.cwd(), 'data');

let brandsCache: BrandCatalog[] | null = null;

export function getAllBrands(): BrandCatalog[] {
  if (brandsCache) return brandsCache;
  const dir = path.join(dataDir, 'brands');
  if (!fs.existsSync(dir)) {
    brandsCache = [];
    return brandsCache;
  }
  const list: BrandCatalog[] = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const parsed = readJson<BrandCatalog>(path.join(dir, f));
      if (parsed?.brand?.id && Array.isArray(parsed.models)) list.push(parsed);
    } catch (e) {
      console.warn(`[data] skipping malformed brand file: ${f}`, e);
    }
  }

  // 出品データから自動収録したモデルを追記する（人手カタログの型番・IDが常に優先）
  const autoDir = path.join(dataDir, 'brands-auto');
  if (fs.existsSync(autoDir)) {
    for (const cat of list) {
      const file = path.join(autoDir, `${cat.brand.id}.json`);
      if (!fs.existsSync(file)) continue;
      try {
        const auto = readJson<{ models: WatchModel[] }>(file);
        const takenIds = new Set(cat.models.map((m) => m.id));
        const takenRefs = new Set(
          cat.models.filter((m) => m.reference).map((m) => m.reference!.toUpperCase().replace(/[.\-/\s]/g, ''))
        );
        for (const m of auto.models ?? []) {
          const ref = m.reference ? m.reference.toUpperCase().replace(/[.\-/\s]/g, '') : null;
          if (takenIds.has(m.id) || (ref && takenRefs.has(ref))) continue;
          takenIds.add(m.id);
          if (ref) takenRefs.add(ref);
          cat.models.push({ ...m, source: 'auto' });
        }
      } catch (e) {
        console.warn(`[data] skipping malformed auto-catalog: ${cat.brand.id}`, e);
      }
    }
  }

  list.sort((a, b) => a.brand.name_en.localeCompare(b.brand.name_en));
  brandsCache = list;
  return list;
}

export function getBrand(brandId: string): BrandCatalog | null {
  return getAllBrands().find((b) => b.brand.id === brandId) ?? null;
}

export function getModel(brandId: string, modelId: string): { brand: BrandInfo; model: WatchModel } | null {
  const cat = getBrand(brandId);
  if (!cat) return null;
  const model = cat.models.find((m) => m.id === modelId);
  return model ? { brand: cat.brand, model } : null;
}

export function getPriceData(brandId: string, modelId: string): PriceData | null {
  const file = path.join(dataDir, 'prices', brandId, `${modelId}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return readJson<PriceData>(file);
  } catch {
    return null;
  }
}

let summaryCache: Record<string, SummaryEntry> | null = null;

export function getSummary(): Record<string, SummaryEntry> {
  if (summaryCache) return summaryCache;
  const file = path.join(dataDir, 'prices', 'summary.json');
  try {
    summaryCache = fs.existsSync(file) ? readJson<Record<string, SummaryEntry>>(file) : {};
  } catch {
    summaryCache = {};
  }
  return summaryCache;
}

export function getLowest(brandId: string, modelId: string): SummaryEntry | null {
  return getSummary()[`${brandId}/${modelId}`] ?? null;
}

/**
 * 個別ページを生成するかどうか。
 *
 * 掲載は29,000モデルあるが、その6割は「1店舗しか扱いがない」もので、
 * 価格比較のしようがない（比べる相手がいない）。そこにページを作っても
 * 薄い内容が並ぶだけで、Googleはサイト全体の評価を下げる。
 * さらに全件を生成すると出力が3.7GBになり、GitHub Pagesの上限1GBを超えて
 * 公開自体が失敗する。
 *
 * そこで「複数店舗の価格を比べられるモデル」だけを個別ページにする。
 * 1店舗だけのモデルは検索には出るが、リンク先は販売店へ直接向ける
 * （比較する中身が無いので、そのほうが利用者にとっても速い）。
 */
// 1 = 価格が取れた全モデルにページを用意する。
// 出品1店のモデルは関連モデル・取扱店一覧・広告枠を省いた軽量ページになる
// （app/[lang]/watch/[brand]/[model]/page.tsx の compact 分岐）。
// 「型番で検索したらページに辿り着ける」ことを優先した設定。
export const MIN_OFFERS_FOR_PAGE = Number(process.env.MIN_OFFERS_FOR_PAGE ?? 2);

let curatedKeysCache: Set<string> | null = null;

/** 人手カタログ（source が 'auto' でない）のモデル。29,000件を何度も走査しないよう一度だけ作る */
function getCuratedKeys(): Set<string> {
  if (curatedKeysCache) return curatedKeysCache;
  const s = new Set<string>();
  for (const cat of getAllBrands()) {
    for (const m of cat.models) {
      if (m.source !== 'auto') s.add(`${cat.brand.id}/${m.id}`);
    }
  }
  curatedKeysCache = s;
  return s;
}

export function hasOwnPage(brandId: string, modelId: string): boolean {
  // 人手カタログの968件は、出品が1件も無くても必ずページを持たせる。
  //
  // ここを出品数だけで判定していたため、記事が参照する基幹モデルのページが
  // 生成されず、本文のリンクが24本まとめて404になっていた。
  // しかも記事が取り上げる名品ほど国内に在庫が無い（雪白SBGA211、ランゲ サクソニア、
  // リシャール・ミル等）ので、価値の高いページから順に消えるという最悪の形だった。
  //
  // 出品が無いモデルほど「買いたい人」より「持っていて相場を知りたい人」が来るため、
  // 買取査定への導線としてはむしろ価値が高い、という事情もある。
  if (getCuratedKeys().has(`${brandId}/${modelId}`)) return true;

  const summary = getSummary();
  // 価格データが1件も無い状態でビルドされることがある。
  // 価格は API 規約（取得データの恒久保存の禁止）でリポジトリに保存していないため、
  // 収集を伴わない実行（コード修正時の push など）では data/prices が存在しない。
  // その場合は上の人手カタログだけが対象になる（generateStaticParams は空にならない）。
  if (Object.keys(summary).length === 0) return false;

  const s = summary[`${brandId}/${modelId}`];
  return (s?.offerCount ?? 0) >= MIN_OFFERS_FOR_PAGE;
}

export interface KaitoriService {
  id: string;
  name_ja: string;
  name_en: string;
  url: string;
  asp?: string;
  reward_note?: string;
  note_ja: string;
  note_en: string;
}

export interface KaitoriData {
  disclosure_ja: string;
  disclosure_en: string;
  services: KaitoriService[];
}

let kaitoriCache: KaitoriData | null = null;

/** 時計買取の広告主。提携前は services の url が空で、その場合は表示しない */
export function getKaitori(): KaitoriData {
  if (kaitoriCache) return kaitoriCache;
  const file = path.join(dataDir, 'kaitori.json');
  try {
    kaitoriCache = fs.existsSync(file)
      ? readJson<KaitoriData>(file)
      : { disclosure_ja: '', disclosure_en: '', services: [] };
  } catch {
    kaitoriCache = { disclosure_ja: '', disclosure_en: '', services: [] };
  }
  return kaitoriCache;
}

let dealersCache: Dealer[] | null = null;

export function getDealers(): Dealer[] {
  if (dealersCache) return dealersCache;
  const file = path.join(dataDir, 'dealers.json');
  try {
    dealersCache = fs.existsSync(file) ? (readJson<{ dealers: Dealer[] }>(file).dealers ?? []) : [];
  } catch {
    dealersCache = [];
  }
  return dealersCache;
}
