/**
 * 商品画像のURLを、必要な表示サイズに合わせて組み立てる。
 *
 * 楽天とYahoo!でサイズの指定方法がまったく違う:
 *  - 楽天  thumbnail.image.rakuten.co.jp/... に `?_ex=600x600` を付けると
 *          その寸法で返る。付けなければ原寸（実測 1000〜1400px）。
 *  - Yahoo! item-shopping.c.yimg.jp/i/<g|j|l>/<id> のパス1文字がサイズ。
 *          g=146px / j=300px / l=600px。lが最大。
 *          収集時は g（146px）で保存されていたため、拡大すると潰れていた。
 *
 * 収集側は「原寸に最も近い形」で保存し、表示側でこの関数を通してサイズを決める。
 */
export type ImageSize = 'thumb' | 'card' | 'hero';

const PX: Record<ImageSize, number> = {
  thumb: 300, // 検索結果の小さいカード
  card: 600,  // 一覧カード
  hero: 900,  // モデルページの主画像
};

export function imageUrl(src: string | null | undefined, size: ImageSize = 'card'): string | null {
  if (!src) return null;
  const px = PX[size];

  // Yahoo!: パスの1文字でサイズが決まる。最大が l(600px) なので、それ以上は求めない
  const yahoo = src.match(/^(https?:\/\/item-shopping\.c\.yimg\.jp\/i\/)[a-z](\/.+)$/);
  if (yahoo) {
    const key = px <= 200 ? 'g' : px <= 300 ? 'j' : 'l';
    return `${yahoo[1]}${key}${yahoo[2]}`;
  }

  // 楽天: 既存の _ex を落としてから、欲しい寸法を指定する
  if (/rakuten\.co\.jp|r\d*\.r10s\.jp/.test(src)) {
    return `${src.replace(/\?_ex=\d+x\d+$/, '')}?_ex=${px}x${px}`;
  }

  return src;
}
