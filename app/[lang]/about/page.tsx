import type { Metadata } from 'next';
import { SITE, absUrl } from '@/lib/config';
import type { Lang } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? 'このサイトについて' : 'About',
    alternates: {
      canonical: absUrl(`/${lang}/about/`),
      languages: { ja: absUrl('/ja/about/'), en: absUrl('/en/about/'), 'x-default': absUrl('/ja/about/') },
    },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  if (lang === 'en') {
    return (
      <div className="container prose">
        <h1>About {SITE.nameEn}</h1>
        <p>
          {SITE.nameEn} is a price-comparison service for watches sold in Japan. We automatically collect listing
          prices for popular models of the world&apos;s watch brands — from luxury Swiss houses to Japanese
          manufacturers — via the official APIs of Rakuten Ichiba and Yahoo! Shopping Japan, and show them sorted from
          the lowest price.
        </p>
        <h2>Advertising disclosure</h2>
        <p>
          This site participates in affiliate programs (Rakuten Affiliate, ValueCommerce and others). When you
          purchase through links on this site, we may earn a commission at no extra cost to you. Dealer links marked
          as such are provided for reference only and earn us nothing.
        </p>
        <h2>Data sources</h2>
        <ul>
          <li>Rakuten Ichiba — official Rakuten Web Service API</li>
          <li>Yahoo! Shopping Japan — official Yahoo! Developer Network API</li>
        </ul>
        <p>Prices are updated automatically once a day. This site does not sell any products.</p>
        {SITE.contactEmail && (
          <>
            <h2>Contact</h2>
            <p>
              <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
            </p>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="container prose">
      <h1>このサイトについて</h1>
      <p>
        「{SITE.nameJa}」は、世界の腕時計ブランドの価格を横断比較できるサービスです。高級スイスブランドから国産メーカーまで、
        人気モデルの出品価格を楽天市場・Yahoo!ショッピングの公式APIから毎日自動収集し、最安値順に表示しています。
      </p>
      <h2>広告掲載について（アフィリエイト表記）</h2>
      <p>
        <strong>本サイトは、楽天アフィリエイト・バリューコマース等のアフィリエイトプログラムを利用しています。</strong>
        サイト内の商品リンクを経由して購入された場合、当サイトは販売店から紹介料を受け取ることがあります（購入者の負担はありません）。
        「取扱店リンク」として掲載している販売店・公式サイトへのリンクは提携関係がなく、報酬は発生しません。
      </p>
      <h2>データの出所</h2>
      <ul>
        <li>楽天市場 — 楽天ウェブサービス（公式API）</li>
        <li>Yahoo!ショッピング — Yahoo!デベロッパーネットワーク（公式API）</li>
      </ul>
      <p>価格は1日1回自動更新しています。当サイトは商品の販売を行っていません。売買契約は各販売店との間で成立します。</p>
      {SITE.contactEmail && (
        <>
          <h2>お問い合わせ</h2>
          <p>
            <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>
          </p>
        </>
      )}
    </div>
  );
}
