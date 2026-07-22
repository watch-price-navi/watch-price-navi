import type { Metadata } from 'next';
import { SITE, absUrl } from '@/lib/config';
import type { Lang } from '@/lib/i18n';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? 'プライバシーポリシー' : 'Privacy Policy',
    alternates: {
      canonical: absUrl(`/${lang}/privacy/`),
      languages: { ja: absUrl('/ja/privacy/'), en: absUrl('/en/privacy/'), 'x-default': absUrl('/ja/privacy/') },
    },
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  if (lang === 'en') {
    return (
      <div className="container prose">
        <h1>Privacy Policy</h1>
        <p>
          {SITE.nameEn} (&quot;this site&quot;) respects your privacy. This page explains what data is handled when
          you use this site.
        </p>
        <h2>Advertising</h2>
        <p>
          This site uses affiliate programs (Rakuten Affiliate, ValueCommerce) and may use Google AdSense. These
          services may use cookies to measure ad performance and to serve personalized ads. You can opt out of
          personalized advertising in <a href="https://adssettings.google.com/" rel="noopener noreferrer" target="_blank">Google Ads Settings</a>.
        </p>
        <h2>Access analytics</h2>
        <p>
          This site may use access analytics tools that collect anonymized traffic data (pages viewed, browser type).
          This data contains no personally identifying information.
        </p>
        <h2>Personal information</h2>
        <p>
          This site has no member registration and collects no personal information, except an email address when you
          contact us voluntarily, which is used only to reply.
        </p>
        <h2>Changes</h2>
        <p>This policy may be updated without notice. The latest version is always published on this page.</p>
      </div>
    );
  }
  return (
    <div className="container prose">
      <h1>プライバシーポリシー</h1>
      <p>
        「{SITE.nameJa}」（以下「当サイト」）は、利用者のプライバシーを尊重し、以下の方針で情報を取り扱います。
      </p>
      <h2>広告配信について</h2>
      <p>
        当サイトは、アフィリエイトプログラム（楽天アフィリエイト、バリューコマース等）を利用しています。また、第三者配信の広告サービス
        （Google AdSense）を利用する場合があります。これらの事業者は、利用者の興味に応じた広告を表示するためCookieを使用することがあります。
        パーソナライズド広告は
        <a href="https://adssettings.google.com/" rel="noopener noreferrer" target="_blank">Googleの広告設定</a>
        で無効にできます。
      </p>
      <h2>アクセス解析について</h2>
      <p>
        当サイトでは、トラフィックデータ収集のためアクセス解析ツールを利用する場合があります。収集されるデータは匿名であり、
        個人を特定するものではありません。
      </p>
      <h2>個人情報の取り扱い</h2>
      <p>
        当サイトに会員登録機能はなく、個人情報を収集しません。お問い合わせの際にご提供いただいたメールアドレスは、
        返信の目的以外には使用しません。
      </p>
      <h2>免責</h2>
      <p>
        当サイトに掲載する価格・商品情報の正確性には万全を期していますが、その内容を保証するものではありません。
        詳細は<a href={`/${lang}/disclaimer/`}>免責事項</a>をご覧ください。
      </p>
      <h2>改定</h2>
      <p>本ポリシーは予告なく改定されることがあります。最新の内容は常に本ページに掲載されます。</p>
    </div>
  );
}
