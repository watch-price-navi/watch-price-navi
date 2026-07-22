import Link from 'next/link';
import SearchBox from '@/components/SearchBox';
import { getAllBrands, getSummary } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const brands = getAllBrands();
  const summary = getSummary();
  const modelCount = brands.reduce((s, b) => s + b.models.length, 0);

  const popular = brands
    .flatMap((b) => b.models.filter((m) => m.popular).map((m) => ({ brand: b.brand, model: m })))
    .slice(0, 12);

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{t(lang, 'hero_title')}</h1>
          <p className="sub">{t(lang, 'hero_sub')}</p>
          <SearchBox lang={lang} />
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
          <h2 className="section-title">{t(lang, 'popular_models')}</h2>
          <div className="grid grid-models">
            {popular.map(({ brand, model }) => {
              const lowest = summary[`${brand.id}/${model.id}`];
              return (
                <Link key={`${brand.id}/${model.id}`} href={`/${lang}/watch/${brand.id}/${model.id}/`} className="card">
                  <div className="card-brand">{lang === 'ja' ? brand.name_ja : brand.name_en}</div>
                  <div className="card-name">{lang === 'ja' ? model.name_ja : model.name_en}</div>
                  {model.reference && <div className="card-ref">Ref. {model.reference}</div>}
                  {lowest ? (
                    <div className="card-price">
                      {formatJpy(lowest.lowestPrice, lang)}
                      <small>{t(lang, 'lowest_price')}</small>
                    </div>
                  ) : (
                    <div className="card-nodata">{t(lang, 'view_model')} →</div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">{t(lang, 'all_brands')}</h2>
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
