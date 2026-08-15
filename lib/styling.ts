import fs from 'node:fs';
import path from 'node:path';
import type { WatchModel } from '@/lib/data';

/**
 * 時計に似合う装いを選ぶ。
 *
 * SAFARI のような誌面では、時計そのものより「それを着けて何を着るか」が読まれる。
 * ただし装いの提案は記事ごとに手で書けないので、時計の性格（用途タグ・素材・ケース径）から
 * 機械的に導く。同じ時計なら常に同じ装いが出るので、記事間で言うことがぶれない。
 */
export interface StylingLook {
  id: string;
  image: string;
  name_ja: string;
  name_en: string;
  lead_ja: string;
  lead_en: string;
  items_ja: string[];
  items_en: string[];
  fits_ja: string;
  fits_en: string;
}

interface StylingData {
  disclaimer_ja: string;
  disclaimer_en: string;
  looks: StylingLook[];
}

let cache: StylingData | null = null;

export function getStyling(): StylingData {
  if (cache) return cache;
  try {
    const f = path.join(process.cwd(), 'data/styling.json');
    cache = JSON.parse(fs.readFileSync(f, 'utf8')) as StylingData;
  } catch {
    cache = { disclaimer_ja: '', disclaimer_en: '', looks: [] };
  }
  return cache;
}

/**
 * 時計の性格から装いを2つ選ぶ。
 * 優先順に候補を積み、足りなければ最も外れの少ない「ジャケット」で埋める。
 */
export function looksForModel(model: WatchModel): StylingLook[] {
  const looks = getStyling().looks;
  const byId = (id: string) => looks.find((l) => l.id === id);
  const tags = new Set(model.tags ?? []);
  const size = model.caseSizeMm ?? 40;

  const order: string[] = [];
  const push = (id: string) => {
    if (!order.includes(id)) order.push(id);
  };

  // ブラックタイは条件が厳しい。ドレスウォッチであることに加え、
  // 袖に収まる小ささが要る（41mmのドレス系に「タキシードで」と言うのは無理がある）
  if ((tags.has('dress') || tags.has('small-seconds')) && size <= 39) {
    push('formal');
  }
  // スーツは、静かな盤面で袖口に収まれば広く許容される
  if (tags.has('dress') || tags.has('small-seconds') || size <= 40) {
    push('business');
  }
  // 水と陽: ダイバーズ・GMT
  if (tags.has('diver') || tags.has('gmt')) {
    push('resort');
    push('smart-casual');
  }
  // 機械を見せる盤面
  if (tags.has('chronograph') || tags.has('power-reserve') || tags.has('tourbillon')) {
    push('jacket');
    push('business');
  }
  // 道具としての時計
  if (tags.has('pilot') || tags.has('field') || tags.has('lightweight')) {
    push('weekend');
    push('jacket');
  }
  // 大きく重い時計は、袖の狭い装いに入らない
  if (size >= 43) {
    push('weekend');
    push('smart-casual');
  }

  push('business');
  push('jacket');

  return order
    .map(byId)
    .filter((l): l is StylingLook => Boolean(l))
    .slice(0, 2);
}
