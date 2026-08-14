import { getKaitori } from '@/lib/data';
import { t, type Lang } from '@/lib/i18n';

/**
 * 買取査定への導線。
 *
 * 国内に出品が無いモデル（A.ランゲ&ゾーネ、パテック フィリップ、独立時計師など）の
 * ページを見る人には、「買いたい人」と同じかそれ以上に「持っていて相場を知りたい人・
 * 売りたい人」がいる。在庫が無いことは買取導線にとって欠点ではない。
 * 楽天の成果報酬が1商品1,000円上限であるのに対し、買取リードは1件7,500〜10,000円で、
 * 高額時計ほど買取のほうが収益効率が高い。
 *
 * 提携が未了のサービスは url が空。空リンクは出さない。
 */
export default function KaitoriPanel({ lang, modelName }: { lang: Lang; modelName: string }) {
  const data = getKaitori();
  const services = data.services.filter((s) => s.url);

  // 提携前は導線そのものを出さない（押しても何も起きないリンクは信頼を損なう）
  if (services.length === 0) return null;

  return (
    <section className="section" id="kaitori" style={{ paddingTop: 8, scrollMarginTop: 80 }}>
      <h2 className="section-title">{t(lang, 'kaitori_title')}</h2>
      <p className="small-note">{lang === 'ja' ? data.disclosure_ja : data.disclosure_en}</p>
      <p className="kaitori-lead">{t(lang, 'kaitori_lead').replace('{model}', modelName)}</p>
      <div className="grid dealer-grid">
        {services.map((s) => (
          <a
            key={s.id}
            className="card dealer-card"
            href={s.url}
            target="_blank"
            rel="sponsored nofollow noopener"
          >
            <span className="dealer-ad">{t(lang, 'ad_label')}</span>
            <b>{lang === 'ja' ? s.name_ja : s.name_en}</b>
            <span className="dealer-note">{lang === 'ja' ? s.note_ja : s.note_en}</span>
            <span className="dealer-go">{t(lang, 'kaitori_cta')} →</span>
          </a>
        ))}
      </div>
    </section>
  );
}
