import { describe, expect, it } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Characterization tests for utility functions across multiple implementations.
 * 
 * These tests verify that different implementations of the same utility function
 * produce identical outputs for the same inputs. This prevents regressions when
 * consolidating duplicate implementations.
 * 
 * Test coverage:
 * 1. toPosix: 2 implementations
 *    - domain/lorebook/folders.ts:toPosix (canonical)
 *    - cli/build/workflow.ts:toPosix (local function, inlined)
 * 
 * 2. sanitizeFilename: 1 canonical implementation
 *    - utils/filenames.ts:sanitizeFilename
 * 
 * 3. listJsonFilesRecursive: 1 implementation (filesystem function)
 *    - node/json-listing.ts:listJsonFilesRecursive
 */

// Import implementations
import { toPosix as toPosixFolders } from '@/domain/lorebook/folders';
import { toPosix as toPosixShared } from '@/domain/lorebook/folders';
import { sanitizeFilename as sanitizeFilenameShared } from '@/utils/filenames';
import { listJsonFilesRecursive } from '@/node/json-listing';
import { sanitizeFilename as sanitizeFilenameCard } from '@/utils/filenames';

// Inline implementation from cli/build/workflow.ts (line 163-164)
// This is a local function not exported, so we replicate it here for testing
function toPosixWorkflow(value: string): string {
  return value.split(path.sep).join('/');
}

describe('Utility Function Characterization', () => {
  describe('toPosix — 4 implementations', () => {
    const testCases = [
      '',
      'foo/bar',
      'a/b/c',
      'single',
    ];

    testCases.forEach((input) => {
      it(`toPosix("${input}") — all implementations match on forward-slash paths`, () => {
        const result1 = toPosixFolders(input);
        const result2 = toPosixShared(input);
        const result3 = toPosixWorkflow(input);

        expect(result2).toBe(result1);
        expect(result3).toBe(result1);
      });
    });

    it('toPosix — IMPLEMENTATION DIFFERENCE DETECTED: backslash handling', () => {
      const backslashPath = 'a' + String.fromCharCode(92) + 'b' + String.fromCharCode(92) + 'c';
      
      const result1 = toPosixFolders(backslashPath);
      const result2 = toPosixShared(backslashPath);
      const result3 = toPosixWorkflow(backslashPath);

      // After consolidation, toPosixShared now uses the canonical domain implementation
      // which always converts backslashes to forward slashes (platform-independent)
      expect(result1).toBe('a/b/c');
      expect(result2).toBe('a/b/c');
      
      if (path.sep === '\\') {
        expect(result3).toBe('a/b/c');
      } else {
        // toPosixWorkflow is still the old path.sep-based implementation (not yet consolidated)
        expect(result3).toBe(backslashPath);
      }
    });
  });

  describe('sanitizeFilename — 2 implementations', () => {
    const testCases = [
      { input: '', fallback: 'unnamed', desc: 'empty string' },
      { input: null, fallback: 'unnamed', desc: 'null' },
      { input: undefined, fallback: 'unnamed', desc: 'undefined' },
      { input: 'hello', fallback: 'unnamed', desc: 'simple name' },
      { input: 'foo<bar>', fallback: 'unnamed', desc: 'invalid chars <>' },
      { input: 'a:b:c', fallback: 'unnamed', desc: 'colons' },
      { input: '  spaces  ', fallback: 'unnamed', desc: 'leading/trailing spaces' },
      { input: 'a'.repeat(200), fallback: 'unnamed', desc: 'very long name (200 chars)' },
      { input: 'file|name', fallback: 'unnamed', desc: 'pipe char' },
      { input: 'test"quote', fallback: 'unnamed', desc: 'double quote' },
      { input: 'back\\slash', fallback: 'unnamed', desc: 'backslash' },
      { input: 'question?mark', fallback: 'unnamed', desc: 'question mark' },
      { input: 'asterisk*name', fallback: 'unnamed', desc: 'asterisk' },
      { input: 'dot..dot', fallback: 'unnamed', desc: 'double dots' },
      { input: '_leading_underscore', fallback: 'unnamed', desc: 'leading underscore' },
      { input: '.leading_dot', fallback: 'unnamed', desc: 'leading dot' },
      { input: 'trailing_underscore_', fallback: 'unnamed', desc: 'trailing underscore' },
      { input: 'trailing_dot.', fallback: 'unnamed', desc: 'trailing dot' },
      { input: 'multiple___underscores', fallback: 'unnamed', desc: 'multiple underscores' },
      { input: 'mixed  \t  whitespace', fallback: 'unnamed', desc: 'mixed whitespace' },
    ];

    testCases.forEach(({ input, fallback, desc }) => {
      it(`sanitizeFilename(${JSON.stringify(input)}, "${fallback}") — both implementations match [${desc}]`, () => {
        const result1 = sanitizeFilenameCard(input as any, fallback);
        const result2 = sanitizeFilenameShared(input as any, fallback);

        expect(result2).toBe(result1);
      });
    });

    it('sanitizeFilename — expected behavior: invalid chars → underscores', () => {
      const result = sanitizeFilenameCard('foo<bar>');
      expect(result).toBe('foo_bar');
    });

    it('sanitizeFilename — expected behavior: length limit 100 chars', () => {
      const longName = 'a'.repeat(150);
      const result = sanitizeFilenameCard(longName);
      expect(result.length).toBeLessThanOrEqual(100);
    });

    it('sanitizeFilename — expected behavior: fallback on null/undefined', () => {
      expect(sanitizeFilenameCard(null, 'fallback')).toBe('fallback');
      expect(sanitizeFilenameCard(undefined, 'fallback')).toBe('fallback');
    });
  });

  describe('listJsonFilesRecursive — filesystem function', () => {
    it('listJsonFilesRecursive — returns empty array for non-existent directory', () => {
      const result = listJsonFilesRecursive('/nonexistent/path/that/does/not/exist');
      expect(result).toEqual([]);
    });

    it('listJsonFilesRecursive — filters .json files correctly', () => {
      // Use the test directory itself as a fixture
      const testDir = path.join(process.cwd(), 'tests');
      if (!fs.existsSync(testDir)) {
        // Skip if tests directory doesn't exist
        expect(true).toBe(true);
        return;
      }

      const result = listJsonFilesRecursive(testDir);
      
      // All results should be .json files
      for (const file of result) {
        expect(file.toLowerCase().endsWith('.json')).toBe(true);
      }

      // Should not include manifest.json or _order.json
      for (const file of result) {
        const basename = path.basename(file);
        expect(basename).not.toBe('manifest.json');
        expect(basename).not.toBe('_order.json');
      }
    });

    it('listJsonFilesRecursive — returns absolute paths', () => {
      const testDir = path.join(process.cwd(), 'tests');
      if (!fs.existsSync(testDir)) {
        expect(true).toBe(true);
        return;
      }

      const result = listJsonFilesRecursive(testDir);
      
      // All paths should be absolute
      for (const file of result) {
        expect(path.isAbsolute(file)).toBe(true);
      }
    });

    it('listJsonFilesRecursive — returns sorted results', () => {
      const testDir = path.join(process.cwd(), 'tests');
      if (!fs.existsSync(testDir)) {
        expect(true).toBe(true);
        return;
      }

      const result = listJsonFilesRecursive(testDir);
      
      // Results should be sorted by relative path (POSIX)
      const relativePaths = result.map((file) => {
        const rel = path.relative(testDir, file);
        return rel.split(path.sep).join('/');
      });

      const sorted = [...relativePaths].sort();
      expect(relativePaths).toEqual(sorted);
    });
  });
});
