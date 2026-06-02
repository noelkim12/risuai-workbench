/**
 * Facade visualization generator tests.
 * @file packages/risuai-workbench-mcp/tests/facade-visualization.test.ts
 */

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildFacadeVisualizationModel,
  renderArchitectureMermaid,
  renderNormalFlowMermaid,
  renderPatchFlowMermaid,
  renderReadmeSection,
  serializeFacadeGraph,
  writeFacadeVisualizationReports,
} from '../src/dev/facade-visualization';

const expectedFacadeTools = [
  'workbench.smoke',
  'workbench.route_intent',
  'workbench.catalog',
  'workbench.prepare_action',
  'workbench.run_action',
  'workbench.context',
  'workbench.patch_preview',
  'workbench.patch_apply',
];

describe('facade visualization generator', () => {
  it('builds a deterministic model for the 8 public facade tools', () => {
    const model = buildFacadeVisualizationModel({ generatedAt: 'fixed' });

    expect(model.schema).toBe('risuai-workbench-mcp.facade-visualization');
    expect(model.generatedAt).toBe('fixed');
    expect(model.publicTools.map((tool) => tool.id)).toEqual(expectedFacadeTools);
    expect(model.publicTools.every((tool) => tool.kind === 'mcp_tool')).toBe(true);
    expect(model.actionGroups.map((group) => group.capability)).toEqual([
      'inspect',
      'validate',
      'analyze',
      'wiki',
      'skills',
      'creative.context',
      'creative.ideation',
      'creative.review',
      'creative.patch',
      'patch.preview',
      'patch.apply',
    ]);
  });

  it('summarizes action groups with counts and risks', () => {
    const model = buildFacadeVisualizationModel({ generatedAt: 'fixed' });
    const creativePatch = model.actionGroups.find((group) => group.capability === 'creative.patch');
    const patchPreview = model.actionGroups.find((group) => group.capability === 'patch.preview');
    const patchApply = model.actionGroups.find((group) => group.capability === 'patch.apply');

    expect(creativePatch).toBeDefined();
    expect(creativePatch?.risks).toContain('read_only');
    expect(creativePatch?.risks).toContain('preview_mutation');
    expect(creativePatch?.risks).toContain('commit_mutation');
    expect(patchPreview?.risks).toEqual(['preview_mutation', 'read_only']);
    expect(patchApply?.risks).toEqual(['commit_mutation']);
  });

  it('renders architecture Mermaid with facade tools, registry groups, and safety boundary', () => {
    const model = buildFacadeVisualizationModel({ generatedAt: 'fixed' });
    const mermaid = renderArchitectureMermaid(model);

    expect(mermaid).toContain('flowchart TB');
    expect(mermaid).toContain('subgraph Public');
    expect(mermaid).toContain('workbench.route_intent');
    expect(mermaid).toContain('workbench.patch_apply');
    expect(mermaid).toContain('Internal Action Registry');
    expect(mermaid).toContain('Mutation safety boundary');
    expect(mermaid).toContain('blocks commit_mutation');
  });

  it('renders sequence diagrams for normal and patch flows', () => {
    const normal = renderNormalFlowMermaid();
    const patch = renderPatchFlowMermaid();

    expect(normal).toContain('sequenceDiagram');
    expect(normal).toContain('route_intent');
    expect(normal).toContain('prepare_action');
    expect(normal).toContain('run_action');
    expect(patch).toContain('sequenceDiagram');
    expect(patch).toContain('patch_preview');
    expect(patch).toContain('PatchPlan store');
    expect(patch).toContain('patch_apply');
  });

  it('renders a README section with diagrams and action group table', () => {
    const model = buildFacadeVisualizationModel({ generatedAt: 'fixed' });
    const markdown = renderReadmeSection(model);

    expect(markdown).toContain('## Facade architecture map');
    expect(markdown).toContain('```mermaid');
    expect(markdown).toContain('| Group | Capability | Actions | Risks | Public entrypoint |');
    expect(markdown).toContain('Inspect');
    expect(markdown).toContain('Creative Patch');
    expect(markdown).toContain('Patch Apply');
    expect(markdown).toContain('The facade reduces the external MCP `tools/list` surface');
  });

  it('serializes graph JSON deterministically', () => {
    const first = buildFacadeVisualizationModel({ generatedAt: 'fixed' });
    const second = buildFacadeVisualizationModel({ generatedAt: 'fixed' });

    expect(serializeFacadeGraph(first)).toBe(serializeFacadeGraph(second));
    const parsed = JSON.parse(serializeFacadeGraph(first));
    expect(parsed.nodes.some((node: { id: string }) => node.id === 'tool:workbench.route_intent')).toBe(true);
    expect(parsed.edges.some((edge: { kind: string }) => edge.kind === 'routes_to')).toBe(true);
  });

  it('writes report files to a target directory', async () => {
    const outDir = await mkdtemp(path.join(tmpdir(), 'facade-visualization-'));
    const model = buildFacadeVisualizationModel({ generatedAt: 'fixed' });

    const result = await writeFacadeVisualizationReports(model, outDir);

    expect(result.architecturePath).toBe(path.join(outDir, 'facade-architecture.mmd'));
    expect(result.normalFlowPath).toBe(path.join(outDir, 'facade-normal-flow.mmd'));
    expect(result.patchFlowPath).toBe(path.join(outDir, 'facade-patch-flow.mmd'));
    expect(result.graphPath).toBe(path.join(outDir, 'facade-graph.json'));
    expect(result.readmeSectionPath).toBe(path.join(outDir, 'facade-readme-section.md'));

    const graph = await readFile(result.graphPath, 'utf8');
    const readme = await readFile(result.readmeSectionPath, 'utf8');
    expect(JSON.parse(graph).schema).toBe('risuai-workbench-mcp.facade-visualization');
    expect(readme).toContain('Facade architecture map');
  });
});
