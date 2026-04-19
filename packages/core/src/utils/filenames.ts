/**
 * 파일 이름으로 사용할 수 없는 특수 문자나 공백을 안전한 문자('_')로 치환
 *
 * @param name - 원본 파일 이름 (캐릭터 이름 등)
 * @param fallback - 이름이 없거나 유효하지 않을 때 사용할 기본값
 * @returns OS 호환 가능한 안전한 파일 이름
 */
export function sanitizeFilename(name: string | null | undefined, fallback = 'unnamed'): string {
  if (!name || typeof name !== 'string') return fallback;
  const cleaned = [...name]
    .map((ch) => (/[<>:"/\\|?*]/.test(ch) || ch.charCodeAt(0) < 32 ? '_' : ch))
    .join('')
    .replace(/\.\./g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .substring(0, 100);
  return cleaned || fallback;
}
