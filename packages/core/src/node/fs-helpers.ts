import fs from 'node:fs';
import path from 'node:path';

/** 디렉토리가 없으면 재귀적으로 생성합니다.
 * @param dirPath - 생성할 디렉토리 경로
 */
export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

/** 데이터를 JSON 형식으로 파일에 저장합니다. 부모 디렉토리가 없으면 생성합니다.
 * @param filePath - 저장할 파일 경로
 * @param data - 저장할 데이터 객체
 */
export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/** 텍스트 내용을 파일에 저장합니다. 부모 디렉토리가 없으면 생성합니다.
 * @param filePath - 저장할 파일 경로
 * @param content - 저장할 텍스트 내용
 */
export function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

/** 바이너리 데이터를 파일에 저장합니다. 부모 디렉토리가 없으면 생성합니다.
 * @param filePath - 저장할 파일 경로
 * @param data - 저장할 바이너리 데이터
 */
export function writeBinary(filePath: string, data: Buffer | Uint8Array): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
}

/** 파일이 이미 존재하면 접미사를 붙여 고유한 파일 경로를 반환합니다.
 * @param dir - 파일이 위치할 디렉토리
 * @param baseName - 파일 이름 (확장자 제외)
 * @param ext - 파일 확장자 (점 포함)
 * @returns 고유한 파일 경로
 */
export function uniquePath(dir: string, baseName: string, ext: string): string {
  let candidate = path.join(dir, `${baseName}${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}_${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}
