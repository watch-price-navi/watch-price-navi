import Link from 'next/link';
import { getSummary, type BrandCatalog } from '@/lib/data';
import { imageUrl } from '@/lib/image';
import { t, type Lang } from '@/lib/i18n';

/**
 * ブランド一覧のカード。
 *
 * 文字だけの一覧は、どのブランドがどんな時計を作っているのか分からない。
 * そのブランドを代表する1本の写真を載せる。
 *
 * 規約上の制約:
 * 写真は楽天・Yahoo!の出品から取ったものなので、
 * 楽天ウェブサービス規約 第8条4項により、そこから楽天以外へリンクできない。
 * カード全体を1つのリンクにはできず、
 *   写真 → 出品ページ
 *   ブランド名・国・モデル数 → 自サイトのブランドページ
 * と分ける。モデルカードと同じ作りなので、操作の仕方は揃う。
 *
 * 代表の選び方:
 * 人気モデルのうち最も高価な1本。そのブランドの「顔」になる時計は
 * たいてい高額なので、価格順で選べば概ね妥当なものが出る。
 */
export default function BrandCard({ lang, cat }: { lang: Lang; cat: BrandCatalog }) {
  const summary = getSummary();
  const brandHref = `/${lang}/brands/${cat.brand.id}/`;

  let best: { image: string; url: string | null; name: string } | null = null;
  let bestPrice = -1;
  for (const m of cat.models) {
    const s = summary[`${cat.brand.id}/${m.id}`];
    if (!s?.image || !s.lowestPrice) continue;
    // 人気印のあるモデルを優先し、その中で最も高価なものを代表にする
    const score = (m.popular ? 1_000_000_000 : 0) + s.lowestPrice;
    if (score > bestPrice) {
      bestPrice = score;
      best = { image: s.image, url: s.url ?? null, name: lang === 'ja' ? m.name_ja : m.name_en };
    }
  }
  const img = best ? imageUrl(best.image, 'card') : null;

  return (
    <div className="card brand-card">
      {img ? (
        best?.url ? (
          // 写真は楽天由来。出品ページ以外へは向けられない
          <a className="bc-media" href={best.url} target="_blank" rel="sponsored nofollow noopener">
            <img src={img} alt={best.name} loading="lazy" />
          </a>
        ) : (
          <div className="bc-media">
            <img src={img} alt={best?.name ?? ''} loading="lazy" />
          </div>
        )
      ) : (
        <div className="bc-media bc-media-empty">{cat.brand.name_en}</div>
      )}

      <Link href={brandHref} className="bc-link" prefetch={false}>
        <span className="bc-name">{cat.brand.name_en}</span>
        <span className="bc-ja">{lang === 'ja' ? cat.brand.name_ja : cat.brand.country}</span>
        <span className="bc-meta">
          {cat.brand.country}
          {cat.brand.founded ? ` ・ ${t(lang, 'founded')} ${cat.brand.founded}` : ''} ・ {cat.models.length}{' '}
          {t(lang, 'models_count')}
        </span>
      </Link>
    </div>
  );
}
