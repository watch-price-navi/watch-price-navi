import { getAllBrands, getSummary, type SummaryEntry } from '@/lib/data';
import { formatJpy } from '@/lib/format';
import { imageUrl } from '@/lib/image';
import { t, type Lang } from '@/lib/i18n';

/**
 * トップに置く「今日の一本」。
 *
 * 時計を買いに来た人が最初に見たいのは説明文ではなく時計そのもので、
 * 宝石広場もGMTも、開いた瞬間に大きな時計の写真が目に入る。
 * その役割をこの区画が担う。
 *
 * 規約上の制約:
 * ここには楽天・Yahoo!から取得した写真と価格を出す。
 * 楽天ウェブサービス規約 第8条4項により「ウェブサービスを使用した部分」からは
 * 楽天以外へリンクできないので、この区画のリンクはすべて出品ページに向ける。
 * 自サイトのモデルページへの導線をここに混ぜてはいけない。
 *
 * 選び方:
 * 日付で回して毎日変える。同じ時計が続くとトップが死んで見える。
 */
export default function FeaturedWatch({ lang, date }: { lang: Lang; date: string }) {
  const summary = getSummary();
  const brands = getAllBrands();

  // 写真・出品URL・価格がすべて揃っているものだけが対象。
  // 高額な一本ほど「見に来た甲斐がある」画になるので、下限を設けて選ぶ。
  const pool: { key: string; brandJa: string; brandEn: string; nameJa: string; nameEn: string; ref: string | null; s: SummaryEntry }[] = [];
  for (const cat of brands) {
    for (const m of cat.models) {
      const key = `${cat.brand.id}/${m.id}`;
      const s = summary[key];
      if (!s?.image || !s.url || !s.lowestPrice) continue;
      if (s.lowestPrice < 200000) continue;
      pool.push({
        key,
        brandJa: cat.brand.name_ja,
        brandEn: cat.brand.name_en,
        nameJa: m.name_ja,
        nameEn: m.name_en,
        ref: m.reference ?? null,
        s,
      });
    }
  }
  if (pool.length === 0) return null;

  pool.sort((a, b) => a.key.localeCompare(b.key));
  const pick = pool[Number(String(date).replace(/-/g, '')) % pool.length];
  const img = imageUrl(pick.s.image ?? null, 'hero');
  if (!img) return null;

  return (
    <section className="featured">
      <div className="container">
        <a className="fw-inner" href={pick.s.url ?? '#'} target="_blank" rel="sponsored nofollow noopener">
          <div className="fw-media">
            <img src={img} alt={`${pick.brandJa} ${pick.nameJa}`} />
          </div>
          <div className="fw-body">
            <span className="fw-eyebrow">{t(lang, 'featured_label')}</span>
            <span className="fw-brand">{lang === 'ja' ? pick.brandJa : pick.brandEn}</span>
            <h2 className="fw-name">{lang === 'ja' ? pick.nameJa : pick.nameEn}</h2>
            {pick.ref && <span className="fw-ref">Ref. {pick.ref}</span>}
            <span className="fw-price">{formatJpy(pick.s.lowestPrice, lang)}</span>
            <span className="fw-note">
              {t(lang, 'lowest_price')} ・ {pick.s.shop}
            </span>
            <span className="fw-go">{t(lang, `source_${pick.s.source}`)} →</span>
          </div>
        </a>
      </div>
    </section>
  );
}
