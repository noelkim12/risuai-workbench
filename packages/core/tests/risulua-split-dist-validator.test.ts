import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  RISULUA_SPLIT_PLAN_PATH,
  RISULUA_SPLIT_REPORT_PATH,
  attachRisuLuaSplitValidation,
  buildRisuLuaSplitDist,
  createRisuLuaMixedPreserveArtifacts,
  createRisuLuaPlainCoarseArtifacts,
  createRisuLuaPreloadRecoveryArtifacts,
  createRisuLuaSectionRecoveryArtifacts,
  renderRisuLuaSplitReport,
  serializeRisuLuaSplitPlan,
  validateRisuLuaSplitWorkspace,
  writeRisuLuaMixedPreserveWorkspace,
  writeRisuLuaPlainCoarseWorkspace,
  writeRisuLuaPreloadRecoveryWorkspace,
  writeRisuLuaSectionRecoveryWorkspace,
} from '../src/domain/risulua-split';
import { hasExecutableRequireCalls } from '../src/cli/shared';
import type { LuaPlannedFile, LuaSourceRange, RisuLuaSplitPlan } from '../src/domain/risulua-split';

const fixtureRoot = fileURLToPath(new URL('./fixtures/risulua/', import.meta.url));

describe('risulua-split dist builder and validators', () => {
  it('builds plain-single dist through existing dot-only modular contracts', () => {
    withTempDir('plain', (outputRoot) => {
      const source = [
        'local helper = require("common.helpers")',
        '',
        'function onOutput(text)',
        '  return helper.decorate(text)',
        'end',
      ].join('\n');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: 'plain_manual.risulua',
        targetName: 'plain_manual',
      });
      artifacts.workspaceFiles.push({
        path: 'lua/common/helpers.risulua',
        content: 'return { decorate = function(text) return text .. "!" end }\n',
      });
      artifacts.plan.files.push({
        path: 'lua/common/helpers.risulua',
        kind: 'coarse-block',
        sourceRanges: [],
        confidence: 'high',
        reason: 'Test helper module required with dot-only modular id.',
        preserveOrderIndex: 1,
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });
      const buildResult = buildRisuLuaSplitDist({ outputRoot, plan: artifacts.plan });
      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan: artifacts.plan, buildResult, source });
      const dist = readOutput(outputRoot, 'dist/plain_manual.risulua');

      expect(buildResult.wroteDist).toBe(true);
      expect(validation.ok).toBe(true);
      expect(validation.packable).toBe(true);
      expect(dist).toContain('local helper = __risulua_loaders["common.helpers"]()');
      expect(dist).toContain('function onOutput(text)');
      expect(hasExecutableRequireCalls(dist)).toBe(false);
      expect(validation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'dist-written', severity: 'info' }),
      ]));
    });
  });

  it('prepends local helper fragments before bundled main in plain-single dist', () => {
    withTempDir('plain-local-fragment', (outputRoot) => {
      const source = [
        'local function trim(value)',
        '  return (value:gsub("^%s+", ""):gsub("%s+$", ""))',
        'end',
        '',
        'function decorate(text)',
        '  return "[" .. text .. "]"',
        'end',
        '',
        'local config = { suffix = "!" }',
        '',
        'function onOutput(text)',
        '  return decorate(trim(text)) .. config.suffix',
        'end',
        '',
      ].join('\n');
      const artifacts = createRisuLuaPlainCoarseArtifacts({
        source,
        sourcePath: 'plain_local_fragment.risulua',
        targetName: 'plain_local_fragment',
      });

      writeRisuLuaPlainCoarseWorkspace(artifacts, { outputRoot, cwd: process.cwd() });
      const main = readOutput(outputRoot, 'lua/main.risulua');
      const buildResult = buildRisuLuaSplitDist({ outputRoot, plan: artifacts.plan });
      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan: artifacts.plan, buildResult, source });
      const dist = readOutput(outputRoot, 'dist/plain_local_fragment.risulua');

      expect(main).not.toContain('local function trim(value)');
      expect(main).not.toContain('require("common.local_helpers")');
      expect(main).toContain('local config = { suffix = "!" }');
      expect(readOutput(outputRoot, 'lua/common/local_helpers.risulua')).toContain('local function trim(value)');
      expect(readOutput(outputRoot, 'lua/common/helpers.risulua')).toContain('function decorate(text)');
      expect(dist.indexOf('local function trim(value)')).toBeLessThan(dist.indexOf('function onOutput(text)'));
      expect(dist).toContain('local config = { suffix = "!" }');
      expect(dist).toContain('function decorate(text)');
      expect(dist).toContain('local __risulua_cache = {}');
      expect(dist).toContain('Build-time local helper fragments');
      expect(hasExecutableRequireCalls(dist)).toBe(false);
      expect(validation.ok).toBe(true);
    });
  });

  it('builds module-table dist through modular resolver without fragment prepend', () => {
    withTempDir('module-table-dist', (outputRoot) => {
      const source = 'function onOutput(text)\n  return text\nend\n';
      const plan = createModuleTablePlan('module_table_dist', source, [
        plannedFile('lua/main.risulua', 0),
        plannedFile('lua/common/local_helpers.risulua', 1),
        plannedFile('lua/handler_helpers/output_helpers.risulua', 2),
        plannedFile('lua/host_globals/global_functions.risulua', 3),
        plannedFile('legacy/original.risulua', 4, 'legacy-original'),
      ]);
      writeFile(outputRoot, 'lua/main.risulua', [
        'local local_helpers = require("common.local_helpers")',
        'local output_helpers = require("handler_helpers.output_helpers")',
        'local host_globals = require("host_globals.global_functions")',
        '',
        'function onOutput(text)',
        '  return output_helpers.decorate(local_helpers.trim(text)) .. host_globals.currentUser()',
        'end',
      ].join('\n'));
      writeFile(outputRoot, 'lua/common/local_helpers.risulua', 'local M = {}\nfunction M.trim(text) return text:gsub("^%s+", "") end\nreturn M\n');
      writeFile(outputRoot, 'lua/handler_helpers/output_helpers.risulua', 'local local_helpers = require("common.local_helpers")\nlocal M = {}\nfunction M.decorate(text) return "[" .. local_helpers.trim(text) .. "]" end\nreturn M\n');
      writeFile(outputRoot, 'lua/host_globals/global_functions.risulua', 'local M = {}\nfunction M.currentUser() return getChatVar("user") end\nreturn M\n');
      writeFile(outputRoot, 'legacy/original.risulua', source);
      writeModuleTableRefactorMap(outputRoot, [
        'lua/common/local_helpers.risulua',
        'lua/handler_helpers/output_helpers.risulua',
        'lua/host_globals/global_functions.risulua',
      ]);

      const buildResult = buildRisuLuaSplitDist({ outputRoot, plan });
      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan, buildResult, source });
      const dist = readOutput(outputRoot, 'dist/module_table_dist.risulua');

      expect(buildResult.wroteDist).toBe(true);
      expect(validation.ok).toBe(true);
      expect(validation.packable).toBe(true);
      expect(dist).toContain('local local_helpers = __risulua_loaders["common.local_helpers"]()');
      expect(dist).toContain('local output_helpers = __risulua_loaders["handler_helpers.output_helpers"]()');
      expect(dist).toContain('local host_globals = __risulua_loaders["host_globals.global_functions"]()');
      expect(dist).not.toContain('Build-time local helper fragments');
      expect(hasExecutableRequireCalls(dist)).toBe(false);
    });
  });

  it('keeps warning-only local budget diagnostics non-blocking in split validation', () => {
    withTempDir('module-table-local-warning', (outputRoot) => {
      const source = 'function onOutput(text)\n  return text\nend\n';
      const plan = createModuleTablePlan('module_table_local_warning', source, [
        plannedFile('lua/main.risulua', 0),
        plannedFile('legacy/original.risulua', 1, 'legacy-original'),
      ]);
      writeFile(outputRoot, 'lua/main.risulua', source);
      writeFile(outputRoot, 'legacy/original.risulua', source);
      writeModuleTableRefactorMap(outputRoot, []);
      writeFile(outputRoot, 'dist/module_table_local_warning.risulua', buildTopLevelLocalChunk(167));

      const validation = validateRisuLuaSplitWorkspace({
        outputRoot,
        plan,
        buildResult: {
          strategy: plan.buildStrategy,
          distPath: path.join(outputRoot, 'dist', 'module_table_local_warning.risulua'),
          distRelativePath: 'dist/module_table_local_warning.risulua',
          wroteDist: true,
          staleDistDetected: false,
          code: buildTopLevelLocalChunk(167),
        },
        source,
      });

      expect(validation.ok).toBe(true);
      expect(validation.packable).toBe(true);
      expect(validation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'local-budget', severity: 'warning' }),
      ]));
    });
  });

  it('blocks hard-limit local budget diagnostics in split validation', () => {
    withTempDir('module-table-local-hard-limit', (outputRoot) => {
      const source = 'function onOutput(text)\n  return text\nend\n';
      const plan = createModuleTablePlan('module_table_local_hard_limit', source, [
        plannedFile('lua/main.risulua', 0),
        plannedFile('legacy/original.risulua', 1, 'legacy-original'),
      ]);
      writeFile(outputRoot, 'lua/main.risulua', source);
      writeFile(outputRoot, 'legacy/original.risulua', source);
      writeModuleTableRefactorMap(outputRoot, []);
      writeFile(outputRoot, 'dist/module_table_local_hard_limit.risulua', buildTopLevelLocalChunk(200));

      const validation = validateRisuLuaSplitWorkspace({
        outputRoot,
        plan,
        buildResult: {
          strategy: plan.buildStrategy,
          distPath: path.join(outputRoot, 'dist', 'module_table_local_hard_limit.risulua'),
          distRelativePath: 'dist/module_table_local_hard_limit.risulua',
          wroteDist: true,
          staleDistDetected: false,
          code: buildTopLevelLocalChunk(200),
        },
        source,
      });

      expect(validation.ok).toBe(false);
      expect(validation.packable).toBe(false);
      expect(validation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'local-budget', severity: 'error' }),
      ]));
    });
  });

  it('rejects invalid module-table artifacts and unsafe dist output', () => {
    withTempDir('module-table-invalid', (outputRoot) => {
      const source = 'function onOutput(text)\n  return text\nend\n';
      const plan = createModuleTablePlan('module_table_invalid', source, [
        plannedFile('lua/main.risulua', 0),
        plannedFile('lua/features/legacy_helpers.risulua', 1),
        plannedFile('lua/domain/calculator.risulua', 2),
        plannedFile('lua/common/empty.risulua', 3),
        plannedFile('lua/handler_helpers/stale_helpers.risulua', 4, 'chunk-fragment'),
        plannedFile('legacy/original.risulua', 5, 'legacy-original'),
      ]);
      writeFile(outputRoot, 'lua/main.risulua', 'local helpers = require("common.empty")\nfunction onOutput(text) return text end\n');
      writeFile(outputRoot, 'lua/features/legacy_helpers.risulua', 'return {}\n');
      writeFile(outputRoot, 'lua/domain/calculator.risulua', 'return {}\n');
      writeFile(outputRoot, 'lua/common/empty.risulua', '   \n');
      writeFile(outputRoot, 'lua/handler_helpers/stale_helpers.risulua', 'return {}\n');
      writeFile(outputRoot, 'legacy/original.risulua', source);
      writeFile(outputRoot, 'dist/module_table_invalid.risulua', 'local helpers = require("common.empty")\n');
      writeInvalidRefactorMap(outputRoot);

      const validation = validateRisuLuaSplitWorkspace({
        outputRoot,
        plan,
        buildResult: {
          strategy: plan.buildStrategy,
          distPath: path.join(outputRoot, 'dist', 'module_table_invalid.risulua'),
          distRelativePath: 'dist/module_table_invalid.risulua',
          wroteDist: true,
          staleDistDetected: false,
          code: 'local helpers = require("common.empty")\n',
        },
        source,
      });
      const codes = validation.findings.map((finding) => finding.code);

      expect(validation.ok).toBe(false);
      expect(codes).toEqual(expect.arrayContaining([
        'module-table-forbidden-output-path',
        'module-table-empty-module',
        'module-table-stale-chunk-fragment',
        'module-table-refactor-map-invalid',
        'module-table-refactor-map-missing-entry',
        'executable-require-in-dist',
      ]));
    });
  });

  it('rejects module-table validation when refactor map is missing', () => {
    withTempDir('module-table-missing-map', (outputRoot) => {
      const source = 'function onOutput(text)\n  return text\nend\n';
      const plan = createModuleTablePlan('module_table_missing_map', source, [plannedFile('lua/main.risulua', 0)]);
      writeFile(outputRoot, 'lua/main.risulua', source);
      writeFile(outputRoot, 'dist/module_table_missing_map.risulua', source);

      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan, buildResult: buildRisuLuaSplitDist({ outputRoot, plan }), source });

      expect(validation.ok).toBe(false);
      expect(validation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'module-table-missing-refactor-map', severity: 'error' }),
      ]));
    });
  });

  it('concatenates section files by preserveOrderIndex without wrappers or require graph synthesis', () => {
    withTempDir('section', (outputRoot) => {
      const source = readFixture('section-bundle/section_scope_leak.risulua');
      const artifacts = createRisuLuaSectionRecoveryArtifacts({
        source,
        sourcePath: fixturePath('section-bundle/section_scope_leak.risulua'),
        targetName: 'section_scope_leak',
      });

      writeRisuLuaSectionRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });
      const buildResult = buildRisuLuaSplitDist({ outputRoot, plan: artifacts.plan });
      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan: artifacts.plan, buildResult, source });
      const dist = readOutput(outputRoot, 'dist/section_scope_leak.risulua');

      expect(validation.ok).toBe(true);
      expect(validation.packable).toBe(true);
      expect(dist).toContain('local shared = "visible across concatenated sections"');
      expect(dist).toContain('return shared');
      expect(dist.indexOf('-- [BUNDLE] 00_state.lua')).toBeLessThan(dist.indexOf('-- [BUNDLE] 20_feature.lua'));
      expect(dist.indexOf('-- [BUNDLE] 20_feature.lua')).toBeLessThan(dist.indexOf('-- [BUNDLE] 80_runtime.lua'));
      expect(dist).not.toContain('require("sections.');
      expect(hasExecutableRequireCalls(dist)).toBe(false);
    });
  });

  it('treats preload recovery as terminal no-dist validation and reports stale dist', () => {
    withTempDir('preload', (outputRoot) => {
      const source = readFixture('synthetic/preload_simple.risulua');
      const artifacts = createRisuLuaPreloadRecoveryArtifacts({
        source,
        sourcePath: fixturePath('synthetic/preload_simple.risulua'),
        targetName: 'preload_simple',
      });

      writeRisuLuaPreloadRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });
      const cleanBuild = buildRisuLuaSplitDist({ outputRoot, plan: artifacts.plan });
      const cleanValidation = validateRisuLuaSplitWorkspace({ outputRoot, plan: artifacts.plan, buildResult: cleanBuild, source });

      expect(cleanBuild.wroteDist).toBe(false);
      expect(cleanBuild.distPath).toBeNull();
      expect(cleanValidation.ok).toBe(true);
      expect(cleanValidation.packable).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
      expect(cleanValidation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'preload-recovery-safe', severity: 'info' }),
      ]));

      const stalePlan = { ...artifacts.plan, distPath: 'dist/preload_simple.risulua' } satisfies RisuLuaSplitPlan;
      writeFile(outputRoot, 'dist/preload_simple.risulua', '-- stale old dist\n');
      const staleBuild = buildRisuLuaSplitDist({ outputRoot, plan: stalePlan });
      const staleValidation = validateRisuLuaSplitWorkspace({ outputRoot, plan: stalePlan, buildResult: staleBuild, source });

      expect(staleBuild.wroteDist).toBe(false);
      expect(staleBuild.staleDistDetected).toBe(true);
      expect(staleValidation.ok).toBe(false);
      expect(staleValidation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'stale-dist-output', severity: 'error' }),
      ]));
    });
  });

  it('passes mixed and unknown no-dist recovery safety without marking packable', () => {
    withTempDir('mixed', (outputRoot) => {
      const mixedSource = readFixture('mixed/mixed_preload_and_marker.risulua');
      const mixed = createRisuLuaMixedPreserveArtifacts({
        source: mixedSource,
        sourcePath: fixturePath('mixed/mixed_preload_and_marker.risulua'),
        targetName: 'mixed_preload_and_marker',
      });

      writeRisuLuaMixedPreserveWorkspace(mixed, { outputRoot, cwd: process.cwd() });
      const mixedBuild = buildRisuLuaSplitDist({ outputRoot, plan: mixed.plan });
      const mixedValidation = validateRisuLuaSplitWorkspace({ outputRoot, plan: mixed.plan, buildResult: mixedBuild, source: mixedSource });

      expect(mixedBuild.wroteDist).toBe(false);
      expect(mixedValidation.ok).toBe(true);
      expect(mixedValidation.packable).toBe(false);
      expect(mixedValidation.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'dist-not-required', severity: 'info' }),
      ]));
    });

    withTempDir('unknown', (outputRoot) => {
      const source = 'function broken(\n';
      const unknown = createRisuLuaMixedPreserveArtifacts({
        source,
        sourcePath: 'unknown_malformed.risulua',
        targetName: 'unknown_malformed',
      });

      writeRisuLuaMixedPreserveWorkspace(unknown, { outputRoot, cwd: process.cwd() });
      const buildResult = buildRisuLuaSplitDist({ outputRoot, plan: unknown.plan });
      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan: unknown.plan, buildResult, source });

      expect(unknown.plan.sourceProfile).toBe('unknown');
      expect(validation.ok).toBe(true);
      expect(validation.packable).toBe(false);
      expect(fs.existsSync(path.join(outputRoot, 'dist'))).toBe(false);
    });
  });

  it('keeps validator results consumable by plan and report writers', () => {
    withTempDir('report-validation', (outputRoot) => {
      const source = readFixture('section-bundle/section_three_markers.risulua');
      const artifacts = createRisuLuaSectionRecoveryArtifacts({
        source,
        sourcePath: fixturePath('section-bundle/section_three_markers.risulua'),
        targetName: 'section_three_markers',
      });

      writeRisuLuaSectionRecoveryWorkspace(artifacts, { outputRoot, cwd: process.cwd() });
      const buildResult = buildRisuLuaSplitDist({ outputRoot, plan: artifacts.plan });
      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan: artifacts.plan, buildResult, source });
      const validatedPlan = attachRisuLuaSplitValidation(artifacts.plan, validation);
      const planJson = serializeRisuLuaSplitPlan(validatedPlan, { cwd: process.cwd() });
      const report = renderRisuLuaSplitReport({ ...artifacts, plan: validatedPlan });

      expect(JSON.parse(planJson)).toEqual(expect.objectContaining({
        validation: expect.objectContaining({ ok: true, wroteDist: true }),
      }));
      expect(report).toContain('## Validator results');
      expect(report).toContain('dist-written');
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_PLAN_PATH.split('/')))).toBe(true);
      expect(fs.existsSync(path.join(outputRoot, ...RISULUA_SPLIT_REPORT_PATH.split('/')))).toBe(true);
    });
  });

  it('detects host global shadowing in line-start assignment form (regression)', () => {
    withTempDir('host-global-assign', (outputRoot) => {
      const source = 'function onOutput(text)\n  return text\nend\n';
      // Line-start assignment form: setChatVar = function() end
      const moduleSource = 'setChatVar = function() end\nreturn setChatVar\n';
      const plan = createModuleTablePlan('host_global_assign', source, [
        plannedFile('lua/main.risulua', 0),
        plannedFile('lua/common/shadow.risulua', 1),
      ]);
      writeFile(outputRoot, 'lua/main.risulua', source);
      writeFile(outputRoot, 'lua/common/shadow.risulua', moduleSource);
      writeModuleTableRefactorMap(outputRoot, ['lua/common/shadow.risulua']);

      const validation = validateRisuLuaSplitWorkspace({ outputRoot, plan, buildResult: buildRisuLuaSplitDist({ outputRoot, plan }), source });
      const hostGlobalFindings = validation.findings.filter((f) => f.code === 'host-global-shadowed');

      expect(hostGlobalFindings.length).toBeGreaterThanOrEqual(1);
      expect(hostGlobalFindings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: 'host-global-shadowed',
          severity: 'warning',
          message: expect.stringContaining('setChatVar'),
        }),
      ]));
    });
  });
});

