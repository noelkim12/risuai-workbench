import type {
  ElementCBSData,
  LorebookActivationChainResult,
  LorebookRegexCorrelation,
  PromptChainResult,
  RegexScriptInfo,
  UnifiedVarEntry,
} from '@/domain';
import { buildElementPairCorrelationFromUnifiedGraph } from '@/domain';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import type { TextMentionEdge } from '@/domain/analyze/text-mention';
import type { LorebookStructureResult } from '@/domain/lorebook/structure';
import type { Locale } from './i18n';
import { t } from './i18n';
import { buildDiagramPanel } from './view-model';
import type {
  ForceGraphEdge,
  ForceGraphGroup,
  ForceGraphNode,
  ForceGraphPayload,
  VisualizationPanel,
} from './visualization-types';

/** 관계 네트워크(force-graph) builder 입력 데이터 */
export interface LorebookGraphData {
  lorebookStructure: LorebookStructureResult | null;
  lorebookActivationChain?: LorebookActivationChainResult | null;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  unifiedGraph?: Map<string, UnifiedVarEntry>;
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
  regexNodeNames?: string[];
  regexScriptInfos?: RegexScriptInfo[];
  luaArtifacts?: LuaAnalysisArtifact[];
  textMentions?: TextMentionEdge[];
}

