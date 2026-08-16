import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { marked } from 'marked';
import { fixDeadLinks, insertFigures, insertHeritageFigures, withBasePath } from '@/lib/blog-figures';
import AdSlot from '@/components/AdSlot';
import ModelCard from '@/components/ModelCard';
import StylingSection from '@/components/StylingSection';
import { absUrl } from '@/lib/config';
import { getBlogPost, getBlogPosts } from '@/lib/blog';
import { getBrand, getModel, getSummary } from '@/lib/data';
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

/**
 * 「一緒に検討したいモデル」を必ず写真付きにする。
 *
 * 商品写真は楽天・Yahoo!の出品からしか取れないため、出品が無いモデルには写真が無い。
 * 写真の無いカードが混ざると誌面が崩れるので、写真のあるものだけを並べ、
 * 足りなければ同じブランドの写真があるモデルで補う。
 * 記事が挙げたモデルを優先し、補充は人気モデルから採る。
 */
function relatedWithPhotos(
  post: { relatedModels: string[]; heroModel?: string | null },
  summary: Record<string, { image?: string | null } | undefined>,
  want = 6,
) {
  const hasPhoto = (key: string) => Boolean(summary[key]?.image);
  const picked = post.relatedModels.filter(hasPhoto);
  const taken = new Set([...picked, post.heroModel ?? '']);

  if (picked.length < want) {
    // 記事が扱ったブランドの中から、写真があって人気の高いものを補う
    const brandIds = [...new Set([post.heroModel, ...post.relatedModels].filter(Boolean).map((k) => (k as string).split('/')[0]))];
    const pool = brandIds
      .flatMap((bid) => (getBrand(bid)?.models ?? []).map((m) => ({ key: `${bid}/${m.id}`, popular: Boolean(m.popular) })))
      .filter((c) => !taken.has(c.key) && hasPhoto(c.key))
      .sort((a, b) => Number(b.popular) - Number(a.popular));
    for (const c of pool) {
      if (picked.length >= want) break;
      picked.push(c.key);
      taken.add(c.key);
    }
  }
  return resolveModels(picked.slice(0, want));
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
  // 記事に登場するブランド。創業者・発祥地の写真を差し込む対象を、
  // この記事が実際に扱っているブランドに限る（他ブランドの土地の写真が紛れ込まないように）
  const articleBrands = [
    ...new Set([post.heroModel, ...post.relatedModels].filter(Boolean).map((id) => (id as string).split('/')[0])),
  ];

  // 1. ページの無いモデルへのリンクを向け直す（404を残さない）
  // 2. 創業者の肖像・発祥地の風景を、その語に触れている段落の直後に置く
  // 3. モデルリンクを目印に商品写真を差し込む
  // 4. 最後に basePath を付ける
  // いずれも記事データ自体は書き換えない
  //
  // 4 を最後にするのは、1〜3 が `/ja/watch/...` で始まる形を目印にしているため。
  // 先に basePath を付けると照合が外れ、写真もリンク修正も効かなくなる。
  const html = withBasePath(
    insertFigures(
      insertHeritageFigures(
        fixDeadLinks(marked.parse(body || '', { async: false }) as string, lang),
        lang,
        articleBrands,
      ),
      lang,
    ),
  );
  const related = relatedWithPhotos(post, summary);
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
              {/* この枠は楽天から取得した写真と価格を出している。
                  規約 第8条4項により、ここから楽天以外へリンクできないので、
                  ボタンの行き先は自サイトのモデルページではなく出品ページにする。
                  比較ページへは本文中のリンクから行ける。 */}
              {heroSummary?.url ? (
                <a
                  className="btn"
                  href={heroSummary.url}
                  target="_blank"
                  rel="sponsored nofollow noopener"
                >
                  {t(lang, 'cta_check_price')} →
                </a>
              ) : (
                <Link className="btn" href={`/${lang}/watch/${hero.brandId}/${hero.modelId}/`}>
                  {t(lang, 'blog_hero_cta')} →
                </Link>
              )}
            </div>
          </aside>
        )}

        <div className="prose article-body" dangerouslySetInnerHTML={{ __html: html }} />

        {/* 「この時計に何を着るか」。主役モデルの性格から装いを選んで出す */}
        {hero && (
          <StylingSection
            lang={lang}
            model={hero.model}
            watchName={lang === 'ja' ? hero.model.name_ja : hero.model.name_en}
          />
        )}

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
