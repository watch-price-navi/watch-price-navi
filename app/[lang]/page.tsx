import Link from 'next/link';
import BrandCard from '@/components/BrandCard';
import FeaturedWatch from '@/components/FeaturedWatch';
import ModelCard from '@/components/ModelCard';
import SearchBox from '@/components/SearchBox';
import { getBlogPosts } from '@/lib/blog';
import { absUrl } from '@/lib/config';
import { postCardImage } from '@/lib/blog-figures';
import { getAllBrands, getSummary } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

/**
 * ヒーローの背景写真。現代の高級時計ブティックの店内。
 * 候補は public/img/hero-{a,b,c}.webp（PC用）と hero-{a,b,c}-sm.webp（スマホ用の切り出し）。
 * 差し替えはこの1文字を変えるだけでよい。
 * 濃い大理石（金の石目）・真鍮・照明を仕込んだオニキスという構成。
 *   a: 手前の大きなケースに時計。奥へ続く奥行きがある
 *   b: 左に陳列ケースの列、中央右に光るオニキスの壁
 *   c: 完全な左右対称。中央にオニキスの柱、左右に大きなケース
 */
const HERO = 'a';

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
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
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

  /*
   * サイト名を検索エンジンに明示する。
   * 「時計価格ナビ」という固有名詞で検索されたとき、そのサイト自身が最上位に来るには、
   * タイトルだけでなく WebSite / Organization として名前を宣言しておく方が確実に伝わる。
   * SearchAction を添えると、検索結果にサイト内検索窓が出ることがある。
   */
  const siteJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${absUrl('/')}#website`,
        url: absUrl(`/${lang}/`),
        name: lang === 'ja' ? '時計価格ナビ' : 'Watch Price Navi',
        alternateName: lang === 'ja' ? ['Watch Price Navi', 'とけいかかくナビ'] : ['時計価格ナビ'],
        inLanguage: lang === 'ja' ? 'ja-JP' : 'en-US',
        publisher: { '@id': `${absUrl('/')}#org` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absUrl(`/${lang}/search/`)}?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        '@id': `${absUrl('/')}#org`,
        name: lang === 'ja' ? '時計価格ナビ' : 'Watch Price Navi',
        url: absUrl(`/${lang}/`),
        description:
          lang === 'ja'
            ? '楽天市場・Yahoo!ショッピングの出品価格を毎日自動収集し、腕時計を型番ごとに比較できる価格比較サイト。'
            : 'A watch price comparison site that collects listings from Rakuten and Yahoo! Shopping Japan every day.',
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd) }} />
      {/* 背景写真のURLはここから渡す。CSS内の url() には basePath が付かないため
          （サブディレクトリ配信のGitHub Pagesでは404になる） */}
      <section
        className="hero"
        style={{
          ['--hero-img' as string]: `url(${basePath}/img/hero-${HERO}.webp)`,
          // スマホはワイドのまま敷くと陳列ケースが画面外に出るので、縦向きに切った版を使う
          ['--hero-img-sm' as string]: `url(${basePath}/img/hero-${HERO}-sm.webp)`,
        }}
      >
        <div className="scrim" aria-hidden="true" />
        <div className="container">
          <span className="eyebrow">{lang === 'ja' ? '毎日自動更新の価格比較' : 'Prices updated daily'}</span>
          <h1>{t(lang, 'hero_title')}</h1>
          {/* 説明文は外した。検索しに来た人に読ませるものではなく、
              見出しと検索欄の間に挟まって、本題までの距離を伸ばしていた */}
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

      {/* 時計を買いに来た人が最初に見たいのは時計そのもの。
          説明文より先に、大きな1枚を置く。
          この区画は楽天の写真と価格を出すので、リンクは出品ページのみ（規約8条4項） */}
      <FeaturedWatch lang={lang} date={new Date().toISOString().slice(0, 10)} />

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
                // 記事カードは記事ページへのリンク。楽天ウェブサービス規約 第8条4項により
                // 「ウェブサービスを使用した部分」から楽天以外へリンクできないため、
                // 商品写真ではなく自前（およびCC/PD）の写真を顔にする
                const hero = postCardImage(p.heroModel);
                return (
                  <Link key={p.slug} href={`/${lang}/blog/${p.slug}/`} className="card post-card">
                    <div className="pc-media">
                      {hero ? (
                        <img src={hero.src} alt="" loading="lazy" />
                      ) : (
                        // 記事ごとに違う文字を出す。固定文言だと同じ黒板が横に並んでしまう
                        <div className="pc-noimg">{lang === 'ja' ? p.title_ja : p.title_en}</div>
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
              <BrandCard key={b.brand.id} lang={lang} cat={b} />
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
