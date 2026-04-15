import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';

/**
 * Serialize the full relationship graph as machine-readable JSON.
 * Content shape mirrors the existing ForceGraphPayload used by the HTML report,
 * but serialized to a file inside the wiki assets directory.
 */
export function renderRelationshipsAsset(
  data: CharxReportData,
  _ctx: RenderContext,
): WikiFile {
  const payload = {
    artifact: data.characterName,
    nodes: buildNodes(data),
    edges: buildEdges(data),
  };
  return {
    relativePath: 'assets/relationships.json',
    content: JSON.stringify(payload, null, 2) + '\n',
  };
}

function buildNodes(data: CharxReportData): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  for (const entry of data.lorebookStructure.entries) {
    nodes.push({ id: `lb:${entry.id}`, kind: 'lorebook', name: entry.name, mode: entry.activationMode });
  }
  for (const [varName] of data.unifiedGraph.entries()) {
    nodes.push({ id: `var:${varName}`, kind: 'variable', name: varName });
  }
  for (const artifact of data.luaArtifacts) {
    for (const fn of artifact.collected.functions) {
      if (!fn.name || fn.name === '<top-level>') continue;
      nodes.push({
        id: `lua-fn:${artifact.baseName}:${fn.name}`,
        kind: 'lua-function',
        name: fn.name,
        file: artifact.baseName,
      });
    }
  }
  return nodes;
}

function buildEdges(data: CharxReportData): Array<Record<string, unknown>> {
  const edges: Array<Record<string, unknown>> = [];
  for (const edge of data.lorebookActivationChain.edges) {
    edges.push({
      type: 'activation-chain',
      from: `lb:${edge.sourceId}`,
      to: `lb:${edge.targetId}`,
      status: edge.status,
      matched: edge.matchedKeywords,
    });
  }
  for (const [varName, info] of data.unifiedGraph.entries()) {
    for (const [elementType, source] of Object.entries(info.sources)) {
      for (const reader of source.readers) {
        edges.push({
          type: 'variable-read',
          from: `var:${varName}`,
          to: `${elementType}:${reader}`,
        });
      }
      for (const writer of source.writers) {
        edges.push({
          type: 'variable-write',
          from: `${elementType}:${writer}`,
          to: `var:${varName}`,
        });
      }
    }
  }
  return edges;
}
