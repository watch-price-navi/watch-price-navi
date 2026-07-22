import fs from 'node:fs';
import path from 'node:path';

export interface BlogPost {
  slug: string;
  date: string;
  title_ja: string;
  title_en: string;
  description_ja: string;
  description_en: string;
  body_ja: string;
  body_en: string;
  heroModel: string | null;
  relatedModels: string[];
  topics: string[];
}

const blogDir = path.join(process.cwd(), 'data', 'blog');

let postsCache: BlogPost[] | null = null;

export function getBlogPosts(): BlogPost[] {
  if (postsCache) return postsCache;
  const list: BlogPost[] = [];
  if (fs.existsSync(blogDir)) {
    for (const f of fs.readdirSync(blogDir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(blogDir, f), 'utf8')) as BlogPost;
        if (p?.slug && p?.date && p?.title_ja && p?.body_ja) {
          p.relatedModels = Array.isArray(p.relatedModels) ? p.relatedModels : [];
          p.topics = Array.isArray(p.topics) ? p.topics : [];
          p.heroModel = p.heroModel ?? null;
          list.push(p);
        }
      } catch (e) {
        console.warn(`[blog] skipping malformed post: ${f}`, e);
      }
    }
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.slug < b.slug ? 1 : -1));
  postsCache = list;
  return postsCache;
}

export function getBlogPost(slug: string): BlogPost | null {
  return getBlogPosts().find((p) => p.slug === slug) ?? null;
}
