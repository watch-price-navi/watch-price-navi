#!/usr/bin/env node
/** 検索ボックス用の軽量インデックス public/search-index.json を生成する */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const brandsDir = path.join(ROOT, 'data', 'brands');
const outFile = path.join(ROOT, 'public', 'search-index.json');

const entries = [];
if (fs.existsSync(brandsDir)) {
  for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
    try {
      const { brand, models } = JSON.parse(fs.readFileSync(path.join(brandsDir, f), 'utf8'));
      for (const m of models ?? []) {
        entries.push({
          b: brand.id,
          bja: brand.name_ja,
          ben: brand.name_en,
          m: m.id,
          mja: m.name_ja,
          men: m.name_en,
          ref: m.reference ?? null,
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
