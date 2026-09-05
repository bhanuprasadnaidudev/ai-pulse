const MAJOR_KEYWORDS = [
  'announcing',
  'announces',
  'launches',
  'launch',
  'unveils',
  'introducing',
  'releases',
  'release of',
  'now available',
];

/** Instant, free, no LLM call — source must be Tier 1 and the title must read like a release. */
export function classifyMajor(title: string, sourceTier: number): boolean {
  if (sourceTier !== 1) return false;
  const t = title.toLowerCase();
  return MAJOR_KEYWORDS.some((k) => t.includes(k));
}
