import Link from 'next/link';
import ModelCard from '@/components/ModelCard';
import SearchBox from '@/components/SearchBox';
import { getBlogPosts } from '@/lib/blog';
import { getAllBrands, getSummary } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

const ENTRY_POINTS: { q: string; ja: string; en: string }[] = [
  { q: 'tag=diver', ja: 'ダイバーズ', en: 'Divers' },
  { q: 'tag=chronograph', ja: 'クロノグラフ', en: 'Chronographs' },
  { q: 'tag=gmt', ja: 'GMT', en: 'GMT' },
  { q: 'tag=dress', ja: 'ドレス', en: 'Dress' },
  { q: 'material=titanium', ja: 'チタン', en: 'Titanium' },
  { q: 'material=carbon', ja: 'カーボン', en: 'Carbon' },
  { q: 'movement=spring-drive', ja: 'スプリングドライブ', en: 'Spring Drive' },
  { q: 'price=u5&price=5-10', ja: '10万円以下', en: 'Under ¥100k' },
];

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const brands = getAllBrands();
  const summary = getSummary();
  const posts = getBlogPosts().slice(0, 3);
  const modelCount = brands.reduce((s, b) => s + b.models.length, 0);

  const popular = brands
    .flatMap((b) => b.models.filter((m) => m.popular).map((m) => ({ brand: b.brand, model: m })))
    .sort((a, b) => {
      const pa = summary[`${a.brand.id}/${a.model.id}`] ? 0 : 1;
      const pb = summary[`${b.brand.id}/${b.model.id}`] ? 0 : 1;
      return pa - pb;
    })
    .slice(0, 12);

  return (
    <>
      <section className="hero">
        <div className="container">
          <span className="eyebrow">{lang === 'ja' ? '毎日自動更新の価格比較' : 'Prices updated daily'}</span>
          <h1>{t(lang, 'hero_title')}</h1>
          <p className="sub">{t(lang, 'hero_sub')}</p>
          <SearchBox lang={lang} />
          <div className="hero-links">
            {ENTRY_POINTS.map((e) => (
              <Link key={e.q} href={`/${lang}/search/?${e.q}`}>
                {lang === 'ja' ? e.ja : e.en}
              </Link>
            ))}
          </div>
          <div className="hero-stats">
            <div className="stat">
              <b>{brands.length}</b>
              <span>{t(lang, 'stats_brands')}</span>
            </div>
            <div className="stat">
              <b>{modelCount}</b>
              <span>{t(lang, 'stats_models')}</span>
            </div>
            <div className="stat">
              <b>365</b>
              <span>{t(lang, 'stats_daily')}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t(lang, 'popular_models')}</h2>
            <Link className="section-more" href={`/${lang}/search/`}>
              {t(lang, 'search_page_title')} →
            </Link>
          </div>
          <div className="grid grid-models">
            {popular.map(({ brand, model }) => (
              <ModelCard
                key={`${brand.id}/${model.id}`}
                lang={lang}
                brandId={brand.id}
                brand={brand}
                model={model}
                lowest={summary[`${brand.id}/${model.id}`] ?? null}
              />
            ))}
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-head">
              <h2 className="section-title">{t(lang, 'blog_latest')}</h2>
              <Link className="section-more" href={`/${lang}/blog/`}>
                {t(lang, 'blog_all')} →
              </Link>
            </div>
            <div className="grid grid-posts">
              {posts.map((p) => {
                const hero = p.heroModel ? summary[p.heroModel] : null;
                return (
                  <Link key={p.slug} href={`/${lang}/blog/${p.slug}/`} className="card post-card">
                    <div className="pc-media">
                      {hero?.image ? (
                        <img src={hero.image} alt="" loading="lazy" />
                      ) : (
                        <div className="pc-noimg">{lang === 'ja' ? '時計ブログ' : 'Journal'}</div>
                      )}
                    </div>
                    <div className="pc-body">
                      <time className="post-date">{formatDate(p.date, lang)}</time>
                      <h3 className="post-title">{lang === 'ja' ? p.title_ja : p.title_en}</h3>
                      <p className="post-desc">{lang === 'ja' ? p.description_ja : p.description_en}</p>
                      <span className="post-more">{t(lang, 'blog_read')} →</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <div className="section-head">
            <h2 className="section-title">{t(lang, 'all_brands')}</h2>
            <Link className="section-more" href={`/${lang}/brands/`}>
              {t(lang, 'view_all_brands')} →
            </Link>
          </div>
          <div className="grid grid-brands">
            {brands.map((b) => (
              <Link key={b.brand.id} href={`/${lang}/brands/${b.brand.id}/`} className="card brand-card">
                <h3>{b.brand.name_en}</h3>
                <div className="bc-ja">{lang === 'ja' ? b.brand.name_ja : b.brand.country}</div>
                <div className="bc-meta">
                  {b.models.length} {t(lang, 'models_count')}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">{t(lang, 'how_title')}</h2>
          <div className="how-grid">
            {[1, 2, 3].map((n) => (
              <div className="card" key={n}>
                <span className="how-num">{n}</span>
                <b>{t(lang, `how_${n}_t`)}</b>
                <p>{t(lang, `how_${n}_b`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
