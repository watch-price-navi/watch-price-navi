import type { Metadata } from 'next';
import Link from 'next/link';
import { absUrl } from '@/lib/config';
import { getBlogPosts } from '@/lib/blog';
import { postCardImage } from '@/lib/blog-figures';
import { formatDate } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? '時計ブログ｜毎朝更新の腕時計コラム' : 'Watch Journal — A New Story Every Morning',
    description:
      lang === 'ja'
        ? '腕時計の歴史・機構・ブランド解説・シーン別の選び方を毎朝1本お届け。読んだその日に最安値もチェックできます。'
        : 'Daily articles on watch history, movements, brands and how to wear them — with live lowest prices for every watch we mention.',
    alternates: {
      canonical: absUrl(`/${lang}/blog/`),
      languages: { ja: absUrl('/ja/blog/'), en: absUrl('/en/blog/'), 'x-default': absUrl('/en/blog/') },
    },
  };
}

export default async function BlogIndex({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const posts = getBlogPosts();

  return (
    <div className="container">
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> › {t(lang, 'blog_title')}
      </nav>
      <div className="page-head">
        <h1>{t(lang, 'blog_title')}</h1>
        <p className="page-sub">{t(lang, 'blog_lead')}</p>
      </div>

      <section className="section" style={{ paddingTop: 24 }}>
        {posts.length === 0 ? (
          <div className="notice notice-empty">
            <b>{lang === 'ja' ? '記事を準備中です' : 'Articles coming soon'}</b>
            {lang === 'ja' ? '毎朝の自動更新で記事が追加されます。' : 'New articles are published automatically every morning.'}
          </div>
        ) : (
          <div className="grid grid-posts">
            {posts.map((p) => {
              // 記事の顔は、その記事が扱う時計そのものにする。
              // 発祥地の写真だと、同じブランドの記事が全部同じ絵になってしまう。
              //
              // 出品の写真を使う場合、楽天ウェブサービス規約 第8条4項により
              // その写真からは出品ページ以外へリンクできない。
              // そこで写真は出品へ、文字は記事へ、と行き先を分ける。
              const hero = postCardImage(p.heroModel);
              const media = hero ? (
                <img src={hero.src} alt="" loading="lazy" />
              ) : (
                <div className="pc-noimg">{lang === 'ja' ? p.title_ja : p.title_en}</div>
              );
              const body = (
                <div className="pc-body">
                  <time className="post-date">{formatDate(p.date, lang)}</time>
                  <h2 className="post-title">{lang === 'ja' ? p.title_ja : p.title_en}</h2>
                  <p className="post-desc">{lang === 'ja' ? p.description_ja : p.description_en}</p>
                  <span className="post-more">{t(lang, 'blog_read')} →</span>
                </div>
              );
              if (hero?.offerUrl) {
                return (
                  <div key={p.slug} className="card post-card">
                    <a className="pc-media" href={hero.offerUrl} target="_blank" rel="sponsored nofollow noopener">
                      {media}
                    </a>
                    <Link href={`/${lang}/blog/${p.slug}/`} className="pc-link">
                      {body}
                    </Link>
                  </div>
                );
              }
              return (
                <Link key={p.slug} href={`/${lang}/blog/${p.slug}/`} className="card post-card">
                  <div className="pc-media">{media}</div>
                  {body}
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
