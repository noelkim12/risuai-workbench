import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  createRisuLuaPreloadRecoveryArtifacts,
  extractRisuLuaPreloadModules,
  writeRisuLuaPreloadRecoveryWorkspace,
} from '../src/domain/risulua-split';
import type { RisuLuaPreloadRecoveryPlan } from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

describe('risulua-split preload recovery writer', () => {
  it('recovers preload wrapper bodies while preserving top-level return semantics and writing no dist', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('synthetic/preload_simple.risulua');
      const sourcePath = fixturePath('synthetic/preload_simple.risulua');
      const artifacts = createRisuLuaPreloadRecoveryArtifacts({ source, sourcePath, targetName: 'preload_simple' });

      writeRisuLuaPreloadRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const constants = readOutput(outputRoot, 'lua/preload/constants.risulua');
      const formatter = readOutput(outputRoot, 'lua/preload/formatter.risulua');
      const main = readOutput(outputRoot, 'lua/main.risulua');

      expect(fs.existsSync(path.join(outputRoot, 'lua', 'main.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, 'legacy', 'original.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'dist', 'preload_simple.risulua'))).toBe(false);
      expect(plan).toEqual(expect.objectContaining({
        mode: 'coarse',
        sourceProfile: 'preload-bundle',
        buildStrategy: 'preload-recovery-no-dist',
        packable: false,
        distPath: null,
        entryPath: 'lua/main.risulua',
      }));
      expect(plan.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'lua/main.risulua', kind: 'entry-tail' }),
        expect.objectContaining({ path: 'lua/preload/constants.risulua', kind: 'preload-module', preloadId: './constants' }),
        expect.objectContaining({ path: 'lua/preload/formatter.risulua', kind: 'preload-module', preloadId: './formatter' }),
        expect.objectContaining({ path: 'legacy/original.risulua', kind: 'legacy-original' }),
      ]));
      expect(constants).toContain('-- preload-id=./constants');
      expect(constants).toContain('return { greeting = "hello" }');
      expect(formatter).toContain('-- preload-id=./formatter');
      expect(formatter).toContain('local constants = require("./constants")');
      expect(formatter).toContain('return {');
      expect(main).toContain('source-profile=preload-bundle');
      expect(main).toContain('dist-build-strategy=preload-recovery-no-dist');
      expect(main).toContain('packable=false');
      expect(main).toContain('-- preload: ./constants -> preload/constants.risulua');
      expect(main).toContain('local formatter = require("./formatter")');
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
      expect(plan.preloadRecovery.modules).toEqual([
        expect.objectContaining({ preloadId: './constants', requires: [], unresolvedRequires: [] }),
        expect.objectContaining({ preloadId: './formatter', requires: ['./constants'], unresolvedRequires: [] }),
      ]);
      expect(plan.preloadRecovery.duplicateIds).toEqual([]);
      expect(plan.preloadRecovery.dynamicRequires).toEqual([]);
    });
  });

  it('stores raw preload ids, source ranges, static require graph, and unresolved require evidence', () => {
    const source = readFixture('synthetic/preload_simple.risulua');
    const extraction = extractRisuLuaPreloadModules(source);
    const artifacts = createRisuLuaPreloadRecoveryArtifacts({
      source,
      sourcePath: fixturePath('synthetic/preload_simple.risulua'),
    });

    expect(extraction.modules).toHaveLength(2);
    for (const module of extraction.modules) {
      expect(source.slice(module.bodyRange.startOffset, module.bodyRange.endOffset)).toBe(module.body);
      expect(module.path).toMatch(/^lua\/preload\/[A-Za-z0-9._-]+\.risulua$/);
    }
    expect(artifacts.plan.preloadRecovery.modules.map((module) => module.preloadId)).toEqual(['./constants', './formatter']);
    expect(artifacts.plan.preloadRecovery.modules[1]).toEqual(expect.objectContaining({
      preloadId: './formatter',
      requires: ['./constants'],
      unresolvedRequires: [],
    }));
  });

  it('preserves exact body text including leading whitespace in written preload files (regression)', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('synthetic/preload_simple.risulua');
      const extraction = extractRisuLuaPreloadModules(source);
      const artifacts = createRisuLuaPreloadRecoveryArtifacts({
        source,
        sourcePath: fixturePath('synthetic/preload_simple.risulua'),
      });

      writeRisuLuaPreloadRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      // Verify the written file contains the exact body after headers
      // The body should start immediately after the blank line following original-range header
      const constantsOutput = readOutput(outputRoot, 'lua/preload/constants.risulua');
      const formatterOutput = readOutput(outputRoot, 'lua/preload/formatter.risulua');

      // Extract the body portion (after the generated headers)
      const constantsBodyStart = constantsOutput.indexOf('-- original-range=');
      const constantsBody = constantsOutput.slice(constantsBodyStart).split('\n\n')[1];
      const formatterBodyStart = formatterOutput.indexOf('-- original-range=');
      const formatterBody = formatterOutput.slice(formatterBodyStart).split('\n\n')[1];

      // The extracted body should match exactly what was in the source
      expect(constantsBody).toBe(extraction.modules[0].body);
      expect(formatterBody).toBe(extraction.modules[1].body);

      // Specifically verify exact body preservation including leading newline (regression test for F1)
      // The body starts with a newline followed by 2-space indent (from the original source)
      expect(constantsBody).toMatch(/^\n  return/); // starts with newline + 2-space indent
      expect(formatterBody).toMatch(/^\n  local/); // starts with newline + 2-space indent
    });
  });

  it('preserves the remaining tail as exact original non-preload source slices', () => {
    const source = readFixture('synthetic/preload_simple.risulua');
    const extraction = extractRisuLuaPreloadModules(source);
    const expectedTail = extraction.tailRanges
      .map((range) => source.slice(range.startOffset, range.endOffset))
      .join('');

    expect(extraction.tail).toBe(expectedTail);
    expect(extraction.tail).toMatch(/^\n\n\n\nlocal formatter = require\("\.\/formatter"\)/);
  });

  it('records dynamic require diagnostics and still writes no dist', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('preload-bundle/preload_dynamic_require.risulua');
      const artifacts = createRisuLuaPreloadRecoveryArtifacts({
        source,
        sourcePath: fixturePath('preload-bundle/preload_dynamic_require.risulua'),
        targetName: 'preload_dynamic_require',
      });

      writeRisuLuaPreloadRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
      expect(plan.buildStrategy).toBe('preload-recovery-no-dist');
      expect(plan.packable).toBe(false);
      expect(plan.distPath).toBeNull();
      expect(plan.preloadRecovery.dynamicRequires).toEqual([expect.objectContaining({ expression: 'moduleName' })]);
      expect(plan.preloadRecovery.modules[0].dynamicRequires).toEqual([expect.objectContaining({ expression: 'moduleName' })]);
      expect(plan.risks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'dynamic-require', severity: 'strong-warning', riskFlags: ['dynamic-require', 'preload-bundle'] }),
      ]));
      expect(readOutput(outputRoot, 'lua/preload/feature.risulua')).toContain('return require(moduleName)');
    });
  });

  it('records duplicate preload id diagnostics and keeps raw ids unchanged', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('preload-bundle/preload_duplicate_id.risulua');
      const artifacts = createRisuLuaPreloadRecoveryArtifacts({
        source,
        sourcePath: fixturePath('preload-bundle/preload_duplicate_id.risulua'),
        targetName: 'preload_duplicate_id',
      });

      writeRisuLuaPreloadRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const preloadFiles = plan.files.filter((file) => file.kind === 'preload-module');
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
      expect(preloadFiles).toEqual([
        expect.objectContaining({ preloadId: './dupe', path: 'lua/preload/dupe.risulua' }),
        expect.objectContaining({ preloadId: './dupe', path: 'lua/preload/dupe_2.risulua' }),
      ]);
      expect(plan.preloadRecovery.duplicateIds).toEqual([
        expect.objectContaining({ preloadId: './dupe', sourceRanges: [expect.any(Object), expect.any(Object)] }),
      ]);
      expect(plan.risks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'duplicate-preload-id', severity: 'error' }),
      ]));
      expect(readOutput(outputRoot, 'lua/preload/dupe.risulua')).toContain('return { value = 1 }');
      expect(readOutput(outputRoot, 'lua/preload/dupe_2.risulua')).toContain('return { value = 2 }');
    });
  });
});

function readFixture(relativePath: string): string {
  return fs.readFileSync(fixturePath(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function fixturePath(relativePath: string): string {
  return path.join(fixtureRoot, ...relativePath.split('/'));
}

function withTempDir(run: (outputRoot: string) => void): void {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-preload-recovery-'));
  try {
    run(outputRoot);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readOutput(outputRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(outputRoot, ...relativePath.split('/')), 'utf8');
}

function readPlan(outputRoot: string): RisuLuaPreloadRecoveryPlan {
  return JSON.parse(readOutput(outputRoot, RISULUA_SPLIT_PLAN_PATH)) as RisuLuaPreloadRecoveryPlan;
}
