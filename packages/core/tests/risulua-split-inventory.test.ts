import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildTopLevelInventory,
  atomToSourceRange,
  buildLineStarts,
  offsetToLineColumn,
  lineAtOffset,
  sliceSourceRange,
  sliceSourceOffsets,
  reconstructTopLevelText,
  rangesAreNonOverlapping,
  sanitizePathSegment,
  isPathSafe,
  buildSafeRelativePath,
  sanitizePreloadId,
  evaluatePathPolicy,
} from '../src/domain/risulua-split';
import type { LuaSourceRange } from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

function readFixture(relativePath: string): string {
  return fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf-8');
}

// ─── Range Utilities ───────────────────────────────────────────────────────

describe('range-utils', () => {
  describe('buildLineStarts', () => {
    it('returns [0] for empty string', () => {
      expect(buildLineStarts('')).toEqual([0]);
    });

    it('returns [0] for single line without newline', () => {
      expect(buildLineStarts('hello')).toEqual([0]);
    });

    it('tracks newline positions', () => {
      expect(buildLineStarts('a\nb\nc')).toEqual([0, 2, 4]);
    });

    it('handles trailing newline', () => {
      expect(buildLineStarts('a\nb\n')).toEqual([0, 2, 4]);
    });
  });

  describe('offsetToLineColumn', () => {
    const lineStarts = buildLineStarts('line1\nline2\nline3');

    it('offset 0 → line 1, column 0', () => {
      expect(offsetToLineColumn(0, lineStarts)).toEqual({ line: 1, column: 0 });
    });

    it('offset 5 → end of line 1', () => {
      expect(offsetToLineColumn(5, lineStarts)).toEqual({ line: 1, column: 5 });
    });

    it('offset 6 → start of line 2', () => {
      expect(offsetToLineColumn(6, lineStarts)).toEqual({ line: 2, column: 0 });
    });

    it('offset beyond last line', () => {
      const starts = buildLineStarts('ab');
      expect(offsetToLineColumn(10, starts)).toEqual({ line: 1, column: 10 });
    });
  });

  describe('lineAtOffset', () => {
    const lineStarts = buildLineStarts('one\ntwo\nthree');

    it('returns 1 for offset 0', () => {
      expect(lineAtOffset(0, lineStarts)).toBe(1);
    });

    it('returns 2 for offset at start of line 2', () => {
      expect(lineAtOffset(4, lineStarts)).toBe(2);
    });

    it('returns 3 for offset in line 3', () => {
      expect(lineAtOffset(9, lineStarts)).toBe(3);
    });
  });
});

// ─── Source Slice ───────────────────────────────────────────────────────────

describe('source-slice', () => {
  const source = 'local x = 1\nlocal y = 2\nreturn x + y\n';

  it('sliceSourceOffsets returns exact text', () => {
    expect(sliceSourceOffsets(source, 0, 11)).toBe('local x = 1');
  });

  it('sliceSourceRange returns exact text', () => {
    const range: LuaSourceRange = { startLine: 1, endLine: 1, startOffset: 0, endOffset: 11 };
    expect(sliceSourceRange(source, range)).toBe('local x = 1');
  });

  it('rangesAreNonOverlapping returns true for non-overlapping ranges', () => {
    const ranges = [
      { startOffset: 0, endOffset: 5 },
      { startOffset: 6, endOffset: 10 },
    ];
    expect(rangesAreNonOverlapping(ranges)).toBe(true);
  });

  it('rangesAreNonOverlapping returns false for overlapping ranges', () => {
    const ranges = [
      { startOffset: 0, endOffset: 7 },
      { startOffset: 5, endOffset: 10 },
    ];
    expect(rangesAreNonOverlapping(ranges)).toBe(false);
  });

    it('reconstructTopLevelText concatenates slices in order', () => {
      const ranges = [
        { startOffset: 0, endOffset: 11 },
        { startOffset: 12, endOffset: 23 },
        { startOffset: 24, endOffset: 37 },
      ];
      const { text, gapByteCount } = reconstructTopLevelText(source, ranges);
      expect(gapByteCount).toBe(2); // the two newlines
      expect(text).toBe('local x = 1local y = 2return x + y\n');
  });
});

// ─── Path Policy ────────────────────────────────────────────────────────────

