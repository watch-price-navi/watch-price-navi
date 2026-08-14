'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { t, type Lang } from '@/lib/i18n';
import { CASE_MATERIALS, GENDERS, MOVEMENTS, TAGS, type TaxEntry } from '@/lib/taxonomy';

interface Entry {
  b: string; bja: string; ben: string;
  m: string; mja: string; men: string;
  ref: string | null;
  cs: number | null;
  mat: string | null;
  mv: string | null;
  tags: string[];
  wr: number | null;
  g: string | null;
  ry: number | null;
  pop: boolean;
  price: number | null;
  pn: number | null;
  pu: number | null;
  img: string | null;
}

type SortKey = 'price-asc' | 'price-desc' | 'popular' | 'name' | 'newest' | 'case-asc' | 'case-desc';

const PRICE_BANDS: { id: string; ja: string; en: string; min: number; max: number }[] = [
  { id: 'u5', ja: '〜5万円', en: 'Under ¥50k', min: 0, max: 50_000 },
  { id: '5-10', ja: '5〜10万円', en: '¥50k–100k', min: 50_000, max: 100_000 },
  { id: '10-30', ja: '10〜30万円', en: '¥100k–300k', min: 100_000, max: 300_000 },
  { id: '30-50', ja: '30〜50万円', en: '¥300k–500k', min: 300_000, max: 500_000 },
  { id: '50-100', ja: '50〜100万円', en: '¥500k–1M', min: 500_000, max: 1_000_000 },
  { id: '100-300', ja: '100〜300万円', en: '¥1M–3M', min: 1_000_000, max: 3_000_000 },
  { id: 'o300', ja: '300万円以上', en: 'Over ¥3M', min: 3_000_000, max: Infinity },
];

const CASE_BANDS: { id: string; ja: string; en: string; min: number; max: number }[] = [
  { id: 'u34', ja: '〜34mm', en: 'Under 34mm', min: 0, max: 34 },
  { id: '34-38', ja: '34〜38mm', en: '34–38mm', min: 34, max: 38 },
  { id: '38-40', ja: '38〜40mm', en: '38–40mm', min: 38, max: 40 },
  { id: '40-42', ja: '40〜42mm', en: '40–42mm', min: 40, max: 42 },
  { id: '42-45', ja: '42〜45mm', en: '42–45mm', min: 42, max: 45 },
  { id: 'o45', ja: '45mm以上', en: 'Over 45mm', min: 45, max: Infinity },
];

const WR_BANDS: { id: string; ja: string; en: string; min: number }[] = [
  { id: 'wr100', ja: '100m以上', en: '100m+', min: 100 },
  { id: 'wr200', ja: '200m以上', en: '200m+', min: 200 },
  { id: 'wr300', ja: '300m以上', en: '300m+', min: 300 },
];

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function fmt(n: number, lang: Lang): string {
  return lang === 'ja' ? `¥${n.toLocaleString('ja-JP')}` : `JPY ${n.toLocaleString('en-US')}`;
}

