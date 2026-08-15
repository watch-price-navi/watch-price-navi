import {
  getSummary,
  getPriceData,
  getAllBrands,
  hasOwnPage,
  getHeritage,
  getHeritageImages,
  type HeritageImage,
} from '@/lib/data';
import { imageUrl } from '@/lib/image';
import { formatJpy } from '@/lib/format';
import { t, type Lang } from '@/lib/i18n';

/**
 * 記事本文に商品写真を差し込む。
 *
 * 記事の本文には既に `[モデル名](/ja/watch/<brand>/<model>/)` 形式の内部リンクが
 * 5〜8個埋まっている。これを「写真をここに置け」という位置指定として再利用するので、
 * 記事JSONを1バイトも書き換えずに既存記事すべてが写真つきになる。
 *
 * 楽天ウェブサービス規約により、楽天から取得した画像は楽天のページ以外へ
 * リンクさせてはいけない。したがって figure の中のリンク先は必ず出品ページにする
 * （自サイトのモデルページへの内部リンクは figure の外＝本文中のリンクが担う）。
 */
const LINK_RE = /<a href="\/(ja|en)\/watch\/([a-z0-9-]+)\/([a-z0-9.\-]+)\/">([^<]*)<\/a>/g;

/** 画像は public/ 配下。CSS ではなく HTML に直接書き出すので basePath を自分で付ける */
const basePath = () => process.env.NEXT_PUBLIC_BASE_PATH || '';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/**
 * 実写（創業者の肖像・発祥地の風景）を本文に差し込む。
 *
 * 記事が創業者の名前や発祥の地に触れているのに文字だけ、という状態をなくす。
 * 本文からその語を探し、含まれる段落の直後に写真を置く。
 * 記事JSONは書き換えないので、既存記事も今後の記事も同じ扱いになる。
 *
 * CC BY / CC BY-SA の写真は表示義務があるため、作者・ライセンス・出典を
 * キャプションに必ず出す。出せないものはそもそも取得していない。
 */
function creditLine(img: HeritageImage): string {
  const parts: string[] = [];
  if (img.author) parts.push(esc(img.author.replace(/Unknown author/gi, 'Unknown').slice(0, 60)));
  if (img.license) {
    parts.push(
      img.licenseUrl
        ? `<a href="${esc(img.licenseUrl)}" target="_blank" rel="nofollow noopener">${esc(img.license)}</a>`
        : esc(img.license),
    );
  }
  if (img.source) parts.push(`<a href="${esc(img.source)}" target="_blank" rel="nofollow noopener">Wikimedia Commons</a>`);
  return parts.join(' / ');
}

export function insertHeritageFigures(html: string, lang: Lang, brandIds: string[]): string {
  const heritage = getHeritage();
  const images = getHeritageImages();
  const brands = getAllBrands();
  const used = new Set<string>();

  for (const brandId of brandIds) {
    const h = heritage[brandId];
    if (!h) continue;
    const brand = brands.find((b) => b.brand.id === brandId);
    const brandName = brand ? (lang === 'ja' ? brand.brand.name_ja : brand.brand.name_en) : brandId;

    for (const kind of ['founder', 'town'] as const) {
      const key = `${brandId}-${kind}`;
      if (used.has(key)) continue;
      const img = images[key];
      const needle = kind === 'founder' ? h.founderJa : h.townJa;
      if (!img || !needle) continue;

      // 本文がその語に触れている段落を探す。触れていない記事には差し込まない
      const at = html.indexOf(needle);
      if (at === -1) continue;
      const end = html.indexOf('</p>', at);
      if (end === -1) continue;

      const caption =
        kind === 'founder'
          ? lang === 'ja'
            ? `${esc(h.founderJa ?? '')}｜${esc(brandName)}の創業者`
            : `${esc(img.subject)} — founder of ${esc(brandName)}`
          : lang === 'ja'
            ? `${esc(h.townJa ?? '')}｜${esc(brandName)}が生まれた土地`
            : `${esc(img.subject)} — where ${esc(brandName)} was born`;

      const figure =
        `<figure class="heritage-figure heritage-${kind}">` +
        `<img src="${esc(basePath())}${esc(img.src)}" alt="${caption.replace(/<[^>]*>/g, '')}" loading="lazy">` +
        `<figcaption><b>${caption}</b><span class="hf-credit">${creditLine(img)}</span></figcaption>` +
        `</figure>`;

      html = html.slice(0, end + 4) + figure + html.slice(end + 4);
      used.add(key);
    }
  }
  return html;
}

