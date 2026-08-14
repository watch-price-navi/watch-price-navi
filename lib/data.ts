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
export const MIN_OFFERS_FOR_PAGE = Number(process.env.MIN_OFFERS_FOR_PAGE ?? 2);

export function hasOwnPage(brandId: string, modelId: string): boolean {
  const s = getSummary()[`${brandId}/${modelId}`];
  return (s?.offerCount ?? 0) >= MIN_OFFERS_FOR_PAGE;
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
