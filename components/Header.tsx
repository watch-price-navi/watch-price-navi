import Link from 'next/link';
import { SITE } from '@/lib/config';
import { t, type Lang } from '@/lib/i18n';
import LangSwitch from './LangSwitch';

export default function Header({ lang }: { lang: Lang }) {
  const siteName = lang === 'ja' ? SITE.nameJa : SITE.nameEn;
  return (
    <>
      {/* PR表示はフッターに置く。
          景表法・ステマ規制が求めるのは「広告であることが分かること」であり、
          位置は最上部でなくてよい。最初に目に入るのが注意書きだと、
          時計を見に来た人の視線を最初から奪ってしまう。 */}
      <header className="site-header">
        <div className="container">
          <Link href={`/${lang}/`} className="logo">
            {siteName}
            <span className="logo-sub">Watch Price Navi</span>
          </Link>
          <nav className="header-nav">
            <Link href={`/${lang}/search/`}>{t(lang, 'nav_search')}</Link>
            <Link href={`/${lang}/brands/`}>{t(lang, 'nav_brands')}</Link>
            <Link href={`/${lang}/blog/`}>{t(lang, 'nav_blog')}</Link>
            <LangSwitch lang={lang} />
          </nav>
        </div>
      </header>
    </>
  );
}
