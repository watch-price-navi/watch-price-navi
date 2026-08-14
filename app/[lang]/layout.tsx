import type { Metadata } from 'next';
import Script from 'next/script';
import Footer from '@/components/Footer';
import Header from '@/components/Header';
import { SITE, absUrl } from '@/lib/config';
import { LANGS, type Lang } from '@/lib/i18n';
import '../globals.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  const siteName = lang === 'ja' ? SITE.nameJa : SITE.nameEn;
  const description =
    lang === 'ja'
      ? '世界の腕時計ブランドの最安値を毎日自動収集。ロレックス、オメガ、グランドセイコーなど人気モデルの価格を楽天市場・Yahoo!ショッピングから横断比較できます。'
      : 'Daily-updated price comparison for the world\'s watch brands. Compare Rolex, Omega, Grand Seiko and more across Rakuten and Yahoo! Shopping Japan.';
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: lang === 'ja' ? `${siteName} | 世界の腕時計 最安値・価格比較` : `${siteName} | Watch Price Comparison Japan`,
      template: `%s | ${siteName}`,
    },
    description,
    alternates: {
      canonical: absUrl(`/${lang}/`),
      languages: {
        ja: absUrl('/ja/'),
        en: absUrl('/en/'),
        'x-default': absUrl('/en/'),
      },
    },
    openGraph: {
      siteName,
      locale: lang === 'ja' ? 'ja_JP' : 'en_US',
      type: 'website',
    },
    // Google Search Console の所有権確認。確認後も消さないこと
    // （タグを外すと所有権が失われ、検索パフォーマンスのデータが見られなくなる）
    verification: { google: 'KvGbogTeR8tpBVeEMV8ZnFNqdHkHb8VwNVEr6xPXRRM' },
  };
}

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const lang = (await params).lang as Lang;
  return (
    <html lang={lang}>
      <body>
        <Header lang={lang} />
        <main>{children}</main>
        <Footer lang={lang} />
        {SITE.vcPid && (
          <>
            <Script id="vc-linkswitch-pid" strategy="afterInteractive">{`var vc_pid = "${SITE.vcPid}";`}</Script>
            <Script src="https://aml.valuecommerce.com/vcdal.js" strategy="afterInteractive" />
          </>
        )}
        {SITE.adsenseClient && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${SITE.adsenseClient}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
