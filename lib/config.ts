export const SITE = {
  nameJa: '時計価格ナビ',
  nameEn: 'Watch Price Navi',
  taglineJa: '世界の腕時計、いまの最安値をワンクリックで。',
  taglineEn: 'The lowest prices on the world\'s watches, one click away.',
  url: process.env.NEXT_PUBLIC_SITE_URL || 'https://example.com',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  adsenseClient: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || '',
  vcPid: process.env.NEXT_PUBLIC_VC_PID || '',
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '',
};

export function absUrl(path: string): string {
  return `${SITE.url}${SITE.basePath}${path}`;
}
