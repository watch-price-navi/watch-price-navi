#!/usr/bin/env node
/** 検索ページ・検索ボックス用のインデックス public/search-index.json を生成する */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const brandsDir = path.join(ROOT, 'data', 'brands');
const summaryFile = path.join(ROOT, 'data', 'prices', 'summary.json');
const outFile = path.join(ROOT, 'public', 'search-index.json');

let summary = {};
if (fs.existsSync(summaryFile)) {
  try { summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8')); } catch { summary = {}; }
}

const entries = [];
if (fs.existsSync(brandsDir)) {
  for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
    try {
      const { brand, models } = JSON.parse(fs.readFileSync(path.join(brandsDir, f), 'utf8'));
      for (const m of models ?? []) {
        const s = summary[`${brand.id}/${m.id}`] ?? null;
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
          price: s ? s.lowestPrice : null,
          pn: s ? (s.lowestNew ?? null) : null,
          pu: s ? (s.lowestUsed ?? null) : null,
          img: s ? (s.image ?? null) : null,
        });
      }
    } catch (e) {
      console.warn(`skip malformed ${f}: ${e.message}`);
    }
  }
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(entries), 'utf8');
console.log(`search-index.json: ${entries.length} entries`);
