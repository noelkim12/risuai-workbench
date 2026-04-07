import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('charx extract integration', () => {
  it('extracts the real playground charx sample that uses the upstream import path', () => {
    const workspaceRoot = path.resolve(process.cwd(), '..', '..', '..');
    const sample = path.join(
      workspaceRoot,
      'playground',
      '260406-test',
      'charx',
      'Chikan Train-latest.charx',
    );
    const outDir = mkdtempSync(path.join(tmpdir(), 'risu-core-charx-'));
    tempDirs.push(outDir);

    const result = spawnSync(
      'node',
      [path.join(process.cwd(), 'dist', 'cli', 'main.js'), 'extract', sample, '--out', outDir],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(existsSync(path.join(outDir, 'charx.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'character', 'metadata.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'lorebooks', 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'regex', '_order.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'assets', 'manifest.json'))).toBe(true);
    expect(existsSync(path.join(outDir, 'html', 'background.html'))).toBe(true);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.html'))).toBe(true);
    expect(existsSync(path.join(outDir, 'analysis', 'charx-analysis.data.js'))).toBe(true);

    const analysisHtml = readFileSync(path.join(outDir, 'analysis', 'charx-analysis.html'), 'utf-8');
    const tabOrder = Array.from(analysisHtml.matchAll(/<button type="button" class="tab-button[^"]*" data-tab="([^"]+)">/g)).map(
      (match) => match[1],
    );
    const flowSectionIndex = analysisHtml.indexOf('data-tab="flow"');
    const graphSectionIndex = analysisHtml.indexOf('data-tab="graph"');
    const risksSectionIndex = analysisHtml.indexOf('data-tab="risks"');
    const flowSection = analysisHtml.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="flow">[\s\S]*?<\/section>/)?.[0] ?? '';
    const graphSection = analysisHtml.match(/<section class="section-card glass p-\[22px\] mb-5" data-tab="graph">[\s\S]*?<\/section>/)?.[0] ?? '';

    expect(tabOrder).toEqual(['overview', 'flow', 'graph', 'risks', 'sources']);
    expect(flowSectionIndex).toBeGreaterThan(-1);
    expect(graphSectionIndex).toBeGreaterThan(flowSectionIndex);
    expect(risksSectionIndex).toBeGreaterThan(graphSectionIndex);
    expect(analysisHtml).toMatch(/data-tab="graph">[^<]+<\/button>/);
    expect(analysisHtml).toContain('data-panel-id="charx-relationship-network"');
    expect(analysisHtml).toContain('data-library="force-graph"');
    expect(analysisHtml).not.toContain('Token Budget');
    expect(analysisHtml).not.toContain('Worst-case Tokens');
    expect(analysisHtml).not.toContain('최악 토큰 수');
    expect(flowSection).not.toContain('data-panel-id="charx-relationship-network"');
    expect(graphSection).toContain('data-panel-id="charx-relationship-network"');
    expect(analysisHtml).toContain('<script src="./charx-analysis.data.js"></script>');
    expect(analysisHtml).not.toContain('charx.action.reviewIsolated');
    expect(analysisHtml).not.toContain('charx.highlight.noBridgedMsg');
    expect(analysisHtml).not.toContain('charx.finding.noVariables');
    expect(analysisHtml).not.toContain('charx.flow.collectSources');
    expect(analysisHtml).not.toContain('shell.tab.graph');

    const runtimeFlowPayload = readFileSync(path.join(outDir, 'analysis', 'charx-analysis.data.js'), 'utf-8');
    const analysisMarkdown = readFileSync(path.join(outDir, 'analysis', 'charx-analysis.md'), 'utf-8');
    const runtimeFlowMermaid = runtimeFlowPayload.match(/flowchart TD(?:\\n|\n)[^"']+/)?.[0] ?? '';
    expect(runtimeFlowMermaid).toContain('flowchart TD');
    expect(runtimeFlowMermaid).not.toContain('[');
    expect(analysisMarkdown).not.toContain('## Token Budget');
    expect(analysisMarkdown).not.toContain('Worst-case tokens');
    expect(analysisMarkdown).not.toContain('최악 토큰');

    const charx = JSON.parse(readFileSync(path.join(outDir, 'charx.json'), 'utf-8')) as {
      spec?: string;
      data?: { name?: string; extensions?: { risuai?: { customScripts?: unknown[]; triggerscript?: unknown[] } } };
    };
    expect(charx.spec).toBe('chara_card_v3');
    expect(charx.data?.name).toBeTruthy();
    expect(Array.isArray(charx.data?.extensions?.risuai?.customScripts)).toBe(true);
    expect(Array.isArray(charx.data?.extensions?.risuai?.triggerscript)).toBe(true);
  });
});
