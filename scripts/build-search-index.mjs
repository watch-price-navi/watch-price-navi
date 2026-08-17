#!/usr/bin/env node
/** 検索ページ・検索ボックス用のインデックス public/search-index.json を生成する */
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalogs } from './lib/catalog.mjs';
import { readJson } from './lib/json.mjs';

const ROOT = process.cwd();
const summaryFile = path.join(ROOT, 'data', 'prices', 'summary.json');
const outFile = path.join(ROOT, 'public', 'search-index.json');
const MIN_OFFERS = Number(process.env.MIN_OFFERS_FOR_PAGE ?? 2);

let summary = {};
if (fs.existsSync(summaryFile)) {
  try { summary = readJson(summaryFile); } catch { summary = {}; }
}

/**
 * ブランドの格。検索の既定の並び（おすすめ順）で使う。
 *
 * 以前は「人気フラグ → 安い順」で並べていたため、
 * 条件検索を開くといちばん安いカシオから始まっていた。
 * 高級時計を見に来た人に最初に見せるものではない。
 * data/brand-tier.json の数字が大きいブランドを先に出す。
 */
const tierOf = (() => {
  const map = {};
  try {
    const j = readJson(path.join(ROOT, 'data', 'brand-tier.json'));
    for (const [score, group] of Object.entries(j.tiers ?? {})) {
      for (const id of group.brands ?? []) map[id] = Number(score);
    }
  } catch {
    /* 無ければ全ブランド同格として扱う */
  }
  return (id) => map[id] ?? 20;
})();

const entries = [];
{
  for (const { brand, models } of loadCatalogs(ROOT)) {
    {
      for (const m of models ?? []) {
        const s = summary[`${brand.id}/${m.id}`] ?? null;
        let offerUrl = null;
        if (s && (s.offerCount ?? 0) < MIN_OFFERS) {
          const pf = path.join(ROOT, 'data', 'prices', brand.id, `${m.id}.json`);
          if (fs.existsSync(pf)) { try { offerUrl = readJson(pf).offers?.[0]?.url ?? null; } catch {} }
        }
        entries.push({
          b: brand.id,
          bja: brand.name_ja,
          ben: brand.name_en,
          m: m.id,
          mja: m.name_ja,
          men: m.name_en,
          ref: m.reference ?? null,
          cs: m.caseSizeMm ?? null,       // ケース径mm
          mat: m.caseMaterial ?? null,     // ケース素材
          mv: m.movementType ?? null,      // ムーブメント
          tags: m.tags ?? [],
          wr: m.waterResistanceM ?? null,  // 防水m
          g: m.gender ?? null,
          ry: m.releaseYear ?? null,
          pop: Boolean(m.popular),
          /** ブランドの格。おすすめ順の並びに使う（大きいほど先） */
          tier: tierOf(brand.id),
          price: s ? s.lowestPrice : null,
          pn: s ? (s.lowestNew ?? null) : null,
          pu: s ? (s.lowestUsed ?? null) : null,
          img: s ? (s.image ?? null) : null,
          // 個別ページを持つか。持たない場合は検索結果から販売店へ直接送る
          pg: (s?.offerCount ?? 0) >= MIN_OFFERS ? 1 : 0,
          url: offerUrl,
        });
      }
    }
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(entries), 'utf8');
console.log(`search-index.json: ${entries.length} entries`);
