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
  const seenNodeIds = new Set<string>();

  const pushNode = (node: Record<string, unknown>) => {
    const id = String(node.id);
    if (seenNodeIds.has(id)) return;
    seenNodeIds.add(id);
    nodes.push(node);
  };

  for (const entry of data.lorebookStructure.entries) {
    pushNode({ id: `lb:${entry.id}`, kind: 'lorebook', name: entry.name, mode: entry.activationMode });
  }
  for (const [varName] of data.unifiedGraph.entries()) {
    pushNode({ id: `var:${varName}`, kind: 'variable', name: varName });
  }
  for (const regex of data.collected.regexCBS) {
    pushNode({ id: `rx:${regex.elementName}`, kind: 'regex', name: regex.elementName });
  }
  for (const shared of data.lorebookRegexCorrelation.sharedVars) {
    for (const regexName of shared.regexScripts) {
      pushNode({ id: `rx:${regexName}`, kind: 'regex', name: regexName });
    }
  }
  for (const artifact of data.luaArtifacts) {
    for (const fn of artifact.collected.functions) {
      if (!fn.name || fn.name === '<top-level>') continue;
      pushNode({
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
  const resolveNodeId = createNodeIdResolver(data);

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
        const readerId = resolveNodeId(elementType, reader);
        if (!readerId) continue;
        edges.push({
          type: 'variable-read',
          from: `var:${varName}`,
          to: readerId,
        });
      }
      for (const writer of source.writers) {
        const writerId = resolveNodeId(elementType, writer);
        if (!writerId) continue;
        edges.push({
          type: 'variable-write',
          from: writerId,
          to: `var:${varName}`,
        });
      }
    }
  }
  return edges;
}

function createNodeIdResolver(
  data: CharxReportData,
): (elementType: string, reference: string) => string | null {
  const lorebookNodeIds = new Map<string, string>();
  for (const entry of data.lorebookStructure.entries) {
    const nodeId = `lb:${entry.id}`;
    lorebookNodeIds.set(entry.id, nodeId);
    lorebookNodeIds.set(entry.name, nodeId);
  }

  const luaNodeIds = new Map<string, string>();
  for (const artifact of data.luaArtifacts) {
    for (const fn of artifact.collected.functions) {
      if (!fn.name || fn.name === '<top-level>') continue;
      const nodeId = `lua-fn:${artifact.baseName}:${fn.name}`;
      luaNodeIds.set(`${artifact.baseName}:${fn.name}`, nodeId);
      if (!luaNodeIds.has(fn.name)) {
        luaNodeIds.set(fn.name, nodeId);
      }
    }
  }

  return (elementType: string, reference: string): string | null => {
    switch (elementType) {
      case 'lorebook':
        return lorebookNodeIds.get(reference) ?? null;
      case 'regex':
        return `rx:${reference}`;
      case 'lua':
        return luaNodeIds.get(reference) ?? null;
      case 'variable':
        return `var:${reference}`;
      default:
        return null;
    }
  };
}
