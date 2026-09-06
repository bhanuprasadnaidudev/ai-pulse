/** Avatar fallback for accounts with no Google picture (and for
 * email/password signups, which never have one at all).
 *
 * "Ada Lovelace" -> "AL", "cher" -> "C", "" -> "?" -- first and last word
 * rather than the first two, so "Ada B. Lovelace" still reads as "AL". */
export function initialsFrom(name: string | null | undefined): string {
  const parts = (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
