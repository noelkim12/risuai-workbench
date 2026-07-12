import { createHash } from 'node:crypto';
import fs from 'node:fs';

/**
 * sha256Hex 함수.
 * RisuAI hasher와 동일한 SHA-256 lowercase hex를 계산한다.
 */
export function sha256Hex(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

interface HashCacheEntry {
  readonly mtimeMs: number;
  readonly size: number;
  readonly hash: string;
}

/**
 * AssetHashCache 클래스.
 * 경로+mtimeMs+size 키로 파일 해시를 캐시한다.
 */
export class AssetHashCache {
  private readonly entries = new Map<string, HashCacheEntry>();

  hashFile(fsPath: string): string {
    const stat = fs.statSync(fsPath);
    const hit = this.entries.get(fsPath);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) {
      return hit.hash;
    }
    const hash = sha256Hex(fs.readFileSync(fsPath));
    this.entries.set(fsPath, { mtimeMs: stat.mtimeMs, size: stat.size, hash });
    return hash;
  }
}
