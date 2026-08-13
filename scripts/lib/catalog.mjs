/** 人手カタログ(data/brands)と自動カタログ(data/brands-auto)を統合して読み込む共通処理 */
import fs from 'node:fs';
import path from 'node:path';
import { readJson } from './json.mjs';

const normRef = (r) => r.toUpperCase().replace(/[.\-/\s]/g, '');

export { readJson };

/**
 * @param {string} root プロジェクトルート
 * @param {{ includeAuto?: boolean }} opts
 * @returns {Array<{brand: object, models: object[]}>}
 */
export function loadCatalogs(root, { includeAuto = true } = {}) {
  const brandsDir = path.join(root, 'data', 'brands');
  const autoDir = path.join(root, 'data', 'brands-auto');
  if (!fs.existsSync(brandsDir)) return [];

  const list = [];
  for (const f of fs.readdirSync(brandsDir).filter((f) => f.endsWith('.json'))) {
    try {
      const cat = readJson(path.join(brandsDir, f));
      if (cat?.brand?.id && Array.isArray(cat.models)) list.push(cat);
    } catch (e) {
      console.warn(`[catalog] skip malformed ${f}: ${e.message}`);
    }
  }

  if (includeAuto && fs.existsSync(autoDir)) {
    for (const cat of list) {
      const file = path.join(autoDir, `${cat.brand.id}.json`);
      if (!fs.existsSync(file)) continue;
      try {
        const auto = readJson(file);
        const ids = new Set(cat.models.map((m) => m.id));
        const refs = new Set(cat.models.filter((m) => m.reference).map((m) => normRef(m.reference)));
        for (const m of auto.models ?? []) {
          const r = m.reference ? normRef(m.reference) : null;
          if (ids.has(m.id) || (r && refs.has(r))) continue;
          ids.add(m.id);
          if (r) refs.add(r);
          cat.models.push({ ...m, source: 'auto' });
        }
      } catch (e) {
        console.warn(`[catalog] skip malformed auto ${cat.brand.id}: ${e.message}`);
      }
    }
  }

  list.sort((a, b) => a.brand.name_en.localeCompare(b.brand.name_en));
  return list;
}
