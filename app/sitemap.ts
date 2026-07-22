import type { MetadataRoute } from 'next';
import { absUrl } from '@/lib/config';
import { getBlogPosts } from '@/lib/blog';
import { getAllBrands } from '@/lib/data';
import { LANGS } from '@/lib/i18n';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
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
        entries.push({
          url: absUrl(`/${lang}/watch/${b.brand.id}/${m.id}/`),
          changeFrequency: 'daily',
          priority: m.popular ? 0.9 : 0.6,
        });
      }
    }
  }
  return entries;
}
