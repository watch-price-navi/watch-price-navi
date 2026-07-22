import Link from 'next/link';
import { SITE } from '@/lib/config';
import { t, type Lang } from '@/lib/i18n';

export default function Footer({ lang }: { lang: Lang }) {
  const siteName = lang === 'ja' ? SITE.nameJa : SITE.nameEn;
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-brand">{siteName}</div>
        <p>{t(lang, 'footer_note')}</p>
        <nav>
          <Link href={`/${lang}/search/`}>{t(lang, 'nav_search')}</Link>
          <Link href={`/${lang}/brands/`}>{t(lang, 'nav_brands')}</Link>
          <Link href={`/${lang}/blog/`}>{t(lang, 'nav_blog')}</Link>
          <Link href={`/${lang}/about/`}>{t(lang, 'footer_about')}</Link>
          <Link href={`/${lang}/privacy/`}>{t(lang, 'footer_privacy')}</Link>
          <Link href={`/${lang}/disclaimer/`}>{t(lang, 'footer_disclaimer')}</Link>
        </nav>
        <div className="credits">
          <div>{t(lang, 'pr_badge')}</div>
          <div>
            <a href="https://webservice.rakuten.co.jp/" target="_blank" rel="noopener noreferrer">
              Supported by Rakuten Developers
            </a>
          </div>
          <div>
            <a href="https://developer.yahoo.co.jp/sitemap/" target="_blank" rel="noopener noreferrer">
              Web Services by Yahoo! JAPAN
            </a>
          </div>
          <div>© {year} {siteName}</div>
        </div>
      </div>
    </footer>
  );
}
