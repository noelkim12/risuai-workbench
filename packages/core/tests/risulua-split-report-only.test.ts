import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  createRisuLuaReportOnlyArtifacts,
  serializeRisuLuaSplitPlan,
  writeRisuLuaSplitPlan,
  writeRisuLuaSplitReport,
} from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

const requiredReportSections = [
  '## Summary',
  '## Actual generated files',
  '## Suggested split map (not automatically applied when marked unsafe)',
  '## Source profile detection result',
  '## Runtime invocation overview',
  '## Detected inbound roots',
  '## Host capability usage',
  '## High-confidence pure candidates',
  '## Runtime-coupled helpers',
  '## Risky blocks preserved',
  '## Dynamic patterns',
  '## Suggested human/LLM refactor tasks',
  '## Verification suggestions',
];

describe('risulua-split report-only mode', () => {
  it('writes docs-only artifacts without split source trees or dist output', () => {
    withTempDir((outputRoot) => {
      const sourcePath = fixturePath('preload-bundle/preload_dynamic_require.risulua');
      const artifacts = createRisuLuaReportOnlyArtifacts({
        source: readFixture('preload-bundle/preload_dynamic_require.risulua'),
        sourcePath,
        targetName: 'preload_dynamic_require',
      });

      const planWrite = writeRisuLuaSplitPlan(artifacts.plan, { outputRoot, cwd: process.cwd() });
      const reportWrite = writeRisuLuaSplitReport(artifacts, { outputRoot });
      const plan = JSON.parse(planWrite.json) as typeof artifacts.plan;
      const report = reportWrite.markdown;

      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);
      expectForbiddenOutputTreesAbsent(outputRoot);
      expect(plan.mode).toBe('report');
      expect(plan.sourceProfile).toBe('preload-bundle');
      expect(plan.buildStrategy).toBe('preload-recovery-no-dist');
      expect(plan.packable).toBe(false);
      expect(plan.distPath).toBeNull();
      expect(plan.files).toEqual([]);
      expect(plan.sourcePath).toBe('<repo-root>/tests/fixtures/risulua/preload-bundle/preload_dynamic_require.risulua');
      expect(plan.sourceProfileResult.dynamicRequires).toEqual([expect.objectContaining({ expression: 'moduleName' })]);
      expect(plan.risks).toEqual([expect.objectContaining({ id: 'dynamic-require' })]);
      expect(requiredReportSections.every((section) => report.includes(section))).toBe(true);
      expect(report).toContain('- Actual generated Lua source files: None.');
      expect(report).toContain('- Actual runtime-required module files: None.');
      expect(report).toContain('- Actual build-time local fragment files: None.');
      expect(report).toContain('- Note: no modules were extracted;');
      expect(report).toContain('not a guarantee that every listed candidate was generated');
      expect(report).toContain('Preload module');
      expect(report).toContain('report mode records it without creating `lua/preload` or `dist`.');
    });
  });

  it('keeps plan JSON stable by normalizing absolute source paths', () => {
    const sourcePath = fixturePath('plain/plain_hooks_only.risulua');
    const artifacts = createRisuLuaReportOnlyArtifacts({
      source: readFixture('plain/plain_hooks_only.risulua'),
      sourcePath,
    });

    const first = serializeRisuLuaSplitPlan(artifacts.plan, { cwd: process.cwd() });
    const second = serializeRisuLuaSplitPlan(artifacts.plan, { cwd: process.cwd() });

    expect(first).toBe(second);
    expect(first).not.toContain(process.cwd());
    expect(first).not.toMatch(/createdAt|updatedAt|timestamp/i);
    expect(JSON.parse(first)).toEqual(expect.objectContaining({
      targetName: 'plain_hooks_only',
      sourcePath: '<repo-root>/tests/fixtures/risulua/plain/plain_hooks_only.risulua',
    }));
  });

  it('writes report and plan with detector evidence when AST analysis fails', () => {
    withTempDir((outputRoot) => {
      const artifacts = createRisuLuaReportOnlyArtifacts({
        source: readFixture('synthetic/malformed_lua.risulua'),
        sourcePath: fixturePath('synthetic/malformed_lua.risulua'),
      });

      const planWrite = writeRisuLuaSplitPlan(artifacts.plan, { outputRoot, cwd: process.cwd() });
      const reportWrite = writeRisuLuaSplitReport(artifacts, { outputRoot });
      const plan = JSON.parse(planWrite.json) as typeof artifacts.plan;

      expect(fs.existsSync(planWrite.path)).toBe(true);
      expect(fs.existsSync(reportWrite.path)).toBe(true);
      expectForbiddenOutputTreesAbsent(outputRoot);
      expect(plan.sourceProfileResult).toEqual(expect.objectContaining({
        profile: 'plain-single',
        reasons: expect.arrayContaining(['Selected profile: plain-single.']),
      }));
      expect(plan.risks).toEqual([expect.objectContaining({
        id: 'lua-ast-analysis-failed',
        riskFlags: ['ast-analysis-failed'],
      })]);
      expect(reportWrite.markdown).toContain('AST analysis failed; report-only artifacts preserve detector output.');
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
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'risulua-report-only-'));
  try {
    run(outputRoot);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function expectForbiddenOutputTreesAbsent(outputRoot: string): void {
  for (const relativePath of ['lua', 'dist', 'lua/sections', 'lua/preload', 'lua/common', 'legacy']) {
    expect(fs.existsSync(path.join(outputRoot, ...relativePath.split('/')))).toBe(false);
  }
}
