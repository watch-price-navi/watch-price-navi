import type { Metadata } from 'next';
import { SITE, absUrl } from '@/lib/config';
import type { Lang } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? '免責事項' : 'Disclaimer',
    alternates: {
      canonical: absUrl(`/${lang}/disclaimer/`),
      languages: { ja: absUrl('/ja/disclaimer/'), en: absUrl('/en/disclaimer/'), 'x-default': absUrl('/en/disclaimer/') },
    },
  };
}

export default async function DisclaimerPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  if (lang === 'en') {
    return (
      <div className="container prose">
        <h1>Disclaimer</h1>
        <h2>About prices</h2>
        <p>
          All prices on this site are collected automatically from the official APIs of Rakuten Ichiba and Yahoo!
          Shopping Japan, and reflect the moment of the last update. Actual prices, stock, shipping costs and points
          may differ — always confirm on the store&apos;s page before purchasing.
        </p>
        <h2>About purchases</h2>
        <p>
          This site sells nothing. All purchase contracts are concluded between you and the respective store. We take
          no responsibility for transactions, product authenticity, defects or disputes with stores.
        </p>
        <h2>About affiliate links</h2>
        <p>
          Product links on this site are affiliate (advertising) links. We may receive a commission when you purchase
          through them, at no additional cost to you.
        </p>
        <h2>About accuracy</h2>
        <p>
          Specifications (references, case sizes, movements) are compiled with care but may contain errors. Please
          verify with the manufacturer&apos;s official information before purchasing.
        </p>
      </div>
    );
  }
  return (
    <div className="container prose">
      <h1>免責事項</h1>
      <h2>価格情報について</h2>
      <p>
        当サイト「{SITE.nameJa}」に掲載されている価格は、楽天市場・Yahoo!ショッピングの公式APIから自動取得した取得時点のものです。
        実際の販売価格・在庫・送料・ポイント等は変動するため、購入前に必ず各販売店のページでご確認ください。
      </p>
      <h2>購入について</h2>
      <p>
        当サイトは商品の販売を行っていません。売買契約はすべて利用者と各販売店との間で成立します。取引・商品の真贋・
        不具合・販売店とのトラブル等について、当サイトは一切の責任を負いません。
      </p>
      <h2>アフィリエイトリンクについて</h2>
      <p>
        当サイトの商品リンクにはアフィリエイト（広告）リンクが含まれます。リンク経由で商品が購入された場合、
        当サイトが販売店から紹介料を受け取ることがあります。購入者に追加の負担はありません。
      </p>
      <h2>掲載情報の正確性について</h2>
      <p>
        型番・ケース径・ムーブメント等の仕様情報は正確を期して編集していますが、誤りを含む可能性があります。
        購入の際はメーカー公式の情報をご確認ください。掲載内容によって生じたいかなる損害についても、当サイトは責任を負いかねます。
      </p>
    </div>
  );
}