function FacetGroup({
  title,
  items,
  selected,
  onToggle,
  lang,
  counts,
}: {
  title: string;
  items: { id: string; ja: string; en: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  lang: Lang;
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="facet">
      <button className="facet-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        {title}
        <span className={`facet-caret${open ? ' open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="facet-body">
          {items.map((it) => {
            const n = counts ? counts[it.id] ?? 0 : undefined;
            const disabled = n === 0 && !selected.includes(it.id);
            return (
              <label key={it.id} className={`facet-item${disabled ? ' disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={selected.includes(it.id)}
                  onChange={() => onToggle(it.id)}
                  disabled={disabled}
                />
                <span>{lang === 'ja' ? it.ja : it.en}</span>
                {n !== undefined && <em>{n}</em>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SearchExplorer({
  lang,
  brands,
}: {
  lang: Lang;
  brands: { id: string; ja: string; en: string }[];
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [q, setQ] = useState('');
  const [fBrand, setFBrand] = useState<string[]>([]);
  const [fMat, setFMat] = useState<string[]>([]);
  const [fMv, setFMv] = useState<string[]>([]);
  const [fTag, setFTag] = useState<string[]>([]);
  const [fGender, setFGender] = useState<string[]>([]);
  const [fPrice, setFPrice] = useState<string[]>([]);
  const [fCase, setFCase] = useState<string[]>([]);
  const [fWr, setFWr] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('popular');
  const [limit, setLimit] = useState(48);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/search-index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: Entry[]) => setEntries(d))
      .catch(() => setEntries([]));
  }, []);

  // URLクエリから条件を復元（?brand=rolex&tag=diver など。共有・SEO流入に対応）
  // searchParams に追従させること。同じ /search/ 内のクイックピックはページ遷移では
  // 再マウントされないため、依存配列が空だと2回目以降のリンクが効かなくなる。
  const searchParams = useSearchParams();
  useEffect(() => {
    const p = new URLSearchParams(searchParams?.toString() ?? '');
    const get = (k: string) => p.getAll(k).flatMap((v) => v.split(',')).filter(Boolean);
    setQ(p.get('q') ?? '');
    setFBrand(get('brand'));
    setFMat(get('material'));
    setFMv(get('movement'));
    setFTag(get('tag'));
    setFGender(get('gender'));
    setFPrice(get('price'));
    setFCase(get('case'));
    setFWr(get('wr'));
    setLimit(48);
  }, [searchParams]);

  const brandItems = useMemo(() => brands.map((b) => ({ id: b.id, ja: b.ja, en: b.en })), [brands]);

  // 検索語・在庫以外の条件で絞った集合に対し、各ファセットの件数を出す
  const base = useMemo(() => {
    if (!entries) return [];
    const tokens = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return entries.filter((e) => {
      if (tokens.length) {
        const hay = `${e.bja} ${e.ben} ${e.mja} ${e.men} ${e.ref ?? ''}`.toLowerCase();
        if (!tokens.every((tk) => hay.includes(tk))) return false;
      }
      if (inStockOnly && e.price == null) return false;
      return true;
    });
  }, [entries, q, inStockOnly]);

  const matchers = useMemo(() => {
    const inPrice = (e: Entry) =>
      fPrice.length === 0 ||
      (e.price != null && PRICE_BANDS.some((b) => fPrice.includes(b.id) && e.price! >= b.min && e.price! < b.max));
    const inCase = (e: Entry) =>
      fCase.length === 0 ||
      (e.cs != null && CASE_BANDS.some((b) => fCase.includes(b.id) && e.cs! >= b.min && e.cs! < b.max));
    const inWr = (e: Entry) =>
      fWr.length === 0 ||
      (e.wr != null && WR_BANDS.filter((b) => fWr.includes(b.id)).every((b) => e.wr! >= b.min));
    return {
      brand: (e: Entry) => fBrand.length === 0 || fBrand.includes(e.b),
      mat: (e: Entry) => fMat.length === 0 || (e.mat != null && fMat.includes(e.mat)),
      mv: (e: Entry) => fMv.length === 0 || (e.mv != null && fMv.includes(e.mv)),
      tag: (e: Entry) => fTag.length === 0 || fTag.every((tg) => e.tags.includes(tg)),
      gender: (e: Entry) => fGender.length === 0 || (e.g != null && fGender.includes(e.g)),
      price: inPrice,
      case: inCase,
      wr: inWr,
    };
  }, [fBrand, fMat, fMv, fTag, fGender, fPrice, fCase, fWr]);

  // あるファセットの件数は、そのファセット自身の条件を外して集計する（Chrono24等と同じ挙動）
  function countsFor(exclude: keyof typeof matchers, keyOf: (e: Entry) => string[]): Record<string, number> {
    const acc: Record<string, number> = {};
    for (const e of base) {
      let ok = true;
      for (const [k, fn] of Object.entries(matchers)) {
        if (k === exclude) continue;
        if (!fn(e)) { ok = false; break; }
      }
      if (!ok) continue;
      for (const k of keyOf(e)) acc[k] = (acc[k] ?? 0) + 1;
    }
    return acc;
  }

  const cBrand = useMemo(() => countsFor('brand', (e) => [e.b]), [base, matchers]);
  const cMat = useMemo(() => countsFor('mat', (e) => (e.mat ? [e.mat] : [])), [base, matchers]);
  const cMv = useMemo(() => countsFor('mv', (e) => (e.mv ? [e.mv] : [])), [base, matchers]);
  const cTag = useMemo(() => countsFor('tag', (e) => e.tags), [base, matchers]);
  const cGender = useMemo(() => countsFor('gender', (e) => (e.g ? [e.g] : [])), [base, matchers]);
  const cPrice = useMemo(
    () => countsFor('price', (e) => (e.price == null ? [] : PRICE_BANDS.filter((b) => e.price! >= b.min && e.price! < b.max).map((b) => b.id))),
    [base, matchers]
  );
  const cCase = useMemo(
    () => countsFor('case', (e) => (e.cs == null ? [] : CASE_BANDS.filter((b) => e.cs! >= b.min && e.cs! < b.max).map((b) => b.id))),
    [base, matchers]
  );
  const cWr = useMemo(
    () => countsFor('wr', (e) => (e.wr == null ? [] : WR_BANDS.filter((b) => e.wr! >= b.min).map((b) => b.id))),
    [base, matchers]
  );

  const results = useMemo(() => {
    const list = base.filter((e) => Object.values(matchers).every((fn) => fn(e)));
    const byPrice = (a: Entry, b: Entry, dir: number) => {
      if (a.price == null && b.price == null) return 0;
      if (a.price == null) return 1; // 価格なしは常に末尾
      if (b.price == null) return -1;
      return (a.price - b.price) * dir;
    };
    const sorted = [...list];
    switch (sort) {
      case 'price-asc': sorted.sort((a, b) => byPrice(a, b, 1)); break;
      case 'price-desc': sorted.sort((a, b) => byPrice(a, b, -1)); break;
      case 'name': sorted.sort((a, b) => `${a.ben} ${a.men}`.localeCompare(`${b.ben} ${b.men}`)); break;
      case 'newest': sorted.sort((a, b) => (b.ry ?? 0) - (a.ry ?? 0)); break;
      case 'case-asc': sorted.sort((a, b) => (a.cs ?? 999) - (b.cs ?? 999)); break;
      case 'case-desc': sorted.sort((a, b) => (b.cs ?? 0) - (a.cs ?? 0)); break;
      default:
        sorted.sort((a, b) => (Number(b.pop) - Number(a.pop)) || byPrice(a, b, 1));
    }
    return sorted;
  }, [base, matchers, sort]);

  const activeCount =
    fBrand.length + fMat.length + fMv.length + fTag.length + fGender.length + fPrice.length + fCase.length + fWr.length + (inStockOnly ? 1 : 0);

  function clearAll() {
    setFBrand([]); setFMat([]); setFMv([]); setFTag([]); setFGender([]);
    setFPrice([]); setFCase([]); setFWr([]); setInStockOnly(false);
  }

  const chips: { label: string; onRemove: () => void }[] = [
    ...fBrand.map((id) => ({ label: brandItems.find((b) => b.id === id)?.[lang] ?? id, onRemove: () => setFBrand(toggle(fBrand, id)) })),
    ...fMat.map((id) => ({ label: label(CASE_MATERIALS, id), onRemove: () => setFMat(toggle(fMat, id)) })),
    ...fMv.map((id) => ({ label: label(MOVEMENTS, id), onRemove: () => setFMv(toggle(fMv, id)) })),
    ...fTag.map((id) => ({ label: label(TAGS, id), onRemove: () => setFTag(toggle(fTag, id)) })),
    ...fGender.map((id) => ({ label: label(GENDERS, id), onRemove: () => setFGender(toggle(fGender, id)) })),
    ...fPrice.map((id) => ({ label: bandLabel(PRICE_BANDS, id), onRemove: () => setFPrice(toggle(fPrice, id)) })),
    ...fCase.map((id) => ({ label: bandLabel(CASE_BANDS, id), onRemove: () => setFCase(toggle(fCase, id)) })),
    ...fWr.map((id) => ({ label: bandLabel(WR_BANDS as never, id), onRemove: () => setFWr(toggle(fWr, id)) })),
  ];

  function label(list: TaxEntry[], id: string): string {
    const e = list.find((x) => x.id === id);
    return e ? e[lang] : id;
  }
  function bandLabel(list: { id: string; ja: string; en: string }[], id: string): string {
    const e = list.find((x) => x.id === id);
    return e ? e[lang] : id;
  }

  const facets = (
    <>
      <div className="facet-top">
        <strong>{t(lang, 'filters')}</strong>
        {activeCount > 0 && (
          <button className="link-btn" onClick={clearAll}>
            {t(lang, 'clear_all')}
          </button>
        )}
      </div>
      <label className="facet-item standalone">
        <input type="checkbox" checked={inStockOnly} onChange={() => setInStockOnly(!inStockOnly)} />
        <span>{t(lang, 'in_stock_only')}</span>
      </label>
      <FacetGroup title={t(lang, 'f_price')} items={PRICE_BANDS} selected={fPrice} onToggle={(id) => setFPrice(toggle(fPrice, id))} lang={lang} counts={cPrice} />
      <FacetGroup title={t(lang, 'f_brand')} items={brandItems} selected={fBrand} onToggle={(id) => setFBrand(toggle(fBrand, id))} lang={lang} counts={cBrand} />
      <FacetGroup title={t(lang, 'f_tag')} items={TAGS} selected={fTag} onToggle={(id) => setFTag(toggle(fTag, id))} lang={lang} counts={cTag} />
      <FacetGroup title={t(lang, 'f_case')} items={CASE_BANDS} selected={fCase} onToggle={(id) => setFCase(toggle(fCase, id))} lang={lang} counts={cCase} />
      <FacetGroup title={t(lang, 'f_material')} items={CASE_MATERIALS} selected={fMat} onToggle={(id) => setFMat(toggle(fMat, id))} lang={lang} counts={cMat} />
      <FacetGroup title={t(lang, 'f_movement')} items={MOVEMENTS} selected={fMv} onToggle={(id) => setFMv(toggle(fMv, id))} lang={lang} counts={cMv} />
      <FacetGroup title={t(lang, 'f_wr')} items={WR_BANDS as never} selected={fWr} onToggle={(id) => setFWr(toggle(fWr, id))} lang={lang} counts={cWr} />
      <FacetGroup title={t(lang, 'f_gender')} items={GENDERS} selected={fGender} onToggle={(id) => setFGender(toggle(fGender, id))} lang={lang} counts={cGender} />
    </>
  );

  return (
    <div className="explorer">
      <aside className={`explorer-side${drawerOpen ? ' open' : ''}`}>
        <div className="drawer-head">
          <strong>{t(lang, 'filters')}</strong>
          <button className="link-btn" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
        {facets}
        <button className="btn drawer-apply" onClick={() => setDrawerOpen(false)}>
          {results.length} {t(lang, 'results_show')}
        </button>
      </aside>

      <div className="explorer-main">
        <div className="explorer-bar">
          <input
            className="explorer-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t(lang, 'search_placeholder')}
            aria-label={t(lang, 'search_placeholder')}
          />
          <div className="explorer-tools">
            <button className="btn btn-outline filter-toggle" onClick={() => setDrawerOpen(true)}>
              {t(lang, 'filters')}
              {activeCount > 0 && <span className="chip-count">{activeCount}</span>}
            </button>
            <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label={t(lang, 'sort_by')}>
              <option value="popular">{t(lang, 'sort_popular')}</option>
              <option value="price-asc">{t(lang, 'sort_price_asc')}</option>
              <option value="price-desc">{t(lang, 'sort_price_desc')}</option>
              <option value="newest">{t(lang, 'sort_newest')}</option>
              <option value="case-asc">{t(lang, 'sort_case_asc')}</option>
              <option value="case-desc">{t(lang, 'sort_case_desc')}</option>
              <option value="name">{t(lang, 'sort_name')}</option>
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="chips">
            {chips.map((c, i) => (
              <button key={`${c.label}-${i}`} className="chip" onClick={c.onRemove}>
                {c.label} <span>✕</span>
              </button>
            ))}
            <button className="link-btn" onClick={clearAll}>{t(lang, 'clear_all')}</button>
          </div>
        )}

        <div className="result-count">
          {entries === null ? t(lang, 'loading') : `${results.length} ${t(lang, 'results_found')}`}
        </div>

        {entries !== null && results.length === 0 ? (
          <div className="notice notice-empty">
            <b>{t(lang, 'search_no_results')}</b>
            {t(lang, 'search_no_results_hint')}
          </div>
        ) : (
          <>
            <div className="grid grid-models">
              {results.slice(0, limit).map((e) => (
                <Link key={`${e.b}/${e.m}`} href={`/${lang}/watch/${e.b}/${e.m}/`} className="card product-card" prefetch={false}>
                  <div className="pc-media">
                    {e.img ? (
                      <img src={e.img} alt={lang === 'ja' ? e.mja : e.men} loading="lazy" />
                    ) : (
                      <div className="pc-noimg">{e.ben}</div>
                    )}
                    {e.pop && <span className="pc-badge">{t(lang, 'badge_popular')}</span>}
                  </div>
                  <div className="pc-body">
                    <div className="card-brand">{lang === 'ja' ? e.bja : e.ben}</div>
                    <div className="card-name">{lang === 'ja' ? e.mja : e.men}</div>
                    {e.ref && <div className="card-ref">Ref. {e.ref}</div>}
                    <div className="pc-meta">
                      {[e.cs ? `${e.cs}mm` : null, e.mat ? label(CASE_MATERIALS, e.mat) : null, e.mv ? label(MOVEMENTS, e.mv) : null]
                        .filter(Boolean)
                        .join(' ・ ')}
                    </div>
                    {e.price != null ? (
                      <div className="card-price">
                        {fmt(e.price, lang)}
                        <small>
                          {t(lang, 'lowest_price')}
                          {e.pn != null && e.pu != null ? ` ・ ${t(lang, 'condition_new')} ${fmt(e.pn, lang)} / ${t(lang, 'condition_used')} ${fmt(e.pu, lang)}` : ''}
                        </small>
                      </div>
                    ) : (
                      <div className="card-nodata">{t(lang, 'view_model')} →</div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
            {results.length > limit && (
              <div className="load-more">
                <button className="btn btn-outline" onClick={() => setLimit(limit + 48)}>
                  {t(lang, 'load_more')}（{results.length - limit}）
                </button>
              </div>
            )}
          </>
        )}
      </div>
      {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}
