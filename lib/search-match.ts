/**
 * 検索語とモデルの照合。
 *
 * 求めているのは「Googleのように、多少打ち間違えても近いモデルが出る」挙動。
 * そのために3段階で当てる。
 *   1. 部分一致        … 「ロレックス」「submariner」など、正しく打てた場合
 *   2. 区切り無視の一致 … 「23332412101001」と「233.32.41.21.01.001」を同じ扱いにする
 *   3. 編集距離        … 「ロレッスク」「submarinar」のような打ち間違いを拾う
 *
 * 29,000件を1文字入力するたびに走査するので、3の編集距離は高くつく。
 * そこで1〜2で1件でも当たったらそこで返し、**0件のときだけ**3を走らせる。
 * 打ち間違いは稀なので、高い計算を払うのはその稀な場合だけで足りる。
 */

export interface Matchable {
  bja: string;
  ben: string;
  mja: string;
  men: string;
  ref: string | null;
}

/** 全角/半角・大文字小文字・ひらがな/カタカナの違いを消す */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    // ひらがな→カタカナ。「さぶまりーな」でも「サブマリーナ」に当てる
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .trim();
}

/**
 * 区切りを落とした形。型番と長音の表記ゆれを吸収する。
 * 233.32.41.21.01.001 → 2333241210 1001 / サブマリーナー → サブマリナ
 */
export function flatten(s: string): string {
  return normalize(s).replace(/[.\-/_\s・ー]/g, '');
}

/**
 * 編集距離。max を超えると分かった時点で打ち切る。
 *
 * 隣り合う2文字の入れ替え（ロレックス→ロレッスク）を1回として数える。
 * 素の編集距離だとこれが2回ぶんになり、5文字の語では許容外になってしまうが、
 * 実際の打ち間違いで最も多いのがこの入れ替えなので、必ず拾えるようにする。
 */
