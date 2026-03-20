import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from '../domain/lorebook/folders';

/** 디렉토리를 재귀적으로 탐색하여 .json 파일 목록을 반환합니다. manifest.json과 _order.json은 제외됩니다.
 * @param rootDir - 탐색을 시작할 루트 디렉토리 경로
 * @returns 발견된 .json 파일들의 절대 경로 배열
 */
export function listJsonFilesRecursive(rootDir: string): string[] {
  if (!isDir(rootDir)) return [];
  const out: string[] = [];

  const walk = (cur: string): void => {
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const abs = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith('.json') &&
        entry.name !== '_order.json' &&
        entry.name !== 'manifest.json'
      ) {
        out.push(abs);
      }
    }
  };

  walk(rootDir);
  out.sort((a, b) => toPosix(path.relative(rootDir, a)).localeCompare(toPosix(path.relative(rootDir, b))));
  return out;
}

/** 디렉토리 내의 .json 파일 목록을 재귀 없이 반환합니다. _order.json은 제외됩니다.
 * @param rootDir - 탐색할 디렉토리 경로
 * @returns 발견된 .json 파일들의 절대 경로 배열
 */
export function listJsonFilesFlat(rootDir: string): string[] {
  if (!isDir(rootDir)) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json') && entry.name !== '_order.json')
    .map((entry) => path.join(rootDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

/** _order.json 파일이 존재하는 경우, 정의된 순서대로 파일 목록을 정렬합니다. 정의되지 않은 파일은 마지막에 사전순으로 추가됩니다.
 * @param dir - _order.json이 위치한 디렉토리
 * @param files - 정렬할 파일들의 절대 경로 배열
 * @returns 정렬된 파일 경로 배열
 */
export function resolveOrderedFiles(dir: string, files: string[]): string[] {
  const orderPath = path.join(dir, '_order.json');
  if (!fs.existsSync(orderPath)) return files;

  let order: unknown;
  try {
    order = readJson(orderPath);
  } catch {
    return files;
  }
  if (!Array.isArray(order)) return files;

  const map = new Map<string, string>();
  for (const file of files) {
    map.set(toPosix(path.relative(dir, file)), file);
  }

  const ordered: string[] = [];
  for (const rel of order) {
    if (typeof rel !== 'string') continue;
    if (map.has(rel)) {
      ordered.push(map.get(rel)!);
      map.delete(rel);
    }
  }

  const rest = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [, abs] of rest) ordered.push(abs);
  return ordered;
}

/** JSON 파일을 읽어 객체로 파싱합니다.
 * @param filePath - 읽을 JSON 파일 경로
 * @returns 파싱된 데이터 객체
 */
export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/** 해당 경로가 디렉토리인지 확인합니다.
 * @param filePath - 확인할 경로
 * @returns 디렉토리 여부
 */
export function isDir(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}
