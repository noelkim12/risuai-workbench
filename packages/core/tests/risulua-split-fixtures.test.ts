import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_FIXTURE_MANIFEST,
  type RisuLuaFixtureManifestEntry,
} from './fixtures/risulua/manifest';

interface FixtureValidationIssue {
  id: string;
  relativePath: string;
  code: 'missing-file' | 'invalid-extension' | 'invalid-path' | 'invalid-utf8' | 'hash-mismatch' | 'line-count-mismatch';
  message: string;
}

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

describe('risulua-split fixture contract (focused; full suite has TODO.md-known unrelated failures)', () => {
  it('keeps every manifest entry backed by stable UTF-8 .risulua content', () => {
    const issues = validateFixtureManifest(RISULUA_FIXTURE_MANIFEST);

    expect(issues).toEqual([]);
  });

  it('keeps fixture ids and paths unique for later detector/writer regressions', () => {
    expect(new Set(RISULUA_FIXTURE_MANIFEST.map((entry) => entry.id)).size).toBe(RISULUA_FIXTURE_MANIFEST.length);
    expect(new Set(RISULUA_FIXTURE_MANIFEST.map((entry) => entry.relativePath)).size).toBe(RISULUA_FIXTURE_MANIFEST.length);
  });

  it('documents empty and trailing-newline line-count semantics for stable hashes', () => {
    // Logical line counts normalize CRLF to LF and do not count a final trailing newline as an extra line.
    expect(countLogicalLines('')).toBe(0);
    expect(countLogicalLines('\n')).toBe(1);
    expect(countLogicalLines('a\n')).toBe(1);
    expect(countLogicalLines('a\nb')).toBe(2);
  });

  it('detects a missing fixture instead of silently skipping it', () => {
    const issues = validateFixtureManifest([
      {
        id: 'missing_fixture_regression',
        relativePath: 'synthetic/__missing__.risulua',
        expectedProfile: 'unknown',
        expectedStrategy: 'report-only',
        sha256: '0'.repeat(64),
        lineCount: 0,
        riskFlags: ['missing-fixture-regression'],
      },
    ]);

    expect(issues).toEqual([
      expect.objectContaining({
        id: 'missing_fixture_regression',
        relativePath: 'synthetic/__missing__.risulua',
        code: 'missing-file',
      }),
    ]);
  });
});

function validateFixtureManifest(entries: RisuLuaFixtureManifestEntry[]): FixtureValidationIssue[] {
  const issues: FixtureValidationIssue[] = [];

  for (const entry of entries) {
    if (!isSafePosixRisuLuaPath(entry.relativePath)) {
      issues.push({
        id: entry.id,
        relativePath: entry.relativePath,
        code: entry.relativePath.endsWith('.risulua') ? 'invalid-path' : 'invalid-extension',
        message: 'Fixture path must be a safe POSIX-relative .risulua path.',
      });
      continue;
    }

    const absolutePath = path.join(fixtureRoot, ...entry.relativePath.split('/'));
    if (!fs.existsSync(absolutePath)) {
      issues.push({
        id: entry.id,
        relativePath: entry.relativePath,
        code: 'missing-file',
        message: `Fixture file does not exist: ${entry.relativePath}`,
      });
      continue;
    }

    const buffer = fs.readFileSync(absolutePath);
    const decoded = decodeUtf8(buffer);
    if (decoded === null) {
      issues.push({
        id: entry.id,
        relativePath: entry.relativePath,
        code: 'invalid-utf8',
        message: `Fixture file is not valid UTF-8: ${entry.relativePath}`,
      });
      continue;
    }

    const normalized = normalizeLineEndings(decoded);
    const actualHash = sha256Utf8(normalized);
    if (actualHash !== entry.sha256) {
      issues.push({
        id: entry.id,
        relativePath: entry.relativePath,
        code: 'hash-mismatch',
        message: `Expected ${entry.sha256}, got ${actualHash}.`,
      });
    }

    const actualLineCount = countLogicalLines(normalized);
    if (actualLineCount !== entry.lineCount) {
      issues.push({
        id: entry.id,
        relativePath: entry.relativePath,
        code: 'line-count-mismatch',
        message: `Expected ${entry.lineCount} logical lines, got ${actualLineCount}.`,
      });
    }
  }

  return issues;
}

function isSafePosixRisuLuaPath(relativePath: string): boolean {
  return relativePath.endsWith('.risulua')
    && !path.isAbsolute(relativePath)
    && !relativePath.includes('\\')
    && relativePath.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function decodeUtf8(buffer: Buffer): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function normalizeLineEndings(source: string): string {
  return source.replace(/\r\n/g, '\n');
}

function sha256Utf8(source: string): string {
  return crypto.createHash('sha256').update(source, 'utf8').digest('hex');
}

function countLogicalLines(source: string): number {
  if (source.length === 0) {
    return 0;
  }
  return source.replace(/\n$/, '').split('\n').length;
}