function readFixture(relativePath: string): string {
  return fs.readFileSync(fixturePath(relativePath), 'utf8').replace(/\r\n/g, '\n');
}

function fixturePath(relativePath: string): string {
  return path.join(fixtureRoot, ...relativePath.split('/'));
}

function withTempDir(prefix: string, run: (outputRoot: string) => void): void {
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), `risulua-split-${prefix}-`));
  try {
    run(outputRoot);
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readOutput(outputRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(outputRoot, ...relativePath.split('/')), 'utf8');
}

function writeFile(outputRoot: string, relativePath: string, content: string): void {
  const outputPath = path.join(outputRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

function createModuleTablePlan(targetName: string, source: string, files: LuaPlannedFile[]): RisuLuaSplitPlan {
  return {
    version: 1,
    mode: 'module-table',
    sourceProfile: 'plain-single',
    sourceProfileSummary: { profile: 'plain-single', confidence: 'high', reasons: [], preloadModuleCount: 0, sectionMarkerCount: 0, staticRequireCount: 0, dynamicRequireCount: 0 },
    sourcePath: `${targetName}.risulua`,
    targetName,
    entryPath: 'lua/main.risulua',
    distPath: `dist/${targetName}.risulua`,
    packable: true,
    buildStrategy: 'concat-build-time-require',
    files,
    risks: [],
    detectedRoots: [{ name: 'onOutput', kind: 'function', sourceRange: wholeRange(source) }],
    hostApiSummary: { reads: [], writes: [], asyncCalls: [], unknownGlobals: [] },
    validation: { ok: true, packable: true, strategy: 'concat-build-time-require', distPath: `dist/${targetName}.risulua`, wroteDist: false, findings: [] },
  };
}

function plannedFile(pathName: string, preserveOrderIndex: number, kind: LuaPlannedFile['kind'] = 'coarse-block'): LuaPlannedFile {
  return {
    path: pathName,
    kind,
    sourceRanges: [],
    confidence: 'high',
    reason: 'module-table dist validator test fixture',
    preserveOrderIndex,
  };
}

function writeModuleTableRefactorMap(outputRoot: string, modulePaths: string[]): void {
  writeFile(outputRoot, 'docs/refactor-map.json', JSON.stringify({
    version: 1,
    mode: 'module-table',
    sourceFile: 'module_table_dist.risulua',
    modules: modulePaths.map((modulePath) => ({
      path: modulePath,
      requireId: modulePath.replace(/^lua\//, '').replace(/\.risulua$/u, '').replace(/\//g, '.'),
      alias: modulePath.split('/').pop()?.replace(/\.risulua$/u, '') ?? 'module',
      category: modulePath.includes('/handler_helpers/') ? 'handler-helper' : modulePath.includes('/host_globals/') ? 'host-global' : 'common-helper',
      exports: ['M'],
    })),
    symbols: [],
    preserved: [],
    domainCandidates: [],
  }, null, 2));
}

function writeInvalidRefactorMap(outputRoot: string): void {
  const range = wholeRange('function onOutput(text)\n  return text\nend\n');
  writeFile(outputRoot, 'docs/refactor-map.json', JSON.stringify({
    version: 1,
    mode: 'module-table',
    sourceFile: 'module_table_invalid.risulua',
    modules: [{ path: 'lua/features/legacy_helpers.risulua', requireId: 'features.legacy_helpers', alias: 'legacy_helpers', category: 'common-helper', exports: ['M'] }],
    symbols: [{
      id: 'symbol:publicBridge',
      originalName: 'publicBridge',
      declarationKind: 'top-level-global-function',
      sourceRange: range,
      classification: 'bridge:host-visible-global',
      targetModule: 'lua/features/legacy_helpers.risulua',
      exportName: 'publicBridge',
      globalBridge: true,
      captures: [],
      mutates: [],
      hostEffects: { reads: [], writes: [], uiInteraction: [], asyncModelNetwork: [], dynamicEnvironment: [] },
      rewriteRefs: [],
    }],
    preserved: [],
    domainCandidates: [],
  }, null, 2));
}

function wholeRange(source: string): LuaSourceRange {
  return { startLine: 1, endLine: Math.max(1, source.split('\n').length), startOffset: 0, endOffset: source.length };
}

function buildTopLevelLocalChunk(count: number): string {
  return `${Array.from({ length: count }, (_, index) => `local v${String(index + 1).padStart(3, '0')} = 1`).join('\n')}\nreturn v001\n`;
}