function editDistanceWithin(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const w = b.length + 1;
  let prev2 = new Array<number>(w).fill(0);
  let prev = new Array<number>(w);
  let cur = new Array<number>(w);
  for (let j = 0; j < w; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j < w; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // 隣接する2文字の入れ替え
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // この行の最小値が既に max を超えていれば、以降どう進んでも縮まらない
    if (rowMin > max) return max + 1;
    const tmp = prev2;
    prev2 = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[b.length];
}

/** 何文字までの打ち間違いを許すか。短い語で許すと無関係な結果が溢れる */
function tolerance(len: number): number {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

/** 検索語を語に分ける */
export function tokenize(query: string): string[] {
  return normalize(query).split(/\s+/).filter(Boolean);
}

/**
 * 正規化した文字列を各エントリに1度だけ作って持たせる。
 *
 * 29,000件×5項目を1打鍵ごとに正規化し直すと140ms前後かかり、入力が目に見えて重くなる。
 * 正規化の結果は入力によらず不変なので、初回だけ作って使い回す。
 */
interface Prepared {
  __n?: string[]; // 正規化済み（部分一致・編集距離用）
  __f?: string[]; // 区切りを落とした形（型番用）
}

function prepare(e: Matchable): string[][] {
  const c = e as Matchable & Prepared;
  if (!c.__n) {
    const raw = [e.mja, e.men, e.bja, e.ben, e.ref ?? ''];
    c.__n = raw.map(normalize);
    c.__f = raw.map(flatten);
  }
  return [c.__n, c.__f!];
}

/**
 * 1〜2段階目。当たり方が良いほど高い点を返す（0 なら不一致）。
 * モデル名で当たったほうがブランド名で当たるより有用なので重みを付ける。
 */
function fastTokenScore(e: Matchable, tk: string, flatTk: string): number {
  const [ns, fsFlat] = prepare(e);
  let best = 0;
  for (let i = 0; i < ns.length; i++) {
    const f = ns[i];
    if (!f) continue;
    // モデル名(0,1)と型番(4)を、ブランド名(2,3)より優先する
    const weight = i === 4 ? 1.2 : i <= 1 ? 1.1 : 1;
    if (f === tk) best = Math.max(best, 100 * weight);
    else if (f.startsWith(tk)) best = Math.max(best, 80 * weight);
    else if (f.includes(tk)) best = Math.max(best, 60 * weight);
  }
  if (best > 0) return best;

  // 区切りを落とした照合。型番は3文字未満だと誤爆するので下限を設ける
  if (flatTk.length >= 3) {
    for (const f of fsFlat) {
      if (f && f.includes(flatTk)) return 55;
    }
  }
  return 0;
}

/** 3段階目。打ち間違いを編集距離で拾う */
function fuzzyTokenScore(e: Matchable, tk: string): number {
  const tol = tolerance(tk.length);
  if (tol === 0) return 0;
  let best = 0;
  const ns = prepare(e)[0];
  for (let i = 0; i < ns.length; i++) {
    const f = ns[i];
    if (!f) continue;
    const weight = i === 4 ? 1.2 : i <= 1 ? 1.1 : 1;

    // 項目そのものとの距離。「ロレッスク」→ ブランド名「ロレックス」はここで当たる
    const d = editDistanceWithin(f, tk, tol);
    if (d <= tol) {
      best = Math.max(best, (40 - d * 12) * weight);
      continue;
    }

    // 項目の一部としての一致。複数語の名前の片方だけを誤った場合を拾う。
    // ただし、商品名にブランド名が羅列された粗いデータ（「オメガ カシオ ロレックス」）が
    // 本物より上に来ないよう、項目そのものの一致より必ず低い点にする
    for (const w of f.split(/[\s・]+/)) {
      if (!w) continue;
      const dw = editDistanceWithin(w, tk, tol);
      if (dw <= tol) {
        best = Math.max(best, (26 - dw * 8) * weight);
        if (dw === 0) break;
      }
    }
  }
  return best;
}

export interface Scored<T> {
  entry: T;
  score: number;
}

/**
 * 検索の本体。上位 limit 件を点数順で返す。
 * 部分一致で1件でも取れたら編集距離は走らせない（速度のため）。
 */
export function searchEntries<T extends Matchable>(entries: T[], query: string, limit: number): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const flatTokens = tokens.map(flatten);

  const hits: Scored<T>[] = [];
  for (const e of entries) {
    let total = 0;
    for (let i = 0; i < tokens.length; i++) {
      const s = fastTokenScore(e, tokens[i], flatTokens[i]);
      // ひとつでも当たらない語があれば採らない（絞り込みとして振る舞わせる）
      if (s === 0) {
        total = 0;
        break;
      }
      total += s;
    }
    if (total > 0) hits.push({ entry: e, score: total });
  }

  if (hits.length === 0) {
    // ここに来るのは打ち間違いのとき。ここで初めて編集距離を払う
    for (const e of entries) {
      let total = 0;
      for (const tk of tokens) {
        const s = fastTokenScore(e, tk, flatten(tk)) || fuzzyTokenScore(e, tk);
        if (s === 0) {
          total = 0;
          break;
        }
        total += s;
      }
      if (total > 0) hits.push({ entry: e, score: total });
    }
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit).map((h) => h.entry);
}

/** 絞り込み用。点数は要らず、当たるかどうかだけ知りたい場合 */
export function matchesQuery(e: Matchable, tokens: string[], flatTokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    if (fastTokenScore(e, tokens[i], flatTokens[i]) === 0) return false;
  }
  return true;
}

/**
 * 絞り込みページ用。上位N件ではなく**当たった全件**を返す。
 * ファセット（ブランド別・価格帯別の件数）を出すのに全件が要るため。
 */
export function filterEntries<T extends Matchable>(entries: T[], query: string): T[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return entries;
  const flatTokens = tokens.map(flatten);

  const hits = entries.filter((e) => matchesQuery(e, tokens, flatTokens));
  if (hits.length > 0) return hits;

  // 0件のときだけ打ち間違いとみなして編集距離で拾い直す
  return entries.filter((e) =>
    tokens.every((tk, i) => fastTokenScore(e, tk, flatTokens[i]) > 0 || fuzzyTokenScore(e, tk) > 0),
  );
}
