/**
 * Yahoo!ショッピングの出品URLを、成果の付くリンクに変換する。
 *
 * ── なぜバリューコマースではないのか ──────────────────────
 * Yahoo!ショッピングのアフィリエイトはバリューコマース経由が一般的だが、
 * 新規登録と審査が要る。一方、既に会員であるもしもアフィリエイトも
 * Yahoo!ショッピングを扱っており、審査なしで提携できた（2026-08-17）。
 * 成果は 1.54% で、バリューコマース（約1%）より高い。
 *
 * ── どこでもリンク ────────────────────────────────
 * もしもの「どこでもリンク」は、任意のURLを成果の付くリンクに変える仕組み。
 * 出品URLをそのまま包めるので、既に集めてある16,194件がすべて対象になる。
 *
 * ── 規約で守ること ────────────────────────────────
 * - **SNS・YouTube への掲載はNG。** Yahoo!の画像とリンクを Instagram に載せない。
 * - 画像は store.shopping.yahoo.co.jp の各ストアページの商品写真のみ使える。
 *   検索ページ・特集ページ・PayPayモール・ストアロゴの画像は不可。
 * - 本人申込NG。自分で買っても成果にならない。
 *
 * 番号は秘密ではない（リンクに含まれて公開される）。
 * 変えたいときは環境変数で上書きできる。
 */
const YAHOO = {
  a_id: process.env.MOSHIMO_YAHOO_A_ID || '5756865',
  p_id: process.env.MOSHIMO_YAHOO_P_ID || '1225',
  pc_id: process.env.MOSHIMO_YAHOO_PC_ID || '1925',
  pl_id: process.env.MOSHIMO_YAHOO_PL_ID || '18502',
};

/** そのURLが Yahoo!ショッピングの商品ページか */
export function isYahooShopping(url) {
  return /^https?:\/\/(store\.)?shopping\.yahoo\.co\.jp\//i.test(String(url ?? ''));
}

/**
 * Yahoo!の出品URLを、もしもの「どこでもリンク」で包む。
 * 既に包まれているもの、Yahoo!以外のURL、空はそのまま返す。
 */
export function wrapYahoo(url) {
  const u = String(url ?? '');
  if (!u || u.includes('af.moshimo.com')) return u;
  if (!isYahooShopping(u)) return u;
  const q = new URLSearchParams({
    a_id: YAHOO.a_id,
    p_id: YAHOO.p_id,
    pc_id: YAHOO.pc_id,
    pl_id: YAHOO.pl_id,
    url: u,
  });
  return `https://af.moshimo.com/af/c/click?${q}`;
}
