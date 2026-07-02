/**
 * Pack artifact planner boundary tests.
 * @file packages/vscode/tests/e2e/pack-artifact-planner-boundary.test.ts
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';

const localRequire = createRequire(__filename);
const vscodeDistRoot = path.resolve(__dirname, '../../../dist');

const {
  resolvePackFormat,
  sanitizePackFilename,
  formatCompactTimestamp,
  pickCollisionTimestampMs,
} = localRequire(path.join(vscodeDistRoot, 'artifact-browser', 'packArtifactPlanner.js')) as {
  resolvePackFormat: (input: { artifactKind: 'character' | 'module'; sourceFormat: string }) => {
    formatArgs: string[];
    ext: string;
    label: string;
  };
  sanitizePackFilename: (name: string, fallback?: string) => string;
  formatCompactTimestamp: (date: Date) => string;
  pickCollisionTimestampMs: (birthtimeMs: number, mtimeMs: number) => number;
};

test('resolvePackFormat maps character charx to charx flags', () => {
  assert.deepEqual(resolvePackFormat({ artifactKind: 'character', sourceFormat: 'charx' }), {
    formatArgs: ['--format', 'charx'],
    ext: '.charx',
    label: 'charx',
  });
});

test('resolvePackFormat maps character png to png flags', () => {
  assert.deepEqual(resolvePackFormat({ artifactKind: 'character', sourceFormat: 'png' }), {
    formatArgs: ['--format', 'png'],
    ext: '.png',
    label: 'png',
  });
});

test('resolvePackFormat defaults character json/scaffold/unknown to charx', () => {
  for (const sourceFormat of ['json', 'scaffold', 'unknown']) {
    assert.deepEqual(resolvePackFormat({ artifactKind: 'character', sourceFormat }), {
      formatArgs: ['--format', 'charx'],
      ext: '.charx',
      label: 'charx',
    });
  }
});

test('resolvePackFormat maps every module sourceFormat to risum flags (module first)', () => {
  for (const sourceFormat of ['risum', 'json', 'scaffold', 'unknown']) {
    assert.deepEqual(resolvePackFormat({ artifactKind: 'module', sourceFormat }), {
      formatArgs: ['--format', 'module', '--format', 'risum'],
      ext: '.risum',
      label: 'risum',
    });
  }
});

test('sanitizePackFilename replaces reserved chars, keeps inner spaces, trims trailing dots/spaces', () => {
  assert.equal(sanitizePackFilename('a/b:c*?"<>|d'), 'a_b_c______d');
  assert.equal(sanitizePackFilename('  spaced name  '), 'spaced name');
  assert.equal(sanitizePackFilename('trailing...'), 'trailing');
});

test('sanitizePackFilename falls back when empty after cleaning', () => {
  assert.equal(sanitizePackFilename('   ', 'artifact'), 'artifact');
  assert.equal(sanitizePackFilename('...'), 'artifact');
});

test('formatCompactTimestamp emits zero-padded local YYYYMMDDHHMMSS', () => {
  assert.equal(formatCompactTimestamp(new Date(2026, 4, 19, 20, 11, 23)), '20260519201123');
  assert.equal(formatCompactTimestamp(new Date(2026, 0, 1, 0, 0, 0)), '20260101000000');
});

test('pickCollisionTimestampMs prefers valid birthtime, else mtime', () => {
  assert.equal(pickCollisionTimestampMs(1000, 2000), 1000);
  assert.equal(pickCollisionTimestampMs(0, 2000), 2000);
  assert.equal(pickCollisionTimestampMs(Number.NaN, 2000), 2000);
});
