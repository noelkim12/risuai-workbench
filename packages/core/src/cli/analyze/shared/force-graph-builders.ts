import type { ElementCBSData, LorebookActivationChainResult, LorebookRegexCorrelation, PromptChainResult, RegexScriptInfo } from '@/domain';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import type { TextMentionEdge } from '@/domain/analyze/text-mention';
import type { LorebookStructureResult } from '@/domain/lorebook/structure';
import type { Locale } from './i18n';
import { t } from './i18n';
import { buildDiagramPanel } from './view-model';
import type { VisualizationPanel } from './visualization-types';

/** 관계 네트워크(force-graph) builder 입력 데이터 */
export interface LorebookGraphData {
  lorebookStructure: LorebookStructureResult | null;
  lorebookActivationChain?: LorebookActivationChainResult | null;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
  regexNodeNames?: string[];
  regexScriptInfos?: RegexScriptInfo[];
  luaArtifacts?: LuaAnalysisArtifact[];
  textMentions?: TextMentionEdge[];
}

/** lorebook/regex/variable 관계 네트워크 패널 생성 */
export function buildRelationshipNetworkPanel(
  panelId: string,
  data: LorebookGraphData,
  locale: Locale,
  section = 'structure',
): VisualizationPanel | null {
  if (!data.lorebookStructure || data.lorebookStructure.entries.length === 0) return null;

  const lorebookActivationEntries = new Map(
    (data.lorebookActivationChain?.entries ?? []).flatMap((entry) => [
      [entry.id, entry] as const,
      [entry.name, entry] as const,
    ]),
  );
  const regexScriptInfos = new Map((data.regexScriptInfos ?? []).map((script) => [script.name, script] as const));
  const lorebookUsage = buildElementUsageMap(data.lorebookCBS);
  const regexUsage = buildElementUsageMap(data.regexCBS);
  const variableDetails = new Map<string, { readers: Set<string>; writers: Set<string> }>();
  const variableNodeIndex = new Map<string, number>();

  const nodes: Array<{ id: string; label: string; type: string; color: string; details?: Record<string, string> }> = [];
  const edges: Array<{ source: string; target: string; type: string; label?: string }> = [];
  const luaFunctionNodeIds = new Map<string, string>();
  const triggerNodeIds = new Set<string>();

  /** 같은 source/target/type edge에 여러 상관 label을 집계한다. */
  function pushEdge(source: string, target: string, type: string, label?: string): void {
    edges.push({ source, target, type, label });
  }

  /** 변수 노드를 보장하고 노드 ID를 반환한다. */
  function ensureVariableNode(varName: string): string {
    const variableId = `var:${varName}`;
    const detail = variableDetails.get(varName);
    const node = {
      id: variableId,
      label: varName,
      type: 'variable',
      color: '#fbbf24',
      details: {
        Variable: varName,
        Readers: detail && detail.readers.size > 0 ? [...detail.readers].sort().join(', ') : '',
        Writers: detail && detail.writers.size > 0 ? [...detail.writers].sort().join(', ') : '',
      },
    };
    const existingIndex = variableNodeIndex.get(variableId);
    if (existingIndex !== undefined) {
      nodes[existingIndex] = node;
      return variableId;
    }
    variableNodeIndex.set(variableId, nodes.length);
    nodes.push(node);
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

  function registerVariableReader(varName: string, label: string): void {
    const detail = variableDetails.get(varName) ?? { readers: new Set<string>(), writers: new Set<string>() };
    detail.readers.add(label);
    variableDetails.set(varName, detail);
  }

  function registerVariableWriter(varName: string, label: string): void {
    const detail = variableDetails.get(varName) ?? { readers: new Set<string>(), writers: new Set<string>() };
    detail.writers.add(label);
    variableDetails.set(varName, detail);
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
    nodes.push({
      id: nodeId,
      label: entry.name,
      type,
      color,
      details: {
        Name: entry.name,
        Id: scopedId,
        Keywords: entry.keywords?.length ? entry.keywords.join(', ') : '',
        Activation: entry.constant ? 'Constant' : entry.selective ? 'Selective' : 'Normal',
        ...buildLorebookDetails(scopedId, entry.name, lorebookActivationEntries, lorebookUsage),
      },
    });
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
    nodes.push({
      id: `rx:${regexName}`,
      label: regexName,
      type: 'regex',
      color: '#a78bfa',
      details: buildRegexDetails(regexName, regexScriptInfos.get(regexName), regexUsage),
    });
  }

  for (const entry of data.lorebookStructure.entries) {
    if (!entry.keywords || entry.keywords.length === 0) continue;
    for (const keyword of entry.keywords) {
      if (!keyword) continue;
      const triggerId = `trig:${keyword}`;
      if (!triggerNodeIds.has(triggerId)) {
        triggerNodeIds.add(triggerId);
        nodes.push({ id: triggerId, label: `🔑 ${keyword}`, type: 'trigger-keyword', color: '#f43f5e', details: { Trigger: keyword } });
      }
      pushEdge(triggerId, `lb:${entry.id || entry.name}`, 'keyword', 'activate');
    }
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

  // Edge type 1: lorebook activation chains. Prefer dedicated chain analysis when available;
  // otherwise fall back to legacy keyword-overlap hints.
  if (data.lorebookActivationChain && data.lorebookActivationChain.edges.length > 0) {
    for (const edge of data.lorebookActivationChain.edges) {
      if (edge.status === 'blocked') continue;
      const edgeType = 'activation-chain';
      const labelParts = [
        ...edge.matchedKeywords,
        ...edge.matchedSecondaryKeywords,
      ];
      if (edge.status === 'partial' && edge.missingSecondaryKeywords.length > 0) {
        labelParts.push(`missing: ${edge.missingSecondaryKeywords.join(', ')}`);
      }
      pushEdge(`lb:${edge.sourceId}`, `lb:${edge.targetId}`, edgeType, labelParts.join(' · '));
    }
  } else {
    for (const entryA of data.lorebookStructure.entries) {
      for (const entryB of data.lorebookStructure.entries) {
        if (entryA.id === entryB.id) continue;
        for (const keyword of entryB.keywords) {
          if (!keyword) continue;
          const overlaps = data.lorebookStructure.keywords.overlaps;
          if (overlaps[keyword] && overlaps[keyword].includes(entryA.id) && overlaps[keyword].includes(entryB.id)) {
            pushEdge(`lb:${entryA.id}`, `lb:${entryB.id}`, 'keyword', keyword);
          }
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

  /** Lua 함수 이름을 관계 네트워크 노드 ID로 변환한다. */
  function toLuaFunctionNodeId(baseName: string, functionName: string | null): string | null {
    if (!functionName || functionName === '<top-level>') return null;
    return luaFunctionNodeIds.get(`${baseName}:${functionName}`) || null;
  }

  // Edge type 2: variable flow via explicit variable nodes.
  for (const lorebook of data.lorebookCBS) {
    const lorebookNodeId = toLbNodeId(lorebook.elementName);
    if (!lorebookNodeId) continue;
    for (const varName of lorebook.writes) {
      registerVariableWriter(varName, displayLeafName(lorebook.elementName));
      pushVariableWriterEdge(lorebookNodeId, varName);
    }
    for (const varName of lorebook.reads) {
      registerVariableReader(varName, displayLeafName(lorebook.elementName));
      pushVariableReaderEdge(varName, lorebookNodeId);
    }
  }

  for (const regex of data.regexCBS) {
    const regexNodeId = `rx:${regex.elementName}`;
    for (const varName of regex.writes) {
      registerVariableWriter(varName, regex.elementName);
      pushVariableWriterEdge(regexNodeId, varName);
    }
    for (const varName of regex.reads) {
      registerVariableReader(varName, regex.elementName);
      pushVariableReaderEdge(varName, regexNodeId);
    }
  }

  // Edge type 3: Lua function nodes connected via shared state variables.
  // Only function nodes enter the main relationship network; Lua files/variables do NOT.
  for (const artifact of data.luaArtifacts ?? []) {
    for (const fn of artifact.collected.functions) {
      const fnId = `lua-fn:${artifact.baseName}:${fn.name}`;
      const normalizedName = String(fn.name || '').toLowerCase();
      const isCore = ['listenedit', 'onoutput', 'oninput', 'onbuttonclick'].includes(normalizedName);
      nodes.push({
        id: fnId,
        label: fn.displayName,
        type: isCore ? 'lua-function-core' : 'lua-function',
        color: isCore ? '#ec4899' : '#2dd4bf',
        details: {
          File: artifact.baseName,
          Function: fn.displayName,
          'Line range': `${fn.startLine}-${fn.endLine}`,
          Params: fn.params.length > 0 ? fn.params.join(', ') : '(none)',
          APIs: fn.apiNames.size > 0 ? [...fn.apiNames].sort().join(', ') : '',
          'Expected vars': formatExpectedVars(fn.stateReads, fn.stateWrites),
          Reads: [...fn.stateReads].join(', '),
          Writes: [...fn.stateWrites].join(', '),
          Body: extractLuaFunctionBody(artifact, fn.startLine, fn.endLine),
        },
      });
      luaFunctionNodeIds.set(`${artifact.baseName}:${fn.name}`, fnId);
      for (const varName of fn.stateReads) {
        registerVariableReader(varName, fn.displayName);
        ensureVariableNode(varName);
        pushEdge(`var:${varName}`, fnId, 'variable');
      }
      for (const varName of fn.stateWrites) {
        registerVariableWriter(varName, fn.displayName);
        ensureVariableNode(varName);
        pushEdge(fnId, `var:${varName}`, 'variable');
      }
    }
  }

  // Edge type 4: direct Lua lore access via getLoreBooks exact-name lookup.
  for (const artifact of data.luaArtifacts ?? []) {
    const loreApiCalls = artifact.lorebookCorrelation?.loreApiCalls ?? [];
    for (const call of loreApiCalls) {
      if (call.apiName !== 'getLoreBooks' || !call.keyword) continue;
      const luaNodeId = toLuaFunctionNodeId(artifact.baseName, call.containingFunction);
      const lorebookNodeId = toLbNodeId(call.keyword);
      if (!luaNodeId || !lorebookNodeId) continue;
      pushEdge(luaNodeId, lorebookNodeId, 'lore-direct', call.keyword);
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

  // Edge type 5: Text Mentions (lorebook entry text → variable / lua function)
  for (const mention of data.textMentions ?? []) {
    const lbNodeId = toLbNodeId(mention.sourceEntry);
    if (!lbNodeId) continue;

    if (mention.type === 'variable-mention') {
      const varNodeId = ensureVariableNode(mention.target);
      pushEdge(lbNodeId, varNodeId, 'text-mention');
    } else if (mention.type === 'lua-mention') {
      for (const [key, fnId] of luaFunctionNodeIds.entries()) {
        if (key.endsWith(`:${mention.target}`)) {
          pushEdge(lbNodeId, fnId, 'text-mention');
        }
      }
    }
  }

  // Edge type 6: Lua function internal call flow
  for (const artifact of data.luaArtifacts ?? []) {
    for (const [caller, callees] of artifact.analyzePhase.callGraph.entries()) {
      const callerNodeId = toLuaFunctionNodeId(artifact.baseName, caller);
      if (!callerNodeId) continue;

      for (const callee of callees) {
        let calleeNodeId: string | null = null;
        for (const [key, fnId] of luaFunctionNodeIds.entries()) {
          if (key.endsWith(`:${callee}`)) {
            calleeNodeId = fnId;
            break;
          }
        }

        if (calleeNodeId) {
          pushEdge(callerNodeId, calleeNodeId, 'lua-call');
        }
      }
    }
  }

  for (const varName of allVariableNames) ensureVariableNode(varName);

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

type ElementUsage = {
  reads: Set<string>;
  writes: Set<string>;
};

function buildElementUsageMap(elements: ElementCBSData[]): Map<string, ElementUsage> {
  const usage = new Map<string, ElementUsage>();
  for (const element of elements) {
    const current = usage.get(element.elementName) ?? { reads: new Set<string>(), writes: new Set<string>() };
    for (const value of element.reads) current.reads.add(value);
    for (const value of element.writes) current.writes.add(value);
    usage.set(element.elementName, current);
  }
  return usage;
}

function buildLorebookDetails(
  scopedId: string,
  name: string,
  activationEntries: Map<string, NonNullable<LorebookGraphData['lorebookActivationChain']>['entries'][number]>,
  usage: Map<string, ElementUsage>,
): Record<string, string> {
  const activation = activationEntries.get(scopedId) ?? activationEntries.get(name);
  const entryUsage = usage.get(scopedId) ?? usage.get(name);
  return {
    'Secondary keywords': activation?.secondaryKeywords?.length ? activation.secondaryKeywords.join(', ') : '',
    Content: activation?.content ?? '',
    'Expected vars': formatExpectedVars(entryUsage?.reads, entryUsage?.writes),
    Reads: entryUsage?.reads.size ? [...entryUsage.reads].sort().join(', ') : '',
    Writes: entryUsage?.writes.size ? [...entryUsage.writes].sort().join(', ') : '',
  };
}

function buildRegexDetails(
  name: string,
  scriptInfo: RegexScriptInfo | undefined,
  usage: Map<string, ElementUsage>,
): Record<string, string> {
  const entryUsage = usage.get(name);
  return {
    Name: name,
    In: scriptInfo?.in ?? '',
    Out: scriptInfo?.out ?? '',
    'Expected vars': formatExpectedVars(entryUsage?.reads, entryUsage?.writes),
    Reads: entryUsage?.reads.size ? [...entryUsage.reads].sort().join(', ') : '',
    Writes: entryUsage?.writes.size ? [...entryUsage.writes].sort().join(', ') : '',
  };
}

function formatExpectedVars(reads?: Set<string>, writes?: Set<string>): string {
  const values = new Set<string>();
  for (const value of reads ?? []) values.add(value);
  for (const value of writes ?? []) values.add(value);
  return values.size > 0 ? [...values].sort().join(', ') : '';
}

function extractLuaFunctionBody(artifact: LuaAnalysisArtifact, startLine: number, endLine: number): string {
  const source = artifact.sourceText;
  if (!source) return '';
  const lines = source.split('\n');
  return lines.slice(Math.max(startLine - 1, 0), Math.max(endLine, startLine - 1)).join('\n').trim();
}

function displayLeafName(value: string): string {
  return value.includes('/') ? value.split('/').pop() || value : value;
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
