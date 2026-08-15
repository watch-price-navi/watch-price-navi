import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { fixDeadLinks, insertFigures } from '@/lib/blog-figures';
import AdSlot from '@/components/AdSlot';
import ModelCard from '@/components/ModelCard';
import { absUrl } from '@/lib/config';
import { getBlogPost, getBlogPosts } from '@/lib/blog';
import { getModel, getSummary } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { LANGS, t, type Lang } from '@/lib/i18n';

export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.flatMap((lang) => getBlogPosts().map((p) => ({ lang, slug: p.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang: langStr, slug } = await params;
  const lang = langStr as Lang;
  const post = getBlogPost(slug);
  if (!post) return {};
  return {
    title: lang === 'ja' ? post.title_ja : post.title_en,
    description: lang === 'ja' ? post.description_ja : post.description_en,
    alternates: {
      canonical: absUrl(`/${lang}/blog/${slug}/`),
      languages: {
        ja: absUrl(`/ja/blog/${slug}/`),
        en: absUrl(`/en/blog/${slug}/`),
        'x-default': absUrl(`/en/blog/${slug}/`),
      },
    },
    openGraph: { type: 'article', publishedTime: post.date },
  };
}

function resolveModels(ids: string[]) {
  return ids
    .map((id) => {
      const [brandId, modelId] = id.split('/');
      if (!brandId || !modelId) return null;
      const found = getModel(brandId, modelId);
      return found ? { brandId, modelId, ...found } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang: langStr, slug } = await params;
  const lang = langStr as Lang;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const summary = getSummary();
  const body = lang === 'ja' ? post.body_ja : post.body_en;
  // 先にページの無いモデルへのリンクを向け直し（404を残さない）、
  // そのうえで本文中のモデルリンクを目印に商品写真を差し込む（記事データは変更しない）
  const html = insertFigures(
    fixDeadLinks(marked.parse(body || '', { async: false }) as string, lang),
    lang,
  );
  const related = resolveModels(post.relatedModels);
  const hero = post.heroModel ? resolveModels([post.heroModel])[0] ?? null : null;
  const heroSummary = post.heroModel ? summary[post.heroModel] ?? null : null;
  const others = getBlogPosts().filter((p) => p.slug !== post.slug).slice(0, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: lang === 'ja' ? post.title_ja : post.title_en,
    description: lang === 'ja' ? post.description_ja : post.description_en,
    datePublished: post.date,
    dateModified: post.date,
    inLanguage: lang === 'ja' ? 'ja-JP' : 'en-US',
    mainEntityOfPage: absUrl(`/${lang}/blog/${slug}/`),
  };

  return (
    <div className="container">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> ›{' '}
        <Link href={`/${lang}/blog/`}>{t(lang, 'blog_title')}</Link> › {lang === 'ja' ? post.title_ja : post.title_en}
      </nav>

      <article className="article">
        <header className="article-head">
          <time className="post-date">
            {t(lang, 'published')}: {formatDate(post.date, lang)}
          </time>
          <h1>{lang === 'ja' ? post.title_ja : post.title_en}</h1>
          <p className="page-sub">{lang === 'ja' ? post.description_ja : post.description_en}</p>
        </header>

        {hero && (
          <aside className="hero-cta">
            {heroSummary?.image && <img src={imageUrl(heroSummary.image, 'hero') ?? ''} alt="" loading="lazy" />}
            <div className="hc-body">
              <div className="card-brand">{lang === 'ja' ? hero.brand.name_ja : hero.brand.name_en}</div>
              <div className="hc-name">{lang === 'ja' ? hero.model.name_ja : hero.model.name_en}</div>
              {heroSummary && (
                <div className="hc-price">
                  {t(lang, 'lowest_price')}{' '}
                  <b>
                    {lang === 'ja'
                      ? `¥${heroSummary.lowestPrice.toLocaleString('ja-JP')}`
                      : `JPY ${heroSummary.lowestPrice.toLocaleString('en-US')}`}
                  </b>
                </div>
              )}
              <Link className="btn" href={`/${lang}/watch/${hero.brandId}/${hero.modelId}/`}>
                {t(lang, 'blog_hero_cta')} →
              </Link>
            </div>
          </aside>
        )}

        <div className="prose article-body" dangerouslySetInnerHTML={{ __html: html }} />

        <AdSlot />

        {related.length > 0 && (
          <section className="section" style={{ paddingTop: 8 }}>
            <h2 className="section-title">{t(lang, 'blog_related')}</h2>
            <div className="grid grid-models">
              {related.map((r) => (
                <ModelCard
                  key={`${r.brandId}/${r.modelId}`}
                  lang={lang}
                  brandId={r.brandId}
                  brand={r.brand}
                  model={r.model}
                  lowest={summary[`${r.brandId}/${r.modelId}`] ?? null}
                />
              ))}
            </div>
          </section>
        )}

        <aside className="cta-band">
          <b>{t(lang, 'blog_cta_title')}</b>
          <p>{t(lang, 'blog_cta_body')}</p>
          <Link className="btn" href={`/${lang}/search/`}>
            {t(lang, 'search_page_title')} →
          </Link>
        </aside>

        {others.length > 0 && (
          <section className="section" style={{ paddingTop: 8 }}>
            <h2 className="section-title">{t(lang, 'blog_latest')}</h2>
            <div className="grid grid-models">
              {others.map((p) => (
                <Link key={p.slug} href={`/${lang}/blog/${p.slug}/`} className="card">
                  <time className="post-date">{formatDate(p.date, lang)}</time>
                  <div className="card-name">{lang === 'ja' ? p.title_ja : p.title_en}</div>
                  <div className="card-nodata">{t(lang, 'blog_read')} →</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <p style={{ marginTop: 24 }}>
          <Link className="btn btn-outline" href={`/${lang}/blog/`}>
            ← {t(lang, 'blog_back')}
          </Link>
        </p>
      </article>
    </div>
  );
}
