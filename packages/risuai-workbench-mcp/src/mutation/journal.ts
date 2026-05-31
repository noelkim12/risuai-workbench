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
  changedFilesSummary?: {
    count: number;
    omitted: number;
    paths: string[];
  };
  createdAt?: string;
  diagnosticsSummary?: {
    count: number;
    maxSeverity?: string;
    ruleIds: string[];
  };
  mutationId: string;
  operationSummary?: {
    count: number;
    omitted: number;
    operations: Array<Record<string, unknown>>;
  };
  /** @deprecated Journal entries now persist operationSummary instead of raw patch payloads. */
  patchOperations?: unknown[];
  postValidation?: { diagnosticsCount?: number; status?: string } | unknown;
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

const MAX_JOURNAL_PATHS = 25;
const MAX_JOURNAL_OPERATION_SUMMARIES = 25;

/**
 * appendJournalEntry 함수.
 * journal JSONL 파일에 mutation entry를 append-only로 기록함.
 *
 * @param journalPath - JSONL journal absolute path
 * @param entry - 기록할 mutation journal entry
 */
export async function appendJournalEntry(journalPath: string, entry: MutationJournalEntry): Promise<void> {
  await mkdir(path.dirname(journalPath), { recursive: true });
  const normalizedEntry = compactJournalEntry({
    createdAt: new Date().toISOString(),
    rollbackAvailable: false,
    ...entry,
  });
  await appendFile(journalPath, `${JSON.stringify(normalizedEntry)}\n`, 'utf8');
}

/**
 * compactJournalEntry 함수.
 * rollback에 필요한 inverse state는 유지하되, journal을 비대하게 만드는 raw patch payload와
 * verbose diagnostics를 compact summary로 대체함.
 *
 * @param entry - 정규화 전 journal entry
 * @returns compact journal entry
 */
function compactJournalEntry(entry: MutationJournalEntry): MutationJournalEntry {
  const compacted: MutationJournalEntry = {
    ...entry,
    affectedFiles: compactPaths(entry.affectedFiles),
    changedFiles: entry.changedFiles?.slice(0, MAX_JOURNAL_PATHS),
    changedFilesSummary: entry.changedFiles ? summarizeChangedFiles(entry.changedFiles) : undefined,
    diagnosticsSummary: summarizeDiagnostics(entry.postValidation),
    operationSummary: summarizeOperations(entry.patchOperations),
    patchOperations: undefined,
    postValidation: summarizePostValidation(entry.postValidation),
  };

  return removeUndefinedFields(compacted) as unknown as MutationJournalEntry;
}

function compactPaths(paths: readonly string[]): string[] {
  return paths.slice(0, MAX_JOURNAL_PATHS);
}

function summarizeChangedFiles(changedFiles: NonNullable<MutationJournalEntry['changedFiles']>): NonNullable<MutationJournalEntry['changedFilesSummary']> {
  return {
    count: changedFiles.length,
    omitted: Math.max(0, changedFiles.length - MAX_JOURNAL_PATHS),
    paths: changedFiles.slice(0, MAX_JOURNAL_PATHS).map((file) => file.path),
  };
}

function summarizeOperations(patchOperations: unknown[] | undefined): MutationJournalEntry['operationSummary'] {
  if (!patchOperations) return undefined;
  const operations = patchOperations.slice(0, MAX_JOURNAL_OPERATION_SUMMARIES).map(summarizeOperation);
  return {
    count: patchOperations.length,
    omitted: Math.max(0, patchOperations.length - MAX_JOURNAL_OPERATION_SUMMARIES),
    operations,
  };
}

function summarizeOperation(operation: unknown): Record<string, unknown> {
  if (!operation || typeof operation !== 'object' || Array.isArray(operation)) return { kind: typeof operation };
  const source = operation as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of ['kind', 'path', 'from', 'to', 'orderPath', 'key', 'expectedHash'] as const) {
    if (typeof source[key] === 'string') summary[key] = source[key];
  }
  if (typeof source.index === 'number') summary.index = source.index;
  if (typeof source.toIndex === 'number') summary.toIndex = source.toIndex;
  return Object.keys(summary).length > 0 ? summary : { kind: 'object' };
}

function summarizePostValidation(postValidation: unknown): MutationJournalEntry['postValidation'] {
  if (!postValidation || typeof postValidation !== 'object' || Array.isArray(postValidation)) return postValidation;
  const source = postValidation as { diagnostics?: unknown[]; status?: unknown };
  return {
    diagnosticsCount: Array.isArray(source.diagnostics) ? source.diagnostics.length : undefined,
    status: typeof source.status === 'string' ? source.status : undefined,
  };
}

function summarizeDiagnostics(postValidation: unknown): MutationJournalEntry['diagnosticsSummary'] {
  if (!postValidation || typeof postValidation !== 'object' || Array.isArray(postValidation)) return undefined;
  const diagnostics = (postValidation as { diagnostics?: unknown }).diagnostics;
  if (!Array.isArray(diagnostics)) return undefined;
  const ruleIds = diagnostics.flatMap((diagnostic) => {
    if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) return [];
    const ruleId = (diagnostic as { ruleId?: unknown }).ruleId;
    return typeof ruleId === 'string' ? [ruleId] : [];
  });
  const severities = diagnostics.flatMap((diagnostic) => {
    if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) return [];
    const severity = (diagnostic as { severity?: unknown }).severity;
    return typeof severity === 'string' ? [severity] : [];
  });
  return {
    count: diagnostics.length,
    maxSeverity: severities.includes('error') ? 'error' : severities.includes('warning') ? 'warning' : severities[0],
    ruleIds: [...new Set(ruleIds)].slice(0, MAX_JOURNAL_PATHS),
  };
}

function removeUndefinedFields(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined));
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
