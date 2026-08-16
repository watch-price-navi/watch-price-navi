import type { Metadata } from 'next';
import Link from 'next/link';
import KaitoriPanel from '@/components/KaitoriPanel';
import { absUrl } from '@/lib/config';
import { getAllBrands, getSummary } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { LANGS, t, type Lang } from '@/lib/i18n';

export const dynamicParams = false;
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = (await params).lang as Lang;
  return {
    title: lang === 'ja' ? '時計を売る｜無料査定で今の相場を調べる' : 'Sell your watch — free appraisal',
    description:
      lang === 'ja'
        ? 'お持ちの腕時計が今いくらになるかを無料で調べられます。ロレックス・オメガ・グランドセイコーなど、型番ごとの中古相場と、複数の買取業者への一括査定をご案内します。'
        : 'Find out what your watch is worth today. Free, no-obligation appraisals from multiple Japanese buyers.',
    alternates: {
      canonical: absUrl(`/${lang}/sell/`),
      languages: { ja: absUrl('/ja/sell/'), en: absUrl('/en/sell/'), 'x-default': absUrl('/en/sell/') },
    },
  };
}

/**
 * 「時計を売る」の入口。
 *
 * なぜ独立したページを設けるか:
 * 型番で検索して来る人には「買いたい人」と「持っていて相場を知りたい人」が
 * ほぼ同数いる。これまで後者の受け皿はモデルページの中ほどにしかなく、
 * サイト全体としての入口が無かった。
 * 「時計 買取 相場」で検索する層の着地点にもなる。
 */
export default async function SellPage({ params }: { params: Promise<{ lang: string }> }) {
  const lang = (await params).lang as Lang;
  const summary = getSummary();
  const brands = getAllBrands();

  // 相場の実例を出す。抽象的な誘いより、具体的な金額のほうが手が動く
  const examples = brands
    .flatMap((b) =>
      b.models
        .filter((m) => m.popular)
        .map((m) => ({
          brand: lang === 'ja' ? b.brand.name_ja : b.brand.name_en,
          name: lang === 'ja' ? m.name_ja : m.name_en,
          href: `/${lang}/watch/${b.brand.id}/${m.id}/`,
          used: summary[`${b.brand.id}/${m.id}`]?.lowestUsed ?? null,
        })),
    )
    .filter((x) => x.used && x.used >= 200000)
    .sort((a, b) => (b.used ?? 0) - (a.used ?? 0))
    .slice(0, 8);

  return (
    <div className="container">
      <nav className="breadcrumb">
        <Link href={`/${lang}/`}>{t(lang, 'breadcrumb_home')}</Link> › {t(lang, 'nav_sell')}
      </nav>

      <div className="page-head">
        <h1>{t(lang, 'sell_title')}</h1>
        <p className="page-sub">{t(lang, 'sell_lead')}</p>
      </div>

      <section className="section" style={{ paddingTop: 8 }}>
        <div className="sell-points">
          <div className="sp-item">
            <b>{t(lang, 'sell_p1_t')}</b>
            <p>{t(lang, 'sell_p1_b')}</p>
          </div>
          <div className="sp-item">
            <b>{t(lang, 'sell_p2_t')}</b>
            <p>{t(lang, 'sell_p2_b')}</p>
          </div>
          <div className="sp-item">
            <b>{t(lang, 'sell_p3_t')}</b>
            <p>{t(lang, 'sell_p3_b')}</p>
          </div>
        </div>
      </section>

      <KaitoriPanel lang={lang} modelName={lang === 'ja' ? 'お持ちの時計' : 'your watch'} />

      {examples.length > 0 && (
        <section className="section">
          <h2 className="section-title">{t(lang, 'sell_examples')}</h2>
          <p className="small-note" style={{ marginBottom: 14 }}>
            {t(lang, 'sell_examples_note')}
          </p>
          <div className="sell-table-wrap">
            <table className="sell-table">
              <tbody>
                {examples.map((e) => (
                  <tr key={e.href}>
                    <td>
                      <Link href={e.href} prefetch={false}>
                        <span className="st-brand">{e.brand}</span>
                        <span className="st-name">{e.name}</span>
                      </Link>
                    </td>
                    <td className="st-price">{formatJpy(e.used ?? 0, lang)}〜</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
