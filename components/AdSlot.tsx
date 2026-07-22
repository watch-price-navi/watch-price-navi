'use client';

import { useEffect } from 'react';

const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '';
const slot = process.env.NEXT_PUBLIC_ADSENSE_SLOT || '';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export default function AdSlot() {
  useEffect(() => {
    if (!client || !slot) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      // AdSense not loaded yet — auto ads will fill placements anyway
    }
  }, []);

  if (!client || !slot) return null;
  return (
    <div className="ad-slot">
      <ins
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}
