import type { ElementCBSData, LorebookRegexCorrelation, PromptChainResult } from '@/domain';
import type { LorebookStructureResult } from '@/domain/lorebook/structure';
import type { Locale } from './i18n';
import { t } from './i18n';
import { buildDiagramPanel } from './view-model';
import type { VisualizationPanel } from './visualization-types';

/** 관계 네트워크(force-graph) builder 입력 데이터 */
export interface LorebookGraphData {
  lorebookStructure: LorebookStructureResult | null;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
  regexNodeNames?: string[];
}

/** lorebook/regex/variable 관계 네트워크 패널 생성 */
export function buildRelationshipNetworkPanel(
  panelId: string,
  data: LorebookGraphData,
  locale: Locale,
  section = 'structure',
): VisualizationPanel | null {
  if (!data.lorebookStructure || data.lorebookStructure.entries.length === 0) return null;

  const nodes: Array<{ id: string; label: string; type: string; color: string }> = [];
  const edges: Array<{ source: string; target: string; type: string; label?: string }> = [];

  /** 같은 source/target/type edge에 여러 상관 label을 집계한다. */
  function pushEdge(source: string, target: string, type: string, label?: string): void {
    edges.push({ source, target, type, label });
  }

  /** 변수 노드를 보장하고 노드 ID를 반환한다. */
  function ensureVariableNode(varName: string): string {
    const variableId = `var:${varName}`;
    nodes.push({ id: variableId, label: varName, type: 'variable', color: '#fbbf24' });
    return variableId;
  }

  /** writer → variable edge를 추가한다. */
  function pushVariableWriterEdge(writerId: string, varName: string): void {
    pushEdge(writerId, ensureVariableNode(varName), 'variable');
  }

  /** variable → reader edge를 추가한다. */
  function pushVariableReaderEdge(varName: string, readerId: string): void {
    pushEdge(ensureVariableNode(varName), readerId, 'variable');
  }

  // Build node lookup: canonical entry.name → node ID
  // This allows resolving any scoped/mangled elementName back to the correct node.
  const lbNodeIdMap = new Map<string, string>();
  const leafNameCounts = new Map<string, number>();
  for (const entry of data.lorebookStructure.entries) {
    leafNameCounts.set(entry.name, (leafNameCounts.get(entry.name) || 0) + 1);
  }

  // Build nodes from lorebook entries
  for (const entry of data.lorebookStructure.entries) {
    let color = '#60a5fa'; // normal
    if (entry.constant) color = '#f87171'; // always-active
    else if (entry.selective) color = '#34d399'; // selective
    const type = entry.constant ? 'always-active' : entry.selective ? 'selective' : 'normal';
    const scopedId = entry.id || entry.name;
    const nodeId = `lb:${scopedId}`;
    nodes.push({ id: nodeId, label: entry.name, type, color });
    lbNodeIdMap.set(scopedId, nodeId);
    lbNodeIdMap.set(scopedId.replace(/ /g, '_'), nodeId);
    if ((leafNameCounts.get(entry.name) || 0) === 1) {
      lbNodeIdMap.set(entry.name, nodeId);
      lbNodeIdMap.set(entry.name.replace(/ /g, '_'), nodeId);
    }
  }

  // Add regex script nodes. Graph should include every regex script, not only
  // the subset that happened to produce CBS read/write ops.
  const regexNodeNames = new Set<string>();
  for (const regex of data.regexCBS) regexNodeNames.add(regex.elementName);
  for (const regexName of data.regexNodeNames ?? []) regexNodeNames.add(regexName);
  for (const shared of data.lorebookRegexCorrelation.sharedVars) {
    for (const regexName of shared.regexScripts) regexNodeNames.add(regexName);
  }

  for (const regexName of regexNodeNames) {
    nodes.push({ id: `rx:${regexName}`, label: regexName, type: 'regex', color: '#a78bfa' });
  }

  const allVariableNames = new Set<string>();
  for (const element of data.lorebookCBS) {
    for (const varName of element.reads) allVariableNames.add(varName);
    for (const varName of element.writes) allVariableNames.add(varName);
  }
  for (const element of data.regexCBS) {
    for (const varName of element.reads) allVariableNames.add(varName);
    for (const varName of element.writes) allVariableNames.add(varName);
  }
  for (const shared of data.lorebookRegexCorrelation.sharedVars) {
    allVariableNames.add(shared.varName);
  }
  for (const varName of data.lorebookRegexCorrelation.lorebookOnlyVars) allVariableNames.add(varName);
  for (const varName of data.lorebookRegexCorrelation.regexOnlyVars) allVariableNames.add(varName);

  for (const varName of allVariableNames) ensureVariableNode(varName);

  // Edge type 1: keyword activation (entry A content → entry B activation key)
  for (const entryA of data.lorebookStructure.entries) {
    for (const entryB of data.lorebookStructure.entries) {
      if (entryA.id === entryB.id) continue;
      for (const keyword of entryB.keywords) {
        if (!keyword) continue;
        // Check if entryA's name or keywords could trigger entryB
        // We check keyword overlaps from the structure data
        const overlaps = data.lorebookStructure.keywords.overlaps;
        if (overlaps[keyword] && overlaps[keyword].includes(entryA.id) && overlaps[keyword].includes(entryB.id)) {
          pushEdge(`lb:${entryA.id}`, `lb:${entryB.id}`, 'keyword', keyword);
        }
      }
    }
  }

  /**
   * lorebookCBS elementName을 정확한 노드 ID로 변환한다.
   *
   * elementName은 폴더/module prefix가 포함된 scoped 이름이며
   * 공백이 `_`로 치환되어 있다(예: "📖_로어북/🎯_타겟_히로인").
   * 반면 노드 ID는 entry.name의 원본 공백을 유지한다(예: "lb:🎯 타겟 히로인").
   *
   * lbNodeIdMap에 canonical 이름과 `_` 치환 이름 모두 인덱싱해 두었으므로,
   * (1) `/` 기준 leaf segment 추출 → (2) map lookup으로 정확한 노드 ID를 찾는다.
   * lookup 실패 시 fallback으로 `_`→공백 복원 후 재시도한다.
   */
  function toLbNodeId(elementName: string): string | null {
    // Primary lookup: preserve full scoped path when available.
    const directMatch = lbNodeIdMap.get(elementName);
    if (directMatch) return directMatch;

    const restoredExact = elementName.replace(/_/g, ' ');
    const exactFallback = lbNodeIdMap.get(restoredExact);
    if (exactFallback) return exactFallback;

    const leafName = elementName.includes('/') ? elementName.split('/').pop()! : elementName;
    const leafMatch = lbNodeIdMap.get(leafName);
    if (leafMatch) return leafMatch;

    // Fallback: restore underscores to spaces and try the leaf name.
    const restored = leafName.replace(/_/g, ' ');
    const fallbackMatch = lbNodeIdMap.get(restored);
    if (fallbackMatch) return fallbackMatch;
    // No matching node found
    return null;
  }

  // Edge type 2: variable flow via explicit variable nodes.
  for (const lorebook of data.lorebookCBS) {
    const lorebookNodeId = toLbNodeId(lorebook.elementName);
    if (!lorebookNodeId) continue;
    for (const varName of lorebook.writes) {
      pushVariableWriterEdge(lorebookNodeId, varName);
    }
    for (const varName of lorebook.reads) {
      pushVariableReaderEdge(varName, lorebookNodeId);
    }
  }

  for (const regex of data.regexCBS) {
    const regexNodeId = `rx:${regex.elementName}`;
    for (const varName of regex.writes) {
      pushVariableWriterEdge(regexNodeId, varName);
    }
    for (const varName of regex.reads) {
      pushVariableReaderEdge(varName, regexNodeId);
    }
  }

  // Correlation metadata remains as a fallback when CBS detail is incomplete.
  // Connect each participating element directly to the variable node according to
  // the declared flow direction rather than generating pairwise LB×RX edges.
  for (const shared of data.lorebookRegexCorrelation.sharedVars) {
    const variableId = ensureVariableNode(shared.varName);

    const lorebookNodeIds = shared.lorebookEntries
      .map((entryName) => toLbNodeId(entryName))
      .filter((nodeId): nodeId is string => Boolean(nodeId));
    const regexNodeIds = shared.regexScripts.map((regexName) => `rx:${regexName}`);

    if (shared.direction === 'lorebook->regex' || shared.direction === 'bidirectional') {
      for (const lorebookNodeId of lorebookNodeIds) {
        pushEdge(lorebookNodeId, variableId, 'variable');
      }
      for (const regexNodeId of regexNodeIds) {
        pushEdge(variableId, regexNodeId, 'variable');
      }
    }

    if (shared.direction === 'regex->lorebook' || shared.direction === 'bidirectional') {
      for (const regexNodeId of regexNodeIds) {
        pushEdge(regexNodeId, variableId, 'variable');
      }
      for (const lorebookNodeId of lorebookNodeIds) {
        pushEdge(variableId, lorebookNodeId, 'variable');
      }
    }
  }

  // Dedupe edges while preserving all labels between the same nodes.
  const edgeMap = new Map<string, { source: string; target: string; type: string; labels: Set<string> }>();
  for (const edge of edges) {
    const key = `${edge.source}→${edge.target}:${edge.type}`;
    const existing = edgeMap.get(key);
    if (existing) {
      if (edge.label) existing.labels.add(edge.label);
      continue;
    }
    edgeMap.set(key, {
      source: edge.source,
      target: edge.target,
      type: edge.type,
      labels: new Set(edge.label ? [edge.label] : []),
    });
  }

  const uniqueEdges = [...edgeMap.values()].map((edge) => ({
    source: edge.source,
    target: edge.target,
    type: edge.type,
    label: edge.labels.size > 0 ? [...edge.labels].sort().join(' · ') : undefined,
  }));

  const nodeSet = new Set<string>();
  const uniqueNodes = nodes.filter((node) => {
    if (nodeSet.has(node.id)) return false;
    nodeSet.add(node.id);
    return true;
  });

  const panel = buildDiagramPanel(
    panelId,
    t(locale, 'module.panel.relationshipNetwork'),
    'force-graph',
    { nodes: uniqueNodes, edges: uniqueEdges },
    section,
    Math.max(420, Math.min(uniqueNodes.length * 40, 800)),
  );
  panel.description = t(locale, 'module.panel.relationshipNetworkDesc');
  return panel;
}

