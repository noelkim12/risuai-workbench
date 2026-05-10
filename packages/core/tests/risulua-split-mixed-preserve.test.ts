import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  createRisuLuaMixedPreserveArtifacts,
  extractRisuLuaPreloadModules,
  writeRisuLuaMixedPreserveWorkspace,
} from '../src/domain/risulua-split';
import type { RisuLuaMixedPreservePlan } from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

describe('risulua-split mixed/unknown preserve-first planner', () => {
  it('creates a preserve-first mixed workspace without unsafe dist output', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('mixed/mixed_preload_and_marker.risulua');
      const artifacts = createRisuLuaMixedPreserveArtifacts({
        source,
        sourcePath: fixturePath('mixed/mixed_preload_and_marker.risulua'),
        targetName: 'mixed_preload_and_marker',
      });

      writeRisuLuaMixedPreserveWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const main = readOutput(outputRoot, 'lua/main.risulua');
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);

      expect(plan).toEqual(expect.objectContaining({
        mode: 'coarse',
        sourceProfile: 'mixed-bundle',
        buildStrategy: 'report-only',
        packable: false,
        distPath: null,
        entryPath: 'lua/main.risulua',
      }));
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'dist', 'mixed_preload_and_marker.risulua'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'legacy', 'original.risulua'))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);

      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
      expect(main).toContain('-- high-risk gate: no dist output is generated for mixed/unknown preserve-first recovery.');
      expect(main).toContain('-- Preserved source follows verbatim for audit and manual recovery.');
      expect(main).toContain(source);
      expect(main).toContain('-- recovered-section: 00_boot.lua -> lua/sections/00_boot.risulua');
      expect(main).toContain('-- recovered-preload: ./panel -> lua/preload/panel.risulua');

      const preloadOutput = readOutput(outputRoot, 'lua/preload/panel.risulua');
      const extractedPreload = extractRisuLuaPreloadModules(source).modules[0];
      expect(preloadOutput).toContain('return { booted = booted }');
      expect(preloadOutput.endsWith(`\n${extractedPreload.body}`)).toBe(true);
      expect(extractedPreload.body.startsWith('\n  return')).toBe(true);
      expect(readOutput(outputRoot, 'lua/sections/00_boot.risulua')).toContain('package.preload["./panel"] = function()');
      expect(plan.files).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: 'lua/main.risulua', kind: 'coarse-block' }),
        expect.objectContaining({ path: 'lua/sections/00_boot.risulua', kind: 'chunk-fragment', sectionLabel: '00_boot.lua' }),
        expect.objectContaining({ path: 'lua/preload/panel.risulua', kind: 'preload-module', preloadId: './panel' }),
        expect.objectContaining({ path: 'legacy/original.risulua', kind: 'legacy-original' }),
      ]));
      expect(plan.risks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'mixed-preserve-first-no-dist', severity: 'error', riskFlags: expect.arrayContaining(['dist-disabled', 'mixed-bundle']) }),
        expect.objectContaining({ id: 'mixed-boundary-overlap-review', riskFlags: expect.arrayContaining(['boundary-overlap-review']) }),
      ]));
      expect(report).toContain('Mixed bundle is high-risk');
      expect(report).toContain('packable=false');
    });
  });

  it('fails closed for malformed unknown fallback with preserve-only workspace', () => {
    withTempDir((outputRoot) => {
      const source = readFixture('synthetic/malformed_lua.risulua');
      const artifacts = createRisuLuaMixedPreserveArtifacts({
        source,
        sourcePath: fixturePath('synthetic/malformed_lua.risulua'),
        targetName: 'malformed_lua',
      });

      writeRisuLuaMixedPreserveWorkspace(artifacts, { outputRoot, cwd: process.cwd() });

      const plan = readPlan(outputRoot);
      const main = readOutput(outputRoot, 'lua/main.risulua');
      const report = readOutput(outputRoot, RISULUA_SPLIT_REPORT_PATH);

      expect(plan).toEqual(expect.objectContaining({
        mode: 'coarse',
        sourceProfile: 'unknown',
        buildStrategy: 'report-only',
        packable: false,
        distPath: null,
      }));
      expect(plan.sourceProfileResult).toEqual(expect.objectContaining({
        profile: 'unknown',
        confidence: 'very-low',
      }));
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'lua', 'sections'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'lua', 'preload'))).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);
      expect(readOutput(outputRoot, 'legacy/original.risulua')).toBe(source);
      expect(main).toContain('-- source-profile=unknown');
      expect(main).toContain('-- parse-failure=');
      expect(main).toContain(source);
      expect(plan.files).toEqual([
        expect.objectContaining({ path: 'lua/main.risulua', kind: 'coarse-block' }),
        expect.objectContaining({ path: 'legacy/original.risulua', kind: 'legacy-original' }),
      ]);
      expect(plan.risks).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'unknown-fail-closed-preserved', severity: 'error' }),
        expect.objectContaining({ id: 'lua-ast-analysis-failed', riskFlags: expect.arrayContaining(['semantic-split-disabled']) }),
      ]));
      expect(report).toContain('Unknown or malformed RisuLua source failed closed');
      expect(report).toContain('no semantic split is attempted');
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
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-mixed-preserve-'));
  try {
    run(outputRoot);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readOutput(outputRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(outputRoot, ...relativePath.split('/')), 'utf8');
}

function readPlan(outputRoot: string): RisuLuaMixedPreservePlan {
  return JSON.parse(readOutput(outputRoot, RISULUA_SPLIT_PLAN_PATH)) as RisuLuaMixedPreservePlan;
}
