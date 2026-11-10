/** Up to two initials of a name or e-mail ("Maykon Meneghel" → "MM", "ana@x.org" → "A"). */
export function initials(text: string): string {
  const base = text.includes('@') ? (text.split('@')[0] ?? '') : text;
  const words = base.split(/[\s._-]+/).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '?';
  const last = words.length > 1 ? (words[words.length - 1] ?? '') : '';
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase();
}
