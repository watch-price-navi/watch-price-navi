import type { Lang } from './i18n';

export function formatJpy(n: number, lang: Lang): string {
  if (lang === 'ja') return `¥${n.toLocaleString('ja-JP')}`;
  return `JPY ${n.toLocaleString('en-US')}`;
}

export function formatDate(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(lang === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: lang === 'ja' ? 'long' : 'short',
    day: 'numeric',
  });
}
