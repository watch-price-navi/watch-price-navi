import { getStyling, looksForModel } from '@/lib/styling';
import type { WatchModel } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';

/**
 * 「この時計に、何を着るか」。
 *
 * SAFARI の誌面構造をそのまま借りる。通番を振った見出し、縦長の装い写真、
 * 着用アイテムの列挙、そして最後にその時計がなぜ合うかの一言。
 * 番号を振るのは装飾ではなく、読者が「01を見て、02を見る」と順に辿れるようにするため。
 *
 * 写真は作成画像であり、実在の人物でも掲載の時計そのものでもない。
 * 誤解を生まないよう、末尾に必ずその旨を出す。
 */
export default function StylingSection({
  lang,
  model,
  watchName,
}: {
  lang: Lang;
  model: WatchModel;
  watchName: string;
}) {
  const looks = looksForModel(model);
  if (looks.length === 0) return null;
  const data = getStyling();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  return (
    <section className="section styling" id="styling">
      <h2 className="section-title">{t(lang, 'styling_title')}</h2>
      <p className="styling-lead">{t(lang, 'styling_lead').replace('{watch}', watchName)}</p>

      {looks.map((look, i) => (
        <article className="look" key={look.id}>
          <div className="look-no">{String(i + 1).padStart(2, '0')}</div>
          <h3 className="look-name">{lang === 'ja' ? look.name_ja : look.name_en}</h3>
          <img
            className="look-photo"
            src={`${basePath}${look.image}`}
            alt={lang === 'ja' ? look.name_ja : look.name_en}
            loading="lazy"
          />
          <p className="look-lead">{lang === 'ja' ? look.lead_ja : look.lead_en}</p>
          <div className="look-items">
            <b>{t(lang, 'styling_items')}</b>
            <ul>
              {(lang === 'ja' ? look.items_ja : look.items_en).map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
          <p className="look-fits">
            <b>{t(lang, 'styling_fits')}</b>
            {lang === 'ja' ? look.fits_ja : look.fits_en}
          </p>
        </article>
      ))}

      <p className="small-note">{lang === 'ja' ? data.disclaimer_ja : data.disclaimer_en}</p>
    </section>
  );
}