/**
 * 프롬프트 체인 의존성을 D3 force-graph로 시각화하는 패널을 빌드한다.
 */
export function buildPromptChainGraphPanel(
  panelId: string,
  promptChain: PromptChainResult,
  regexCBS: Array<{ elementName: string }>,
  locale: Locale,
  section = 'chain',
): VisualizationPanel | null {
  if (promptChain.chain.length < 2) return null;

  const nodes: Array<{ id: string; label: string; type: string; color: string }> = [];
  const edges: Array<{ source: string; target: string; type: string; label?: string }> = [];

  const typeColors: Record<string, string> = {
    prompt: '#60a5fa',
    template: '#34d399',
    system: '#f59e0b',
  };
  for (const link of promptChain.chain) {
    const color = typeColors[link.type] || '#60a5fa';
    nodes.push({
      id: `chain:${link.index}:${link.name}`,
      label: `${link.name} (${link.estimatedTokens}t)`,
      type: link.type,
      color: link.unsatisfiedDeps.length > 0 ? '#f87171' : color,
    });
  }

  for (const regex of regexCBS) {
    nodes.push({ id: `rx:${regex.elementName}`, label: regex.elementName, type: 'regex', color: '#a78bfa' });
  }

  for (let i = 1; i < promptChain.chain.length; i++) {
    const prev = promptChain.chain[i - 1];
    const curr = promptChain.chain[i];
    edges.push({
      source: `chain:${prev.index}:${prev.name}`,
      target: `chain:${curr.index}:${curr.name}`,
      type: 'chain',
    });
  }

  const writerMap = new Map<string, string>();
  for (const link of promptChain.chain) {
    const nodeId = `chain:${link.index}:${link.name}`;

    for (const dep of link.satisfiedDeps) {
      const writerId = writerMap.get(dep);
      if (writerId && writerId !== nodeId) {
        edges.push({ source: writerId, target: nodeId, type: 'satisfied', label: dep });
      }
    }

    for (const dep of link.unsatisfiedDeps) {
      const rxWriter = regexCBS.find((rx) => rx.elementName.includes(dep));
      if (rxWriter) {
        edges.push({ source: `rx:${rxWriter.elementName}`, target: nodeId, type: 'unsatisfied', label: dep });
      }
    }

    for (const dep of link.satisfiedDeps) {
      writerMap.set(dep, nodeId);
    }
  }

  const edgeSet = new Set<string>();
  const uniqueEdges = edges.filter((edge) => {
    const key = `${edge.source}→${edge.target}:${edge.type}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  const panel = buildDiagramPanel(
    panelId,
    t(locale, 'preset.panel.chainDepGraph'),
    'force-graph',
    { nodes, edges: uniqueEdges },
    section,
    Math.max(420, Math.min(nodes.length * 50, 800)),
  );
  panel.description = t(locale, 'preset.panel.chainDepGraphDesc');
  return panel;
}
