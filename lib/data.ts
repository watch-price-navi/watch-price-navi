import fs from 'node:fs';
import path from 'node:path';

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
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as BrandCatalog;
      if (parsed?.brand?.id && Array.isArray(parsed.models)) list.push(parsed);
    } catch (e) {
      console.warn(`[data] skipping malformed brand file: ${f}`, e);
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
    return JSON.parse(fs.readFileSync(file, 'utf8')) as PriceData;
  } catch {
    return null;
  }
}

let summaryCache: Record<string, SummaryEntry> | null = null;

export function getSummary(): Record<string, SummaryEntry> {
  if (summaryCache) return summaryCache;
  const file = path.join(dataDir, 'prices', 'summary.json');
  try {
    summaryCache = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, SummaryEntry>) : {};
  } catch {
    summaryCache = {};
  }
  return summaryCache;
}

export function getLowest(brandId: string, modelId: string): SummaryEntry | null {
  return getSummary()[`${brandId}/${modelId}`] ?? null;
}

let dealersCache: Dealer[] | null = null;

export function getDealers(): Dealer[] {
  if (dealersCache) return dealersCache;
  const file = path.join(dataDir, 'dealers.json');
  try {
    dealersCache = fs.existsSync(file) ? ((JSON.parse(fs.readFileSync(file, 'utf8')) as { dealers: Dealer[] }).dealers ?? []) : [];
  } catch {
    dealersCache = [];
  }
  return dealersCache;
}
