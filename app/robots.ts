import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/config';
import { sitemapCount } from '@/lib/sitemap-entries';

export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  const base = `${SITE.url}${SITE.basePath}`;
  return {
    rules: { userAgent: '*', allow: '/' },
    // sitemapは40,000URLごとに /sitemap/<n>.xml へ分割される(lib/sitemap-entries.ts)
    sitemap: Array.from({ length: sitemapCount() }, (_, i) => `${base}/sitemap/${i}.xml`),
  };
}