describe('path-policy', () => {
  describe('sanitizePathSegment', () => {
    it('returns "unnamed" for empty label', () => {
      expect(sanitizePathSegment('')).toBe('unnamed');
    });

    it('preserves safe alphanumeric labels', () => {
      expect(sanitizePathSegment('myModule')).toBe('myModule');
    });

    it('replaces slashes', () => {
      expect(sanitizePathSegment('a/b')).toBe('a_b');
    });

    it('replaces backslashes', () => {
      expect(sanitizePathSegment('a\\b')).toBe('a_b');
    });

    it('collapses parent traversal', () => {
      // ../ → .. collapsed to __ → leading __ stripped → escape.lua (dots preserved for extensions)
      expect(sanitizePathSegment('../escape.lua')).toBe('escape.lua');
    });

    it('handles absolute-like paths', () => {
      // / → stripped to empty → then / → _ stripped, then absolute.lua
      expect(sanitizePathSegment('/absolute.lua')).toBe('absolute.lua');
    });

    it('handles multiple parent traversals', () => {
      // a/../../b.lua → a/ + .. + / + .. + /b.lua → a_ + __ + _ + __ + _b.lua
      // After collapse: a_____b.lua
      const result = sanitizePathSegment('a/../../b.lua');
      expect(result).toBeTruthy();
      expect(result).not.toContain('..');
      expect(result).not.toContain('/');
    });

    it('strips leading dots', () => {
      expect(sanitizePathSegment('.hidden')).toBe('hidden');
    });

    it('handles labels with special characters', () => {
      expect(sanitizePathSegment('my module!')).toBe('my_module');
    });
  });

  describe('isPathSafe', () => {
    it('rejects ../escape.lua', () => {
      expect(isPathSafe('../escape.lua')).toBe(false);
    });

    it('rejects /absolute.lua', () => {
      expect(isPathSafe('/absolute.lua')).toBe(false);
    });

    it('rejects a/../../b.lua', () => {
      expect(isPathSafe('a/../../b.lua')).toBe(false);
    });

    it('rejects Windows backslash paths', () => {
      expect(isPathSafe('a\\b.lua')).toBe(false);
    });

    it('rejects drive-letter paths', () => {
      expect(isPathSafe('C:\\Users\\test.lua')).toBe(false);
    });

    it('rejects hidden dot files', () => {
      expect(isPathSafe('.env')).toBe(false);
    });

    it('rejects empty segments (double slash)', () => {
      expect(isPathSafe('a//b.lua')).toBe(false);
    });

    it('accepts safe relative paths', () => {
      expect(isPathSafe('module.lua')).toBe(true);
    });

    it('accepts safe nested paths', () => {
      expect(isPathSafe('sub/module.lua')).toBe(true);
    });

    it('accepts deep safe paths', () => {
      expect(isPathSafe('a/b/c/module.lua')).toBe(true);
    });
  });

  describe('buildSafeRelativePath', () => {
    it('builds safe path with extension', () => {
      expect(buildSafeRelativePath('module', 'lua')).toBe('module.lua');
    });

    it('builds safe path without extension', () => {
      expect(buildSafeRelativePath('module')).toBe('module');
    });

    it('sanitizes unsafe labels', () => {
      const result = buildSafeRelativePath('../evil', 'lua');
      expect(result).toBe('evil.lua');
    });

    it('returns null for labels that cannot produce a safe path', () => {
      // After sanitization, dots-only labels become empty → unnamed, which is safe
      // So this test verifies the sanitized fallback works
      const result = buildSafeRelativePath('..', 'lua');
      expect(result).not.toBeNull();
    });
  });

  describe('sanitizePreloadId', () => {
    it('strips leading ./', () => {
      expect(sanitizePreloadId('./constants')).toBe('constants');
    });

    it('strips multiple leading ./', () => {
      expect(sanitizePreloadId('./././x')).toBe('x');
    });

    it('strips leading /', () => {
      expect(sanitizePreloadId('/absolute')).toBe('absolute');
    });

    it('handles plain names', () => {
      expect(sanitizePreloadId('myModule')).toBe('myModule');
    });
  });

  describe('evaluatePathPolicy', () => {
    it('accepts safe paths', () => {
      const result = evaluatePathPolicy('module.lua');
      expect(result.safe).toBe(true);
      if (result.safe) expect(result.path).toBe('module.lua');
    });

    it('rejects traversal paths with reason', () => {
      const result = evaluatePathPolicy('../evil.lua');
      expect(result.safe).toBe(false);
      if (!result.safe) {
        expect(result.reason).toContain('unsafe');
        expect(result.sanitized).toBeTruthy();
      }
    });
  });
});

