import type { MetadataRoute } from 'next';
import { SITEMAP_CHUNK, allSitemapEntries, sitemapCount } from '@/lib/sitemap-entries';

export const dynamic = 'force-static';

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  return Array.from({ length: sitemapCount() }, (_, i) => ({ id: i }));
}

export default function sitemap({ id }: { id: number }): MetadataRoute.Sitemap {
  return allSitemapEntries().slice(id * SITEMAP_CHUNK, (id + 1) * SITEMAP_CHUNK);
}
