'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { searchEntries } from '@/lib/search-match';
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
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState(false);
  // キーボードで候補を選べるようにする。-1 は「候補を選んでいない＝そのまま全文検索」
  const [cursor, setCursor] = useState(-1);
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

  const trimmed = query.trim();
  const results = trimmed ? searchEntries(entries, trimmed, 8) : [];

  const goToSearch = () => {
    if (!trimmed) return;
    setOpen(false);
    router.push(`/${lang}/search/?q=${encodeURIComponent(trimmed)}`);
  };

  const goToModel = (e: Entry) => {
    setOpen(false);
    router.push(`/${lang}/watch/${e.b}/${e.m}/`);
  };

  return (
    <div className="searchbox" ref={boxRef}>
      {/*
        form にしているのは、スマホのキーボードに「検索」キーを出し、
        押したときに素直に検索が進むようにするため。
        候補を選ばずそのまま送信したときは、絞り込みページへ全文で渡す。
      */}
      <form
        role="search"
        onSubmit={(ev) => {
          ev.preventDefault();
          if (cursor >= 0 && results[cursor]) goToModel(results[cursor]);
          else goToSearch();
        }}
      >
        <input
          type="search"
          value={query}
          placeholder={t(lang, 'search_placeholder')}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(c + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, -1));
            }
          }}
          aria-label={t(lang, 'search_aria')}
        />
        <button type="submit" className="searchbox-go" aria-label={t(lang, 'search_submit')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </form>

      {/* 例文は placeholder に入れると狭い画面で切れて読めない。外に出す */}
      <p className="searchbox-hint">{t(lang, 'search_example')}</p>

      {open && trimmed.length > 0 && (
        <div className="search-results">
          {results.map((e, i) => (
            <Link
              key={`${e.b}/${e.m}`}
              href={`/${lang}/watch/${e.b}/${e.m}/`}
              onClick={() => setOpen(false)}
              onMouseEnter={() => setCursor(i)}
              className={i === cursor ? 'is-active' : undefined}
              prefetch={false}
            >
              <span className="sr-brand">{lang === 'ja' ? e.bja : e.ben}</span>
              <span className="sr-name">{lang === 'ja' ? e.mja : e.men}</span>
              {e.ref && <span className="sr-ref">{e.ref}</span>}
            </Link>
          ))}
          {/*
            候補が0件でも行き止まりにしない。絞り込みページには
            楽天・Yahoo!をそのキーワードで検索する導線があるため、必ず次の一手が残る
          */}
          <button type="button" className="search-all" onClick={goToSearch}>
            {t(lang, results.length === 0 ? 'search_no_results_go' : 'search_see_all').replace('{q}', trimmed)}
          </button>
        </div>
      )}
    </div>
  );
}