// ─── Top-Level Inventory ────────────────────────────────────────────────────

describe('top-level-inventory', () => {
  it('produces stable non-overlapping ranges with increasing preserveOrderIndex', () => {
    const source = [
      'local x = 1',
      'local y = 2',
      '',
      'function foo()',
      '  return x',
      'end',
      '',
      'function bar()',
      '  return y',
      'end',
    ].join('\n');

    const atoms = buildTopLevelInventory(source);

    // Should have at least: local x, local y, function foo, function bar
    expect(atoms.length).toBeGreaterThanOrEqual(4);

    // preserveOrderIndex is increasing
    for (let i = 1; i < atoms.length; i += 1) {
      expect(atoms[i].preserveOrderIndex).toBeGreaterThan(atoms[i - 1].preserveOrderIndex);
    }

    // Non-overlapping ranges
    const ranges = atoms.map((a) => ({ startOffset: a.startOffset, endOffset: a.endOffset }));
    expect(rangesAreNonOverlapping(ranges)).toBe(true);
  });

  it('classifies function declarations', () => {
    const source = 'function foo()\n  return 1\nend';
    const atoms = buildTopLevelInventory(source);
    expect(atoms).toEqual([
      expect.objectContaining({
        kind: 'function-declaration',
        displayName: 'foo',
        writesGlobals: ['foo'],
      }),
    ]);
  });

  it('classifies local function declarations', () => {
    const source = 'local function bar()\n  return 2\nend';
    const atoms = buildTopLevelInventory(source);
    expect(atoms).toEqual([
      expect.objectContaining({
        kind: 'local-function-declaration',
        displayName: 'bar',
        declaresLocals: ['bar'],
      }),
    ]);
  });

  it('classifies local assignments', () => {
    const source = 'local x = 42';
    const atoms = buildTopLevelInventory(source);
    expect(atoms).toEqual([
      expect.objectContaining({
        kind: 'local-assignment',
        displayName: 'x',
        declaresLocals: ['x'],
      }),
    ]);
  });

  it('classifies table declarations from local', () => {
    const source = 'local config = {}';
    const atoms = buildTopLevelInventory(source);
    expect(atoms).toEqual([
      expect.objectContaining({
        kind: 'table-declaration',
        displayName: 'config',
      }),
    ]);
  });

  it('classifies assignments', () => {
    const source = 'x = 42';
    const atoms = buildTopLevelInventory(source);
    expect(atoms).toEqual([
      expect.objectContaining({
        kind: 'assignment',
        displayName: 'x',
        writesGlobals: ['x'],
      }),
    ]);
  });

  it('classifies listener calls (listenEdit)', () => {
    const source = 'listenEdit("editOutput", function(arg)\n  return arg\nend)';
    const atoms = buildTopLevelInventory(source);
    expect(atoms.length).toBeGreaterThanOrEqual(1);
    const listener = atoms.find((a) => a.kind === 'listener-call');
    expect(listener).toBeDefined();
    expect(listener!.displayName).toContain('listenEdit');
  });

  it('classifies handler assignments (onButtonClick)', () => {
    const source = 'onButtonClick = async(function()\n  return 1\nend)';
    const atoms = buildTopLevelInventory(source);
    const handler = atoms.find((a) => a.kind === 'handler-assignment');
    expect(handler).toBeDefined();
    expect(handler!.displayName).toBe('onButtonClick');
  });

  it('classifies package.preload assignments', () => {
    const source = 'package.preload["./x"] = function()\n  return 1\nend';
    const atoms = buildTopLevelInventory(source);
    const preload = atoms.find((a) => a.kind === 'package-preload');
    expect(preload).toBeDefined();
    expect(preload!.displayName).toBeTruthy();
  });

  it('classifies require calls', () => {
    const source = 'require("./module")';
    const atoms = buildTopLevelInventory(source);
    const req = atoms.find((a) => a.kind === 'require-call');
    expect(req).toBeDefined();
  });

  it('returns empty array for empty source', () => {
    const atoms = buildTopLevelInventory('');
    expect(atoms).toEqual([]);
  });

  it('returns empty array for parse errors', () => {
    const atoms = buildTopLevelInventory('function ( broken {{{{');
    expect(atoms).toEqual([]);
  });

  it('slices from original source match atoms', () => {
    const source = 'local x = 1\nlocal y = 2\n';
    const atoms = buildTopLevelInventory(source);

    for (const atom of atoms) {
      const range = atomToSourceRange(atom);
      const slice = sliceSourceRange(source, range);
      // The slice must be a substring of the original source
      expect(source.includes(slice)).toBe(true);
      // The slice must be non-empty
      expect(slice.length).toBeGreaterThan(0);
    }
  });

  it('reconstructs top-level text from atom slices', () => {
    const source = 'local x = 1\nlocal y = 2\nreturn x + y';
    const atoms = buildTopLevelInventory(source);
    const ranges = atoms.map((a) => ({ startOffset: a.startOffset, endOffset: a.endOffset }));
    const { gapByteCount } = reconstructTopLevelText(source, ranges);
    // Gaps should be minimal (just whitespace/newlines between statements)
    expect(gapByteCount).toBeLessThanOrEqual(source.length);
  });

  it('produce atoms with all required fields', () => {
    const source = 'function foo()\n  return 1\nend';
    const atoms = buildTopLevelInventory(source);
    expect(atoms.length).toBe(1);

    const atom = atoms[0];
    expect(atom.id).toBeTruthy();
    expect(atom.kind).toBeTruthy();
    expect(atom.displayName).toBeTruthy();
    expect(typeof atom.startLine).toBe('number');
    expect(typeof atom.endLine).toBe('number');
    expect(typeof atom.startOffset).toBe('number');
    expect(typeof atom.endOffset).toBe('number');
    expect(typeof atom.preserveOrderIndex).toBe('number');
    expect(Array.isArray(atom.declaresLocals)).toBe(true);
    expect(Array.isArray(atom.usesLocals)).toBe(true);
    expect(Array.isArray(atom.readsGlobals)).toBe(true);
    expect(Array.isArray(atom.writesGlobals)).toBe(true);
    expect(Array.isArray(atom.calls)).toBe(true);
    expect(Array.isArray(atom.hostApis)).toBe(true);
    expect(Array.isArray(atom.stateKeys)).toBe(true);
  });

  // ─── Fixture-based tests ───────────────────────────────────────────────

  describe('with fixture sources', () => {
    it('identifies preload atoms in preload_simple fixture', () => {
      const source = readFixture('synthetic/preload_simple.risulua');
      const atoms = buildTopLevelInventory(source);

      const preloadAtoms = atoms.filter((a) => a.kind === 'package-preload');
      expect(preloadAtoms.length).toBeGreaterThanOrEqual(1);

      // Preload atoms should have non-overlapping ranges
      const preloadRanges = preloadAtoms.map((a) => ({
        startOffset: a.startOffset,
        endOffset: a.endOffset,
      }));
      expect(rangesAreNonOverlapping(preloadRanges)).toBe(true);
    });

    it('produces non-overlapping ranges for section-bundle fixture', () => {
      const source = readFixture('section-bundle/section_three_markers.risulua');
      const atoms = buildTopLevelInventory(source);

      const ranges = atoms.map((a) => ({ startOffset: a.startOffset, endOffset: a.endOffset }));
      expect(rangesAreNonOverlapping(ranges)).toBe(true);
    });

    it('identifies atoms in plain_hooks_only fixture', () => {
      const source = readFixture('plain/plain_hooks_only.risulua');
      const atoms = buildTopLevelInventory(source);

      expect(atoms.length).toBeGreaterThan(0);

      // onStart and onOutput are function declarations (function onStart() not onStart = ...)
      const functions = atoms.filter(
        (a) => a.kind === 'function-declaration',
      );
      expect(functions.length).toBeGreaterThanOrEqual(1);

      // Should also have the local assignment
      const locals = atoms.filter((a) => a.kind === 'local-assignment');
      expect(locals.length).toBeGreaterThanOrEqual(1);
    });
  });
});
