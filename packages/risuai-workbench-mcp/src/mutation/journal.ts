/**
 * Append-only mutation journal read/write helpers.
 * @file packages/risuai-workbench-mcp/src/mutation/journal.ts
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type MutationJournalStatus = 'applied' | 'failed-precondition' | 'failed-validation' | 'previewed' | 'rejected';

export interface MutationJournalEntry {
  affectedFiles: string[];
  afterHash?: string | null;
  beforeHash?: string | null;
  backupFiles?: Array<{ backupPath: string; originalPath: string }>;
  changedFiles?: Array<{ afterHash?: string; beforeHash?: string; operationCount?: number; path: string }>;
  createdAt?: string;
  mutationId: string;
  patchOperations?: unknown[];
  postValidation?: unknown;
  rollbackData?:
    | {
        kind: 'restore-from-backup';
        files: Array<{ backupPath: string; originalPath: string; restoredHash: string }>;
      }
    | {
        expectedCurrentHash: string;
        from: string;
        kind: 'move-back';
        to: string;
      };
  rollbackAvailable?: boolean;
  status: MutationJournalStatus;
  toolName: string;
}

/**
 * appendJournalEntry 함수.
 * journal JSONL 파일에 mutation entry를 append-only로 기록함.
 *
 * @param journalPath - JSONL journal absolute path
 * @param entry - 기록할 mutation journal entry
 */
export async function appendJournalEntry(journalPath: string, entry: MutationJournalEntry): Promise<void> {
  await mkdir(path.dirname(journalPath), { recursive: true });
  const normalizedEntry: MutationJournalEntry = {
    createdAt: new Date().toISOString(),
    rollbackAvailable: false,
    ...entry,
  };
  await appendFile(journalPath, `${JSON.stringify(normalizedEntry)}\n`, 'utf8');
}

/**
 * readJournalEntries 함수.
 * append-only JSONL journal을 순서 보존 entry 배열로 읽음.
 *
 * @param journalPath - JSONL journal absolute path
 * @returns 기록된 mutation journal entries
 */
export async function readJournalEntries(journalPath: string): Promise<MutationJournalEntry[]> {
  let raw: string;
  try {
    raw = await readFile(journalPath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  return raw
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as MutationJournalEntry);
}
