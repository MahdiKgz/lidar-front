import proj4 from 'proj4';

/** Use only the horizontal CRS for map placement; do not invent a vertical datum. */
export function horizontalWkt(wkt: string): string {
  if (!/^\s*(COMPD_CS|COMPOUNDCRS)\s*\[/i.test(wkt)) return wkt;
  const match = /\b(PROJCS|PROJCRS|GEOGCS|GEOGCRS|GEODCRS)\s*\[/i.exec(wkt);
  if (!match) throw new Error('سیستم مختصات افقی در WKT ترکیبی پیدا نشد.');
  let depth = 0, quoted = false;
  for (let i = match.index; i < wkt.length; i++) {
    if (wkt[i] === '"') { if (quoted && wkt[i + 1] === '"') { i++; continue; } quoted = !quoted; }
    if (quoted) continue;
    if (wkt[i] === '[') depth++;
    if (wkt[i] === ']' && --depth === 0) return wkt.slice(match.index, i + 1);
  }
  throw new Error('ساختار WKT ناقص است.');
}
export function mapProjection(wkt: string) {
  try { return proj4(horizontalWkt(wkt), 'EPSG:4326'); }
  catch { throw new Error('سیستم مختصات افقی فایل برای نمایش روی نقشه قابل خواندن نیست.'); }
}
export const viewerError = (error: unknown) => error instanceof Error ? error.message : typeof error === 'string' ? error : 'خواندن ابرنقاط ناموفق بود.';
