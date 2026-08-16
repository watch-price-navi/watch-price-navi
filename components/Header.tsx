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
            {/* 画面が狭いときは短い呼び方に差し替える。
                日本語の項目名をそのまま並べるとiPhoneの幅に収まらず、
                項目どうしの間隔が0まで潰れて読みづらくなる。 */}
            <Link href={`/${lang}/search/`}>
              <span className="nav-long">{t(lang, 'nav_search')}</span>
              <span className="nav-short">{t(lang, 'nav_search_short')}</span>
            </Link>
            <Link href={`/${lang}/brands/`}>
              <span className="nav-long">{t(lang, 'nav_brands')}</span>
              <span className="nav-short">{t(lang, 'nav_brands_short')}</span>
            </Link>
            <Link href={`/${lang}/blog/`}>
              <span className="nav-long">{t(lang, 'nav_blog')}</span>
              <span className="nav-short">{t(lang, 'nav_blog_short')}</span>
            </Link>
            {/* 買取査定は1件で数千〜1万円。楽天の「1商品1,000円上限」に対して10倍近く、
                しかも購入という重い決断が要らずフォーム入力だけで成立する。
                型番で検索して来る人には「買いたい人」と同じくらい「持っている人」がいるので、
                全ページから入れる場所に置く。 */}
            <Link className="nav-sell" href={`/${lang}/sell/`}>
              {t(lang, 'nav_sell')}
            </Link>
            <LangSwitch lang={lang} />
          </nav>
        </div>
      </header>
    </>
  );
}
