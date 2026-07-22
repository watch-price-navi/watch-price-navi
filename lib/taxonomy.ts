import taxonomyData from '@/data/taxonomy.json';
import type { Lang } from './i18n';

export interface TaxEntry {
  id: string;
  ja: string;
  en: string;
}

export const CASE_MATERIALS: TaxEntry[] = taxonomyData.caseMaterials;
export const MOVEMENTS: TaxEntry[] = taxonomyData.movements;
export const TAGS: TaxEntry[] = taxonomyData.tags;
export const GENDERS: TaxEntry[] = taxonomyData.genders;

export function taxLabel(list: TaxEntry[], id: string | null | undefined, lang: Lang): string {
  if (!id) return '–';
  const e = list.find((x) => x.id === id);
  return e ? e[lang] : id;
}
