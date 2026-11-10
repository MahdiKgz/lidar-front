export const QUALITY_LEVELS = {
  balanced: { budget: 750000, spacing: 1.5, label: 'معمولی' },
  high: { budget: 2000000, spacing: 0.75, label: 'بالا' },
  ultra: { budget: 4000000, spacing: 0.35, label: 'بسیار بالا' },
} as const;
export type ViewerQuality = keyof typeof QUALITY_LEVELS;
export type LodNode = { key: string; points: number; pixels: number; bytes: number };
/** COPC nodes are additive: retain ancestors and request progressively finer visible nodes. */
export function selectLod(nodes: LodNode[], spacingRatio: number, budget = 750000, targetSpacing = 1.5): string[] {
  const candidates = nodes.filter(n => n.points > 0 && n.bytes <= 32 * 1024 * 1024 &&
    (n.key === '0-0-0-0' || n.pixels * spacingRatio >= targetSpacing));
  candidates.sort((a,b) => Number(a.key.split('-')[0]) - Number(b.key.split('-')[0]) || b.pixels - a.pixels);
  let count = 0;
  return candidates.filter(node => { if (count + node.points > budget) return false; count += node.points; return true; }).map(n => n.key);
}
