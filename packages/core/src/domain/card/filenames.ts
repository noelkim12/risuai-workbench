export function sanitizeFilename(
  name: string | null | undefined,
  fallback = 'unnamed',
): string {
  if (!name || typeof name !== 'string') return fallback;
  const cleaned = [...name]
    .map((ch) =>
      /[<>:"/\\|?*]/.test(ch) || ch.charCodeAt(0) < 32 ? '_' : ch,
    )
    .join('')
    .replace(/\.\./g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .substring(0, 100);
  return cleaned || fallback;
}
