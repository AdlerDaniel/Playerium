/** Clean duplicated metadata values without deduplicating individual words. */
export function normalizeTrackTitle(value) {
  let title = String(value ?? '').trim();
  const values = title.split(/[\0\r\n]+/).map(s => s.trim()).filter(Boolean);
  if (values.length > 1) {
    title = [...new Set(values)].join(' / ');
  } else title = values[0] || '';
  const key = s => s.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const parts = title.split(/\s+[-–—|/]\s+|\s*;\s*/).map(s => s.trim()).filter(Boolean);
  if (parts.length > 1 && parts.every(s => key(s) === key(parts[0]))) return parts[0];
  const words = title.split(/\s+/);
  // Only collapse a whole repeated phrase of at least three words.
  // Single-word repetitions such as "Bye Bye Bye" remain valid song titles.
  for (let size = 3; size <= words.length / 2; size++) {
    if (words.length % size) continue;
    const phrase = words.slice(0, size).join(' ');
    if (Array.from({ length: words.length / size }, (_, i) =>
      key(words.slice(i * size, (i + 1) * size).join(' '))).every(s => s === key(phrase))) return phrase;
  }
  return title;
}
