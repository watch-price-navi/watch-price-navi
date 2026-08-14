import type { MetadataRoute } from 'next';
import { absUrl } from '@/lib/config';
import { getBlogPosts } from '@/lib/blog';
import { getAllBrands, hasOwnPage } from '@/lib/data';
import { LANGS } from '@/lib/i18n';

// sitemapは1ファイル50,000URLまで(Google仕様)。自動カタログでモデル数が数万規模に
// 成長しても超えないよう、40,000URLごとに /sitemap/<n>.xml へ分割する。
// 分割された各sitemapのURLは robots.txt に自動で列挙される(app/robots.ts)。
export const SITEMAP_CHUNK = 40_000;

let cache: MetadataRoute.Sitemap | null = null;

export function allSitemapEntries(): MetadataRoute.Sitemap {
  if (cache) return cache;
  const entries: MetadataRoute.Sitemap = [];
  const brands = getAllBrands();
  const posts = getBlogPosts();
  for (const lang of LANGS) {
    entries.push({ url: absUrl(`/${lang}/`), changeFrequency: 'daily', priority: 1 });
    entries.push({ url: absUrl(`/${lang}/search/`), changeFrequency: 'daily', priority: 0.9 });
    entries.push({ url: absUrl(`/${lang}/blog/`), changeFrequency: 'daily', priority: 0.8 });
    entries.push({ url: absUrl(`/${lang}/brands/`), changeFrequency: 'weekly', priority: 0.8 });
    for (const p of posts) {
      entries.push({
        url: absUrl(`/${lang}/blog/${p.slug}/`),
        lastModified: p.date,
        changeFrequency: 'monthly',
        priority: 0.7,
      });
    }
    for (const p of ['about', 'privacy', 'disclaimer']) {
      entries.push({ url: absUrl(`/${lang}/${p}/`), changeFrequency: 'yearly', priority: 0.2 });
    }
    for (const b of brands) {
      entries.push({ url: absUrl(`/${lang}/brands/${b.brand.id}/`), changeFrequency: 'daily', priority: 0.7 });
      for (const m of b.models) {
        if (!hasOwnPage(b.brand.id, m.id)) continue; // 生成しないページはsitemapに載せない
        if (lang !== 'ja' && m.source === 'auto') continue; // 自動収録は日本語のみ
        entries.push({
          url: absUrl(`/${lang}/watch/${b.brand.id}/${m.id}/`),
          changeFrequency: 'daily',
          priority: m.popular ? 0.9 : 0.6,
        });
      }
    }
  }
  cache = entries;
  return entries;
}

export function sitemapCount(): number {
  return Math.max(1, Math.ceil(allSitemapEntries().length / SITEMAP_CHUNK));
}
