import fs from 'node:fs';
import path from 'node:path';
import { toPosix } from '../domain/lorebook/folders';

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

export function listJsonFilesFlat(rootDir: string): string[] {
  if (!isDir(rootDir)) return [];
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json') && entry.name !== '_order.json')
    .map((entry) => path.join(rootDir, entry.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

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

export function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function isDir(filePath: string): boolean {
  return fs.existsSync(filePath) && fs.statSync(filePath).isDirectory();
}
