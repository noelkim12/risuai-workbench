/**
 * Pure helpers for resolving pack output format, filename, and collision handling.
 * @file packages/vscode/src/artifact-browser/packArtifactPlanner.ts
 */

/** Resolved pack format: CLI flags, file extension, and a human label. */
export interface PackFormatResolution {
  formatArgs: string[];
  ext: string;
  label: string;
}

/**
 * resolvePackFormat 함수.
 * root marker의 sourceFormat을 pack CLI `--format` 플래그로 매핑함.
 * 모듈은 항상 risum, 캐릭터는 png만 png, 그 외(charx/json/scaffold/unknown)는 charx로 fallback.
 */
export function resolvePackFormat(input: {
  artifactKind: 'character' | 'module';
  sourceFormat: string;
}): PackFormatResolution {
  if (input.artifactKind === 'module') {
    return { formatArgs: ['--format', 'module', '--format', 'risum'], ext: '.risum', label: 'risum' };
  }
  if (input.sourceFormat === 'png') {
    return { formatArgs: ['--format', 'png'], ext: '.png', label: 'png' };
  }
  return { formatArgs: ['--format', 'charx'], ext: '.charx', label: 'charx' };
}

const RESERVED_FILENAME_CHARS = /[\\/:*?"<>|]/g;
const TRAILING_DOTS_SPACES = /[.\s]+$/;

/**
 * sanitizePackFilename 함수.
 * marker name을 파일시스템 안전 파일명으로 변환함 (확장자 제외).
 */
export function sanitizePackFilename(name: string, fallback = 'artifact'): string {
  const cleaned = name.replace(RESERVED_FILENAME_CHARS, '_').replace(TRAILING_DOTS_SPACES, '').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * formatCompactTimestamp 함수.
 * 로컬 시간 기준 YYYYMMDDHHMMSS (14자리, zero-padded) 문자열 생성.
 */
export function formatCompactTimestamp(date: Date): string {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

/**
 * pickCollisionTimestampMs 함수.
 * 유효한 birthtime(생성시각)을 우선 사용하고, 무효(0/NaN)하면 mtime으로 fallback.
 */
export function pickCollisionTimestampMs(birthtimeMs: number, mtimeMs: number): number {
  return Number.isFinite(birthtimeMs) && birthtimeMs > 0 ? birthtimeMs : mtimeMs;
}
