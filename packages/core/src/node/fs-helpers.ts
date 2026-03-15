import fs from 'node:fs';
import path from 'node:path';

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function writeText(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf-8');
}

export function writeBinary(filePath: string, data: Buffer | Uint8Array): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, data);
}

export function uniquePath(dir: string, baseName: string, ext: string): string {
  let candidate = path.join(dir, `${baseName}${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${baseName}_${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}
