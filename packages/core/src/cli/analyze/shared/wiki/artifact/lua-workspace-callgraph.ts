import path from 'node:path';
import { toPosix } from '@/domain';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';

interface FunctionNode {
  id: string;
  fileLabel: string;
  name: string;
}

interface Edge {
  from: string;
  to: string;
  resolved: boolean;
}

export function renderLuaWorkspaceCallgraph(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  const nodes = collectFunctionNodes(data.luaArtifacts, ctx);
  if (nodes.length === 0) return null;

  const nodesByName = groupNodesByName(nodes);
  const edges = collectEdges(data.luaArtifacts, ctx, nodesByName);
  if (edges.length === 0) return null;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'lua-workspace-callgraph',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Lua Workspace Callgraph',
    '',
    `**Files:** ${new Set(nodes.map((node) => node.fileLabel)).size} · **Functions:** ${nodes.length} · **Edges:** ${edges.length}`,
    '',
    '## Edges',
    '',
  ];

  for (const edge of edges) {
    const suffix = edge.resolved ? '' : ' _(unresolved or ambiguous)_';
    lines.push(`- \`${edge.from}\` → \`${edge.to}\`${suffix}`);
  }

  lines.push('', '## Notes', '');
  lines.push('- Nodes are namespaced as `source-path::function` to prevent collisions across split files.');
  lines.push('- Unique function-name matches in another split file are resolved as cross-file edges.');
  lines.push('- Ambiguous callees stay as `?::callee` and should be reviewed against require/export sidecars.');
  lines.push('');

  return { relativePath: 'lua-workspace-callgraph.md', content: lines.join('\n') };
}

function collectFunctionNodes(artifacts: LuaAnalysisArtifact[], ctx: RenderContext): FunctionNode[] {
  const nodes: FunctionNode[] = [];
  for (const artifact of artifacts) {
    const fileLabel = luaArtifactLabel(artifact, ctx);
    for (const fn of artifact.collected.functions) {
      if (!fn.name || fn.name === '<top-level>') continue;
      nodes.push({
        id: `${fileLabel}::${fn.name}`,
        fileLabel,
        name: fn.name,
      });
    }
  }
  return nodes.sort((a, b) => a.id.localeCompare(b.id));
}

function collectEdges(
  artifacts: LuaAnalysisArtifact[],
  ctx: RenderContext,
  nodesByName: Map<string, FunctionNode[]>,
): Edge[] {
  const edges: Edge[] = [];
  for (const artifact of artifacts) {
    const fileLabel = luaArtifactLabel(artifact, ctx);
    const graph = artifact.analyzePhase.callGraph;
    for (const [caller, callees] of graph.entries()) {
      const from = `${fileLabel}::${caller}`;
      for (const callee of callees) {
        const candidates = nodesByName.get(callee) ?? [];
        const sameFile = candidates.find((candidate) => candidate.fileLabel === fileLabel);
        const unique = candidates.length === 1 ? candidates[0] : null;
        const target = sameFile ?? unique;
        edges.push({
          from,
          to: target ? target.id : `?::${callee}`,
          resolved: Boolean(target),
        });
      }
    }
  }
  return edges.sort((a, b) => `${a.from}\n${a.to}`.localeCompare(`${b.from}\n${b.to}`));
}

function groupNodesByName(nodes: FunctionNode[]): Map<string, FunctionNode[]> {
  const grouped = new Map<string, FunctionNode[]>();
  for (const node of nodes) {
    if (!grouped.has(node.name)) grouped.set(node.name, []);
    grouped.get(node.name)!.push(node);
  }
  return grouped;
}

function luaArtifactLabel(artifact: LuaAnalysisArtifact, ctx: RenderContext): string {
  if (artifact.relativePath && artifact.relativePath.length > 0) return artifact.relativePath;
  const relativeToExtract = toPosix(path.relative(ctx.extractDir, artifact.filePath));
  if (!relativeToExtract.startsWith('..') && relativeToExtract.length > 0) return relativeToExtract;
  return artifact.baseName;
}
