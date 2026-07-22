'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Lang } from '@/lib/i18n';

export default function LangSwitch({ lang }: { lang: Lang }) {
  const pathname = usePathname() || `/${lang}/`;
  const other: Lang = lang === 'ja' ? 'en' : 'ja';
  const target = pathname.replace(/^\/(ja|en)(?=\/|$)/, `/${other}`) || `/${other}/`;
  return (
    <Link className="lang-switch" href={target} prefetch={false}>
      {other === 'ja' ? '日本語' : 'English'}
    </Link>
  );
}
