import Link from 'next/link';
import { SITE } from '@/lib/config';
import { t, type Lang } from '@/lib/i18n';
import LangSwitch from './LangSwitch';

export default function Header({ lang }: { lang: Lang }) {
  const siteName = lang === 'ja' ? SITE.nameJa : SITE.nameEn;
  return (
    <>
      <div className="pr-bar">{t(lang, 'pr_badge')}</div>
      <header className="site-header">
        <div className="container">
          <Link href={`/${lang}/`} className="logo">
            {siteName}
            <span className="logo-sub">Watch Price Navi</span>
          </Link>
          <nav className="header-nav">
            <Link href={`/${lang}/brands/`}>{t(lang, 'nav_brands')}</Link>
            <Link href={`/${lang}/about/`}>{t(lang, 'nav_about')}</Link>
            <LangSwitch lang={lang} />
          </nav>
        </div>
      </header>
    </>
  );
}
