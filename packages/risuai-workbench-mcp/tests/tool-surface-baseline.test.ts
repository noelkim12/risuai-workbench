/**
 * Tool surface baseline snapshot tests.
 * @file packages/risuai-workbench-mcp/tests/tool-surface-baseline.test.ts
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildToolSurfaceReport,
  checkSurfaceAgainstBaseline,
  serializeReport,
  writeReportToFile,
} from '../src/dev/snapshot-tool-surface';

const packageRoot = path.resolve(__dirname, '..');
const binPath = path.join(packageRoot, 'bin', 'risuai-workbench-mcp.js');
const fixturesRoot = path.resolve(__dirname, 'fixtures', 'workspaces', 'standard');

describe('tool surface baseline', () => {
  it('builds a report with expected schema and metrics', async () => {
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    expect(report.schema).toBe('risuai-workbench-mcp.tool-surface-report');
    expect(report.packageName).toBe('risuai-workbench-mcp');
    expect(report.toolCount).toBeGreaterThan(0);
    expect(report.rawBytes).toBeGreaterThan(0);
    expect(report.estimatedTokens).toBe(Math.ceil(report.rawBytes / 4));
    expect(report.largestTools.length).toBeGreaterThan(0);
    expect(report.tools.length).toBe(report.toolCount);

    // Deterministic ordering
    const names = report.tools.map((t) => t.name);
    expect(names).toEqual([...names].sort());

    // Phase 9: default surface is exactly 8 facade tools
    expect(report.toolCount).toBe(8);
    expect(names).toEqual([
      'workbench.catalog',
      'workbench.context',
      'workbench.patch_apply',
      'workbench.patch_preview',
      'workbench.prepare_action',
      'workbench.route_intent',
      'workbench.run_action',
      'workbench.smoke',
    ]);
    expect(names.some((n) => n.startsWith('workbench.creative.'))).toBe(false);
    expect(names.some((n) => n.startsWith('workbench.inspect_') || n.startsWith('workbench.validate_') || n.startsWith('workbench.query_') || n.startsWith('workbench.suggest_'))).toBe(false);
    expect(names).not.toContain('workbench.run_extract');
  });

  it('does not expose legacy tools in default surface after Phase 9', async () => {
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    const allNames = report.tools.map((t) => t.name);
    const creativeNames = allNames.filter((n) => n.startsWith('workbench.creative.'));
    const legacyNames = allNames.filter((n) =>
      (n.startsWith('workbench.inspect_') ||
      n.startsWith('workbench.validate_') ||
      n.startsWith('workbench.query_') ||
      n.startsWith('workbench.suggest_') ||
      n.startsWith('workbench.edit_') ||
      n.startsWith('workbench.apply_') ||
      n.startsWith('workbench.run_') ||
      n.startsWith('workbench.move_') ||
      n.startsWith('workbench.delete_') ||
      n.startsWith('workbench.ensure_') ||
      n.startsWith('workbench.refresh_') ||
      n.startsWith('workbench.rollback_') ||
      n.startsWith('workbench.plan_') ||
      n.startsWith('workbench.diff_') ||
      n.startsWith('workbench.search_') ||
      n.startsWith('workbench.build_') ||
      n.startsWith('workbench.list_') ||
      n.startsWith('workbench.recommend_') ||
      n.startsWith('workbench.explain_') ||
      n.startsWith('workbench.guide_')) &&
      n !== 'workbench.run_action',
    );

    // Phase 9 removes all legacy tools from default MCP surface.
    expect(creativeNames.length).toBe(0);
    expect(legacyNames.length).toBe(0);
    expect(report.toolCount).toBe(8);
  });

  it('writes report and baseline paths correctly', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'risuai-surface-test-'));
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    const { reportPath, baselinePath } = await writeReportToFile(report, tempDir);

    expect(reportPath.startsWith(tempDir)).toBe(true);
    expect(baselinePath).toBe(path.join(tempDir, 'baseline.json'));

    const written = await readFile(reportPath, 'utf8');
    const parsed = JSON.parse(written);
    expect(parsed.toolCount).toBe(report.toolCount);
  });

  it('produces deterministic serialized output', async () => {
    const report1 = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });
    const report2 = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    // Strip non-deterministic timestamp before comparing
    const stripTimestamp = (r: typeof report1) =>
      serializeReport({ ...r, generatedAt: 'fixed' });

    expect(stripTimestamp(report1)).toBe(stripTimestamp(report2));
  });

  it('check mode creates baseline when missing', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'risuai-surface-check-'));
    const baselinePath = path.join(tempDir, 'baseline.json');
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    const result = await checkSurfaceAgainstBaseline(report, baselinePath);
    expect(result).toBeNull();

    const baselineExists = await readFile(baselinePath, 'utf8');
    const baseline = JSON.parse(baselineExists);
    expect(baseline.toolCount).toBe(report.toolCount);
  });

  it('check mode fails when token budget exceeds tolerance', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'risuai-surface-budget-'));
    const baselinePath = path.join(tempDir, 'baseline.json');

    const smallReport = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    // Write baseline
    await checkSurfaceAgainstBaseline(smallReport, baselinePath);

    // Simulate a larger surface
    const largeReport = {
      ...smallReport,
      estimatedTokens: Math.ceil(smallReport.estimatedTokens * 1.2),
    };

    const result = await checkSurfaceAgainstBaseline(largeReport, baselinePath, 0.05);
    expect(result).not.toBeNull();
    expect(result).toContain('Token budget exceeded');
  });

  it('check mode passes when within tolerance', async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), 'risuai-surface-ok-'));
    const baselinePath = path.join(tempDir, 'baseline.json');

    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    await checkSurfaceAgainstBaseline(report, baselinePath);
    const result = await checkSurfaceAgainstBaseline(report, baselinePath, 0.05);
    expect(result).toBeNull();
  });

  it('includes normalized tool metadata for every tool', async () => {
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    for (const tool of report.tools) {
      expect(tool.name).toBeDefined();
      expect(typeof tool.name).toBe('string');
      // inputSchema may be empty object or a schema; either is valid
      expect(tool).toHaveProperty('inputSchema');
    }
  });

  it('meets Phase 11 surface budget: count <= 8 and tokens <= 5000', async () => {
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    // Hard requirement from integration plan
    expect(report.toolCount).toBeLessThanOrEqual(8);
    expect(report.estimatedTokens).toBeLessThanOrEqual(5000);
  });

  it('approaches Phase 11 target advisory: tokens <= 3200 (target 3000)', async () => {
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });

    // Target is <= 3000; current measured baseline is ~3119 tokens.
    // We assert <= 3200 to enforce downward pressure while acknowledging
    // the remaining gap to the 3000 advisory target.
    expect(report.estimatedTokens).toBeLessThanOrEqual(3200);
  });

  it('legacy tool gating is verified in server startup tests', async () => {
    // RISU_MCP_EXPOSE_LEGACY_TOOLS gating is thoroughly tested in:
    // - tests/server/startup.test.ts (default 8-tool surface)
    // - tests/server/creative-startup.test.ts (creative absence/presence)
    // - tests/server/roadmap-smoke.test.ts (legacy tool smoke under env gate)
    // buildToolSurfaceReport spawns a fresh child process; env propagation
    // would require extending the dev helper, which is out of scope here.
    const report = await buildToolSurfaceReport({
      binPath,
      root: fixturesRoot,
    });
    expect(report.toolCount).toBe(8);
    expect(report.tools.some((t) => t.name.startsWith('workbench.creative.'))).toBe(false);
    expect(report.tools.some((t) => t.name.startsWith('workbench.inspect_'))).toBe(false);
  });
});
