'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { t, type Lang } from '@/lib/i18n';

interface Entry {
  b: string;   // brand id
  bja: string; // brand name ja
  ben: string; // brand name en
  m: string;   // model id
  mja: string; // model name ja
  men: string; // model name en
  ref: string | null;
}

let indexCache: Entry[] | null = null;

export default function SearchBox({ lang }: { lang: Lang }) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (indexCache) {
      setEntries(indexCache);
      return;
    }
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/search-index.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Entry[]) => {
        indexCache = data;
        setEntries(data);
      })
      .catch(() => setEntries([]));
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const results =
    tokens.length === 0
      ? []
      : entries
          .filter((e) => {
            const hay = `${e.bja} ${e.ben} ${e.mja} ${e.men} ${e.ref ?? ''}`.toLowerCase();
            return tokens.every((tk) => hay.includes(tk));
          })
          .slice(0, 8);

  return (
    <div className="searchbox" ref={boxRef}>
      <input
        type="search"
        value={query}
        placeholder={t(lang, 'search_placeholder')}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-label={t(lang, 'search_placeholder')}
      />
      {open && tokens.length > 0 && (
        <div className="search-results">
          {results.length === 0 ? (
            <div className="search-empty">{t(lang, 'search_no_results')}</div>
          ) : (
            results.map((e) => (
              <Link
                key={`${e.b}/${e.m}`}
                href={`/${lang}/watch/${e.b}/${e.m}/`}
                onClick={() => setOpen(false)}
                prefetch={false}
              >
                <span className="sr-brand">{lang === 'ja' ? e.bja : e.ben}</span>
                {lang === 'ja' ? e.mja : e.men}
                {e.ref && <span className="sr-ref">{e.ref}</span>}
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