const DIRECT_LORE_ACCESS_API_NAMES = new Set([
  'getLoreBooks',
  'getLoreBooksMain',
  'upsertLocalLoreBook',
]);
const BULK_LORE_LOAD_API_NAMES = new Set(['loadLoreBooks', 'loadLoreBooksMain']);

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
  const regexScriptInfos = new Map(
    (data.regexScriptInfos ?? []).map((script) => [script.name, script] as const),
  );
  const lorebookUsage = buildElementUsageMap(data.lorebookCBS);
  const regexUsage = buildElementUsageMap(data.regexCBS);
  const variableDetails = new Map<string, { readers: Set<string>; writers: Set<string> }>();
  const variableNodeIndex = new Map<string, number>();

  const nodes: ForceGraphNode[] = [];
  const edges: ForceGraphEdge[] = [];
  const luaFunctionNodeIds = new Map<string, string>();
  const luaFunctionDisplayNodeIds = new Map<string, string[]>();
  const luaArtifactFunctionNodeIds = new Map<string, string[]>();
  const triggerNodeIds = new Set<string>();

  /** 같은 source/target/type edge에 여러 상관 label을 집계한다. */
  function pushEdge(source: string, target: string, type: string, label?: string): void {
    edges.push({ source, target, type, label });
  }

  /** 변수 노드를 보장하고 노드 ID를 반환한다. */
  function ensureVariableNode(varName: string): string {
    const variableId = `var:${varName}`;
    const detail = variableDetails.get(varName);
    const node: ForceGraphNode = {
      id: variableId,
      label: varName,
      type: 'variable',
      color: '#fbbf24',
      layoutBand: 'variable',
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
    const detail = variableDetails.get(varName) ?? {
      readers: new Set<string>(),
      writers: new Set<string>(),
    };
    detail.readers.add(label);
    variableDetails.set(varName, detail);
  }

  function registerVariableWriter(varName: string, label: string): void {
    const detail = variableDetails.get(varName) ?? {
      readers: new Set<string>(),
      writers: new Set<string>(),
    };
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
  const LORE_NODE_COLORS: Record<string, string> = {
    constant: '#f87171', // red — always active
    keyword: '#60a5fa', // blue — single-key OR matching
    keywordMulti: '#34d399', // green — primary + secondary AND matching
    referenceOnly: '#94a3b8', // slate — no keys, reference-only (passive)
  };
  const LORE_ACTIVATION_LABELS: Record<string, string> = {
    constant: 'Always active',
    keyword: 'Keyword',
    keywordMulti: 'Keyword (multi-key)',
    referenceOnly: 'Reference-only',
  };
  const groupOrder = new Map<string, number>();
  const groups: ForceGraphGroup[] = [];
  let layoutRankCounter = 0;

  function registerFolderGroup(folderPath: string): string {
    const groupId = `folder:${folderPath}`;
    if (!groupOrder.has(groupId)) {
      groupOrder.set(groupId, groups.length);
      groups.push({
        id: groupId,
        kind: 'lorebook-folder',
        label: folderPath,
        order: groups.length,
      });
    }
    return groupId;
  }

  for (const entry of data.lorebookStructure.entries) {
    const mode = entry.activationMode;
    const color = LORE_NODE_COLORS[mode] ?? '#60a5fa';
    const scopedId = entry.id || entry.name;
    const nodeId = `lb:${scopedId}`;
    const folderPath = entry.folder || null;
    const hasFolderGroup = typeof folderPath === 'string' && folderPath.length > 0;
    const groupId = hasFolderGroup ? registerFolderGroup(folderPath) : undefined;
    nodes.push({
      id: nodeId,
      label: entry.name,
      type: mode,
      color,
      ...(groupId && hasFolderGroup
        ? {
            groupId,
            groupKind: 'lorebook-folder' as const,
            groupLabel: folderPath,
          }
        : {}),
      layoutBand: 'lorebook',
      layoutRank: layoutRankCounter++,
      details: {
        Name: entry.name,
        Id: scopedId,
        Keywords: entry.keywords?.length ? entry.keywords.join(', ') : '',
        Activation: LORE_ACTIVATION_LABELS[mode] ?? mode,
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
      layoutBand: 'regex',
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
        nodes.push({
          id: triggerId,
          label: `🔑 ${keyword}`,
          type: 'trigger-keyword',
          color: '#f43f5e',
          layoutBand: 'trigger',
          layoutRank: layoutRankCounter++,
          details: { Trigger: keyword },
        });
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
  for (const varName of data.lorebookRegexCorrelation.lorebookOnlyVars)
    allVariableNames.add(varName);
  for (const varName of data.lorebookRegexCorrelation.regexOnlyVars) allVariableNames.add(varName);

  // Edge type 1: lorebook activation chains. Prefer dedicated chain analysis when available;
  // otherwise fall back to legacy keyword-overlap hints.
  if (data.lorebookActivationChain && data.lorebookActivationChain.edges.length > 0) {
    for (const edge of data.lorebookActivationChain.edges) {
      if (edge.status === 'blocked') continue;
      const edgeType = 'activation-chain';
      const labelParts = [...edge.matchedKeywords, ...edge.matchedSecondaryKeywords];
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
          if (
            overlaps[keyword] &&
            overlaps[keyword].includes(entryA.id) &&
            overlaps[keyword].includes(entryB.id)
          ) {
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
    return (
      luaFunctionNodeIds.get(`${baseName}:${functionName}`) ??
      [...luaFunctionNodeIds.entries()].find(
        ([key]) => key === `${baseName}:${functionName}` || key.endsWith(`:${functionName}`),
      )?.[1] ??
      null
    );
  }

  /**
   * resolveLuaFunctionNodeIds 함수.
   * unified graph에서 온 Lua 함수 표시 이름을 관계 네트워크 노드 ID 목록으로 변환함.
   *
   * @param functionName - unified graph readers/writers에 기록된 Lua 함수 표시 이름
   * @returns 매칭된 Lua 함수 노드 ID 목록
   */
  function resolveLuaFunctionNodeIds(functionName: string): string[] {
    return luaFunctionDisplayNodeIds.get(functionName) ?? [];
  }

  /**
   * resolveLuaBridgeNodeIds 함수.
   * unified graph의 Lua element label(baseName 또는 displayName)을 실제 함수 노드 ID로 변환함.
   *
   * @param labels - unified graph에 기록된 Lua source label 목록
   * @param varName - bridge를 만드는 변수 이름
   * @param access - 해당 side에서 필요한 접근 타입(read/write)
   * @returns bridge edge에 사용할 Lua 함수 노드 ID 목록
   */
  function resolveLuaBridgeNodeIds(
    labels: string[],
    varName: string,
    access: 'read' | 'write' | 'any',
  ): string[] {
    const resolved = new Set<string>();

    for (const label of labels) {
      for (const nodeId of resolveLuaFunctionNodeIds(label)) {
        resolved.add(nodeId);
      }

      const artifact = (data.luaArtifacts ?? []).find((item) => item.baseName === label);
      if (!artifact) {
        continue;
      }

      const matchingNodeIds = artifact.collected.functions
        .filter((fn) =>
          access === 'read'
            ? fn.stateReads.has(varName)
            : access === 'write'
              ? fn.stateWrites.has(varName)
              : fn.stateReads.has(varName) || fn.stateWrites.has(varName),
        )
        .map((fn) => toLuaFunctionNodeId(artifact.baseName, fn.name))
        .filter((nodeId): nodeId is string => Boolean(nodeId));

      const fallbackNodeIds = luaArtifactFunctionNodeIds.get(artifact.baseName) ?? [];
      for (const nodeId of matchingNodeIds.length > 0 ? matchingNodeIds : fallbackNodeIds) {
        resolved.add(nodeId);
      }
    }

    return [...resolved];
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
      const isCore = ['listenedit', 'onoutput', 'oninput', 'onbuttonclick'].includes(
        normalizedName,
      );
      nodes.push({
        id: fnId,
        label: fn.displayName,
        type: isCore ? 'lua-function-core' : 'lua-function',
        color: isCore ? '#ec4899' : '#2dd4bf',
        layoutBand: 'lua',
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
      const existingDisplayIds = luaFunctionDisplayNodeIds.get(fn.displayName) ?? [];
      existingDisplayIds.push(fnId);
      luaFunctionDisplayNodeIds.set(fn.displayName, existingDisplayIds);
      const existingArtifactIds = luaArtifactFunctionNodeIds.get(artifact.baseName) ?? [];
      existingArtifactIds.push(fnId);
      luaArtifactFunctionNodeIds.set(artifact.baseName, existingArtifactIds);
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

  /**
   * pushPairBridgeEdges 함수.
   * unified graph pair correlation을 direct bridge edge로 relationship-network에 투영함.
   *
   * @param leftType - 상관관계 좌측 element type
   * @param rightType - 상관관계 우측 element type
   * @param edgeType - force-graph edge type
   */
  function pushPairBridgeEdges(leftType: string, rightType: string, edgeType: string): void {
    if (!data.unifiedGraph) return;

    const correlation = buildElementPairCorrelationFromUnifiedGraph(
      data.unifiedGraph,
      leftType,
      rightType,
    );

    const resolveNodeIds = (elementType: string, labels: string[]): string[] => {
      if (elementType === 'lorebook') {
        return labels
          .map((label) => toLbNodeId(label))
          .filter((nodeId): nodeId is string => Boolean(nodeId));
      }
      if (elementType === 'regex') {
        return labels.map((label) => `rx:${label}`);
      }
      return [];
    };

    for (const sharedVar of correlation.sharedVars) {
      const leftNodeIds =
        leftType === 'lua'
          ? resolveLuaBridgeNodeIds(
              sharedVar.leftElements,
              sharedVar.varName,
              sharedVar.direction === 'bidirectional'
                ? 'any'
                : sharedVar.direction === `${rightType}->${leftType}`
                  ? 'read'
                  : 'write',
            )
          : resolveNodeIds(leftType, sharedVar.leftElements);
      const rightNodeIds =
        rightType === 'lua'
          ? resolveLuaBridgeNodeIds(
              sharedVar.rightElements,
              sharedVar.varName,
              sharedVar.direction === 'bidirectional'
                ? 'any'
                : sharedVar.direction === `${leftType}->${rightType}`
                  ? 'read'
                  : 'write',
            )
          : resolveNodeIds(rightType, sharedVar.rightElements);

      if (sharedVar.direction === `${leftType}->${rightType}` || sharedVar.direction === 'bidirectional') {
        for (const leftNodeId of leftNodeIds) {
          for (const rightNodeId of rightNodeIds) {
            if (leftNodeId === rightNodeId) continue;
            pushEdge(leftNodeId, rightNodeId, edgeType, sharedVar.varName);
          }
        }
      }

      if (sharedVar.direction === `${rightType}->${leftType}` || sharedVar.direction === 'bidirectional') {
        for (const rightNodeId of rightNodeIds) {
          for (const leftNodeId of leftNodeIds) {
            if (leftNodeId === rightNodeId) continue;
            pushEdge(rightNodeId, leftNodeId, edgeType, sharedVar.varName);
          }
        }
      }
    }
  }

  pushPairBridgeEdges('lorebook', 'lua', 'lb-lua-bridge');
  pushPairBridgeEdges('lua', 'regex', 'lua-regex-bridge');

  // Edge type 4: Lua lore access via exact-name lookups, upserts, or bulk-load APIs.
  for (const artifact of data.luaArtifacts ?? []) {
    const loreApiCalls = artifact.lorebookCorrelation?.loreApiCalls ?? [];
    for (const call of loreApiCalls) {
      const luaNodeId = toLuaFunctionNodeId(artifact.baseName, call.containingFunction);
      if (!luaNodeId) continue;

      if (call.keyword && DIRECT_LORE_ACCESS_API_NAMES.has(call.apiName)) {
        const lorebookNodeId = toLbNodeId(call.keyword);
        if (!lorebookNodeId) continue;
        pushEdge(luaNodeId, lorebookNodeId, 'lore-direct', call.keyword);
        continue;
      }

      if (BULK_LORE_LOAD_API_NAMES.has(call.apiName)) {
        for (const entry of data.lorebookStructure.entries) {
          pushEdge(luaNodeId, `lb:${entry.id || entry.name}`, 'lore-direct', call.apiName);
        }
      }
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
    } else if (mention.type === 'lorebook-mention') {
      const targetNodeId = toLbNodeId(mention.target);
      if (targetNodeId && targetNodeId !== lbNodeId) {
        pushEdge(lbNodeId, targetNodeId, 'text-mention');
      }
    }
  }

  // Edge type 6: Lua function internal call flow
  for (const artifact of data.luaArtifacts ?? []) {
    for (const [caller, callees] of artifact.analyzePhase.callGraph.entries()) {
      const callerNodeId = toLuaFunctionNodeId(artifact.baseName, caller);
      if (!callerNodeId) continue;

      for (const callee of callees) {
        const calleeNodeId = toLuaFunctionNodeId(artifact.baseName, callee);

        if (calleeNodeId) {
          pushEdge(callerNodeId, calleeNodeId, 'lua-call');
        }
      }
    }
  }

  for (const varName of allVariableNames) ensureVariableNode(varName);

  // Dedupe edges while preserving all labels between the same nodes.
  const edgeMap = new Map<
    string,
    { source: string; target: string; type: string; labels: Set<string> }
  >();
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

  const payload: ForceGraphPayload = {
    nodes: uniqueNodes,
    edges: uniqueEdges,
    groups,
    layout: {
      strategy: 'grouped-deterministic-v1',
      signatureSalt: 'relationship-network-v1',
    },
  };

  const panel = buildDiagramPanel(
    panelId,
    t(locale, 'module.panel.relationshipNetwork'),
    'force-graph',
    payload,
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
    const current = usage.get(element.elementName) ?? {
      reads: new Set<string>(),
      writes: new Set<string>(),
    };
    for (const value of element.reads) current.reads.add(value);
    for (const value of element.writes) current.writes.add(value);
    usage.set(element.elementName, current);
  }
  return usage;
}

function buildLorebookDetails(
  scopedId: string,
  name: string,
  activationEntries: Map<
    string,
    NonNullable<LorebookGraphData['lorebookActivationChain']>['entries'][number]
  >,
  usage: Map<string, ElementUsage>,
): Record<string, string> {
  const activation = activationEntries.get(scopedId) ?? activationEntries.get(name);
  const entryUsage = usage.get(scopedId) ?? usage.get(name);
  return {
    'Secondary keywords': activation?.secondaryKeywords?.length
      ? activation.secondaryKeywords.join(', ')
      : '',
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

function extractLuaFunctionBody(
  artifact: LuaAnalysisArtifact,
  startLine: number,
  endLine: number,
): string {
  const source = artifact.sourceText;
  if (!source) return '';
  const lines = source.split('\n');
  return lines
    .slice(Math.max(startLine - 1, 0), Math.max(endLine, startLine - 1))
    .join('\n')
    .trim();
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
    nodes.push({
      id: `rx:${regex.elementName}`,
      label: regex.elementName,
      type: 'regex',
      color: '#a78bfa',
    });
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
        edges.push({
          source: `rx:${rxWriter.elementName}`,
          target: nodeId,
          type: 'unsatisfied',
          label: dep,
        });
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
