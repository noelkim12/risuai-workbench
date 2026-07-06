/**
 * Node.js 파일시스템 기반 lorebook name 후보 스캐너.
 * @file packages/core/src/node/lorebook-names.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  extractLorebookNameCandidates as extractLorebookNameCandidatesFromSources,
  type LorebookNameCandidate,
  type LorebookNameCandidateSource,
} from '../domain/analyze/lorebook-names';

const LOREBOOK_DIRECTORIES = ['lorebooks', 'lorebook'] as const;

/** 워크스페이스 root의 lorebooks/·lorebook/를 재귀 스캔해 name 후보를 반환함. */
export function extractLorebookNameCandidates(rootDir: string): LorebookNameCandidate[] {
  return extractLorebookNameCandidatesFromSources(readLorebookNameCandidateSources(rootDir));
}

function readLorebookNameCandidateSources(rootDir: string): LorebookNameCandidateSource[] {
  const files: string[] = [];
  for (const dirName of LOREBOOK_DIRECTORIES) {
    const dirPath = path.join(rootDir, dirName);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      files.push(...walkLorebookFiles(dirPath));
    }
  }

  return files.map((filePath) => {
    const relativePath = toPosix(path.relative(rootDir, filePath));
    return {
      filePath: relativePath,
      folderPath: toPosix(path.dirname(relativePath)),
      text: fs.readFileSync(filePath, 'utf-8'),
    };
  });
}

function walkLorebookFiles(dirPath: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) files.push(...walkLorebookFiles(entryPath));
    if (entry.isFile() && entry.name.endsWith('.risulorebook')) files.push(entryPath);
  }
  return files.sort((left, right) => toPosix(left).localeCompare(toPosix(right)));
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