/**
 * 記事本文の行き止まりリンクを直す。
 *
 * 記事は生成時にモデルへの内部リンクを埋めるが、そのモデルのページが
 * 生成されるとは限らない（出品数が閾値に届かない自動収録モデルなど）。
 * 実際に本番で24本が404になっていた。
 *
 * 記事JSONは書き換えず、描画のたびにページの有無を見て、
 * 無いものはブランドページへ向け直す。ブランドページは必ず存在し、
 * そのブランドの他のモデルへ進めるので読者は行き止まりにならない。
 */
export function fixDeadLinks(html: string, lang: Lang): string {
  return html.replace(LINK_RE, (whole, l: string, brandId: string, modelId: string, label: string) => {
    if (hasOwnPage(brandId, modelId)) return whole;
    return `<a href="/${l}/brands/${brandId}/">${label}</a>`;
  });
}

export function insertFigures(html: string, lang: Lang, max = 6): string {
  const summary = getSummary();
  const brands = getAllBrands();
  const used = new Set<string>();
  let inserted = 0;

  // 段落の切れ目に差し込むため、まず対象となるリンクを拾う
  const targets: { key: string; brandId: string; modelId: string; label: string }[] = [];
  for (const m of html.matchAll(LINK_RE)) {
    const [, , brandId, modelId, label] = m;
    const key = `${brandId}/${modelId}`;
    if (used.has(key)) continue;
    used.add(key);
    targets.push({ key, brandId, modelId, label });
  }

  for (const tgt of targets) {
    if (inserted >= max) break;
    const entry = summary[tgt.key];
    if (!entry?.image) continue;

    const brand = brands.find((b) => b.brand.id === tgt.brandId);
    const model = brand?.models.find((mm) => mm.id === tgt.modelId);
    if (!brand || !model) continue;

    const offer = getPriceData(tgt.brandId, tgt.modelId)?.offers?.[0];
    if (!offer?.url) continue;

    const name = lang === 'ja' ? `${brand.brand.name_ja} ${model.name_ja}` : `${brand.brand.name_en} ${model.name_en}`;
    const src = imageUrl(entry.image, 'card');
    if (!src) continue;

    const figure =
      `<figure class="article-figure">` +
      `<a href="${esc(offer.url)}" target="_blank" rel="sponsored nofollow noopener">` +
      `<img src="${esc(src)}" alt="${esc(name)}" loading="lazy">` +
      `</a>` +
      `<figcaption>` +
      `<b>${esc(name)}</b>` +
      `<span class="af-price">${formatJpy(entry.lowestPrice, lang)}〜</span>` +
      `<span class="af-src">${t(lang, `source_${entry.source}` as string)} / ${esc(entry.shop)}` +
      `<span class="dealer-ad">${t(lang, 'ad_label')}</span></span>` +
      `</figcaption></figure>`;

    // そのリンクを含む段落の直後に置く（段落の途中に画像を割り込ませない）
    const anchor = `/${lang}/watch/${tgt.brandId}/${tgt.modelId}/`;
    const idx = html.indexOf(anchor);
    if (idx === -1) continue;
    const end = html.indexOf('</p>', idx);
    if (end === -1) continue;
    html = html.slice(0, end + 4) + figure + html.slice(end + 4);
    inserted++;
  }

  return html;
}
