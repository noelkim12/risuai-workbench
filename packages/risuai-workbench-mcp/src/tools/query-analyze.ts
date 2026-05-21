/**
 * Read-only analyze / impact query tool handlers.
 * @file packages/risuai-workbench-mcp/src/tools/query-analyze.ts
 */

import { readFile } from 'node:fs/promises';

import {
  analyzeComposition,
  analyzeLuaSource,
  analyzePromptChain,
  analyzeTokenBudget,
  analyzeVariableFlow,
  detectDeadCode,
  type ArtifactInput,
  type ElementCBSData,
  type LorebookEntryInfo,
  type RegexScriptInfo,
  type TokenComponent,
} from 'risu-workbench-core';

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type DiagnosticEnvelopeStatus, type WorkbenchDiagnostic } from '../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../project/resolve-root';
import { resolveSafeWorkspacePath } from '../project/safe-path';
import { type AnalyzeSnapshotInput, type AnalyzeSnapshotMetadata, resolveAnalyzeSnapshot } from '../analyze/snapshot';

interface ElementInput {
  elementName: string;
  elementType: string;
  executionOrder?: number;
  reads?: readonly string[];
  writes?: readonly string[];
}

interface ArtifactAnalyzeInput {
  defaultVariables?: Record<string, string>;
  elements?: readonly ElementInput[];
  lorebookKeywords?: Record<string, string[]>;
  name: string;
  namespace?: string;
  regexPatterns?: Array<{ in: string; name: string; order?: number }>;
  type: 'charx' | 'module' | 'preset';
}

interface QueryAnalyzeBaseInput extends AnalyzeSnapshotInput {}

export interface QueryVariableFlowInput extends QueryAnalyzeBaseInput {
  defaultVariables?: Record<string, string>;
  elements?: readonly ElementInput[];
}

export interface QueryVariableInput extends QueryVariableFlowInput {
  variableName: string;
}

export interface QueryLuaInput extends QueryAnalyzeBaseInput {
  charxData?: Record<string, unknown> | null;
  filePath?: string;
}

export interface QueryDeadCodeFindingsInput extends QueryVariableFlowInput {
  lorebookEntries?: readonly LorebookEntryInfo[];
  regexScripts?: readonly RegexScriptInfo[];
}

export interface QueryRelationshipNetworkInput extends QueryAnalyzeBaseInput {
  elements?: readonly ElementInput[];
  luaSources?: readonly QueryLuaInput[];
}

export interface QueryPromptChainInput extends QueryAnalyzeBaseInput {
  templates: Array<{ name: string; text: string; type: string }>;
}

export interface QueryCompositionConflictsInput extends QueryAnalyzeBaseInput {
  charx?: ArtifactAnalyzeInput;
  modules?: readonly ArtifactAnalyzeInput[];
  preset?: ArtifactAnalyzeInput;
}

export interface QueryTokenBudgetInput extends QueryAnalyzeBaseInput {
  components: readonly TokenComponent[];
}

type EnvelopeData = Record<string, unknown> & { snapshot: AnalyzeSnapshotMetadata };

interface NormalizedLuaHandler {
  detail: string | null;
  functionName: string | null;
  isAsync: boolean;
  line: number;
  type: string;
}

/**
 * handleQueryVariableFlow 함수.
 * core variable-flow analyzer 결과를 snapshot metadata와 함께 반환함.
 *
 * @param input - variable-flow query 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 변수 흐름 JSON view
 */
export async function handleQueryVariableFlow(input: QueryVariableFlowInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const elements = toElementCBSData(input.elements ?? []);
  const defaultVariables = input.defaultVariables ?? {};
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, { defaultVariables, elements: input.elements ?? [] });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_variable_flow', 'domain_error', snapshot.diagnostics);

  const result = analyzeVariableFlow(elements, defaultVariables);
  return createQueryEnvelope('workbench.query_variable_flow', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    snapshot: snapshot.snapshot,
    variables: result.variables,
    summary: result.summary,
  });
}

/**
 * handleQueryVariable 함수.
 * 단일 변수의 readers/writers/events/issues view를 반환함.
 *
 * @param input - variable name과 variable-flow 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 단일 변수 JSON view
 */
export async function handleQueryVariable(input: QueryVariableInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const flow = await handleQueryVariableFlow(input, workspace);
  if (!flow.data) return { ...flow, tool: 'workbench.query_variable' };

  const data = flow.data as EnvelopeData & { variables?: Array<{ events: Array<{ action: string; elementName: string }>; issues: unknown[]; varName: string }> };
  const variable = (data.variables ?? []).find((entry) => entry.varName === input.variableName) ?? null;
  const readers = variable?.events.filter((event) => event.action === 'read').map((event) => event.elementName) ?? [];
  const writers = variable?.events.filter((event) => event.action === 'write').map((event) => event.elementName) ?? [];
  const diagnostics = variable ? flow.diagnostics : [...flow.diagnostics, createMissingVariableDiagnostic(input.variableName)];
  const status = variable ? flow.status : 'domain_warning';

  return createDiagnosticEnvelope({
    data: {
      exists: Boolean(variable),
      readers,
      snapshot: data.snapshot,
      variable,
      variableName: input.variableName,
      writers,
    },
    diagnostics,
    status,
    tool: 'workbench.query_variable',
  });
}

/**
 * handleQueryLuaCallGraph 함수.
 * Lua source를 core analyzer로 분석하고 call graph를 JSON-friendly 배열로 반환함.
 *
 * @param input - Lua source 또는 sourcePath 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 Lua call graph view
 */
export async function handleQueryLuaCallGraph(input: QueryLuaInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const source = await resolveLuaSource(input, workspace);
  if (!source.ok) return createQueryEnvelope('workbench.query_lua_call_graph', 'domain_error', source.diagnostics);

  const snapshot = await resolveAnalyzeSnapshot({ ...input, sourceText: input.sourcePath ? undefined : source.sourceText }, workspace, { filePath: source.filePath, sourceText: source.sourceText });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_lua_call_graph', 'domain_error', snapshot.diagnostics);

  const artifact = analyzeLuaSource({ charxData: input.charxData ?? null, filePath: source.filePath, source: source.sourceText });
  return createQueryEnvelope('workbench.query_lua_call_graph', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    callGraph: mapToSortedEntries(artifact.analyzePhase.callGraph, 'caller', 'callees'),
    calledBy: mapToSortedEntries(artifact.analyzePhase.calledBy, 'callee', 'callers'),
    functions: artifact.serialized.functions,
    handlers: artifact.serialized.handlers,
    snapshot: snapshot.snapshot,
  });
}

/**
 * handleQueryLuaAnalysis 함수.
 * Lua artifact 전체를 agent용 JSON view로 정규화해 반환함.
 *
 * @param input - Lua source 또는 sourcePath 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 Lua analysis view
 */
export async function handleQueryLuaAnalysis(input: QueryLuaInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const resolved = await analyzeLuaQueryInput(input, workspace, 'workbench.query_lua_analysis');
  if (!resolved.ok) return resolved.envelope;

  const artifact = resolved.artifact;
  return createQueryEnvelope('workbench.query_lua_analysis', statusForSnapshot(resolved.snapshot.refused, resolved.snapshot.diagnostics), resolved.snapshot.diagnostics, {
    analyzeSummary: createLuaAnalyzeSummary(artifact),
    apiCalls: artifact.serialized.apiCalls,
    baseName: artifact.baseName,
    correlations: {
      lorebook: artifact.lorebookCorrelation,
      regex: artifact.regexCorrelation,
      summary: createLuaCorrelationSummary(artifact),
    },
    filePath: artifact.filePath,
    functions: artifact.serialized.functions,
    handlers: artifact.serialized.handlers,
    snapshot: resolved.snapshot.snapshot,
    stateAccessOccurrences: artifact.serialized.stateAccessOccurrences,
    stateVars: artifact.serialized.stateVars,
    totalLines: artifact.totalLines,
  });
}

/**
 * handleQueryLuaStateAccess 함수.
 * Lua state access occurrences와 state variable read/write summary를 반환함.
 *
 * @param input - Lua source 또는 sourcePath 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 Lua state access view
 */
export async function handleQueryLuaStateAccess(input: QueryLuaInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const resolved = await analyzeLuaQueryInput(input, workspace, 'workbench.query_lua_state_access');
  if (!resolved.ok) return resolved.envelope;

  const artifact = resolved.artifact;
  return createQueryEnvelope('workbench.query_lua_state_access', statusForSnapshot(resolved.snapshot.refused, resolved.snapshot.diagnostics), resolved.snapshot.diagnostics, {
    filePath: artifact.filePath,
    readSummary: buildStateAccessSummary(artifact.serialized.stateVars, 'read'),
    snapshot: resolved.snapshot.snapshot,
    stateAccessOccurrences: artifact.serialized.stateAccessOccurrences,
    stateVars: artifact.serialized.stateVars,
    summary: {
      totalOccurrences: artifact.serialized.stateAccessOccurrences.length,
      totalReads: artifact.serialized.stateAccessOccurrences.filter((occurrence) => occurrence.direction === 'read').length,
      totalStateVars: Object.keys(artifact.serialized.stateVars).length,
      totalWrites: artifact.serialized.stateAccessOccurrences.filter((occurrence) => occurrence.direction === 'write').length,
    },
    writeSummary: buildStateAccessSummary(artifact.serialized.stateVars, 'write'),
  });
}

/**
 * handleQueryButtonActions 함수.
 * onButtonClick handlers와 handler 내부 호출을 JSON view로 반환함.
 *
 * @param input - Lua source 또는 sourcePath 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 button action view
 */
export async function handleQueryButtonActions(input: QueryLuaInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const source = await resolveLuaSource(input, workspace);
  if (!source.ok) return createQueryEnvelope('workbench.query_button_actions', 'domain_error', source.diagnostics);

  const snapshot = await resolveAnalyzeSnapshot({ ...input, sourceText: input.sourcePath ? undefined : source.sourceText }, workspace, { filePath: source.filePath, sourceText: source.sourceText });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_button_actions', 'domain_error', snapshot.diagnostics);

  const artifact = analyzeLuaSource({ charxData: input.charxData ?? null, filePath: source.filePath, source: source.sourceText });
  const actions = artifact.serialized.handlers
    .map(normalizeLuaHandler)
    .filter((handler): handler is NormalizedLuaHandler => handler !== null)
    .filter((handler) => handler.type === 'onButtonClick' || handler.functionName?.toLowerCase().includes('onbuttonclick'));
  const calls = actions.map((action) => ({
    action,
    calls: action.functionName ? [...(artifact.analyzePhase.callGraph.get(action.functionName) ?? [])].sort() : [],
  }));

  return createQueryEnvelope('workbench.query_button_actions', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    actions,
    calls,
    snapshot: snapshot.snapshot,
  });
}

/**
 * handleQueryRelationshipNetwork 함수.
 * 변수 흐름 analyzer 결과를 force-graph-like nodes/edges view로 정규화함.
 *
 * @param input - CBS element와 optional Lua source 목록
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 relationship network view
 */
export async function handleQueryRelationshipNetwork(input: QueryRelationshipNetworkInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const luaElements: ElementCBSData[] = [];
  for (const luaInput of input.luaSources ?? []) {
    const source = await resolveLuaSource(luaInput, workspace);
    if (!source.ok) return createQueryEnvelope('workbench.query_relationship_network', 'domain_error', source.diagnostics);
    luaElements.push(...analyzeLuaSource({ charxData: luaInput.charxData ?? null, filePath: source.filePath, source: source.sourceText }).elementCbs);
  }

  const elements = [...toElementCBSData(input.elements ?? []), ...luaElements];
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, { elements: input.elements ?? [], luaSources: input.luaSources ?? [] });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_relationship_network', 'domain_error', snapshot.diagnostics);

  const variableFlow = analyzeVariableFlow(elements, {});
  return createQueryEnvelope('workbench.query_relationship_network', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    edges: buildVariableEdges(elements),
    nodes: buildVariableNodes(variableFlow.variables),
    snapshot: snapshot.snapshot,
    summary: variableFlow.summary,
  });
}

/**
 * handleQueryPromptChain 함수.
 * core prompt-chain analyzer 결과의 Set 필드를 array로 정규화해 반환함.
 *
 * @param input - prompt template chain 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 prompt chain view
 */
export async function handleQueryPromptChain(input: QueryPromptChainInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, { templates: input.templates });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_prompt_chain', 'domain_error', snapshot.diagnostics);

  const result = analyzePromptChain(input.templates);
  return createQueryEnvelope('workbench.query_prompt_chain', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    chain: result.chain.map((link) => ({ ...link, cbsReads: [...link.cbsReads].sort(), cbsWrites: [...link.cbsWrites].sort() })),
    externalDeps: result.externalDeps,
    issues: result.issues,
    selfContainedVars: result.selfContainedVars,
    snapshot: snapshot.snapshot,
    totalEstimatedTokens: result.totalEstimatedTokens,
    totalVariables: result.totalVariables,
  });
}

/**
 * handleQueryCompositionConflicts 함수.
 * core composition analyzer 결과를 MCP query envelope로 반환함.
 *
 * @param input - charx/module/preset composition 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 composition conflict view
 */
export async function handleQueryCompositionConflicts(input: QueryCompositionConflictsInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, { charx: input.charx, modules: input.modules ?? [], preset: input.preset });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_composition_conflicts', 'domain_error', snapshot.diagnostics);

  const result = analyzeComposition({
    charx: input.charx ? toArtifactInput(input.charx) : undefined,
    modules: (input.modules ?? []).map(toArtifactInput),
    preset: input.preset ? toArtifactInput(input.preset) : undefined,
  });

  return createQueryEnvelope('workbench.query_composition_conflicts', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    artifacts: result.artifacts,
    conflicts: result.conflicts,
    mergedVariableFlow: result.mergedVariableFlow,
    snapshot: snapshot.snapshot,
    summary: result.summary,
  });
}

/**
 * handleQueryDeadCodeFindings 함수.
 * core dead-code analyzer를 variable-flow 결과 위에 얇게 감싸 cleanup 후보를 반환함.
 *
 * @param input - variable-flow와 lorebook/regex dead-code context 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 dead-code finding view
 */
export async function handleQueryDeadCodeFindings(input: QueryDeadCodeFindingsInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const elements = toElementCBSData(input.elements ?? []);
  const defaultVariables = input.defaultVariables ?? {};
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, {
    defaultVariables,
    elements: input.elements ?? [],
    lorebookEntries: input.lorebookEntries ?? [],
    regexScripts: input.regexScripts ?? [],
  });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_dead_code_findings', 'domain_error', snapshot.diagnostics);

  const variableFlow = analyzeVariableFlow(elements, defaultVariables);
  const result = detectDeadCode(variableFlow, {
    lorebookEntries: [...(input.lorebookEntries ?? [])],
    regexScripts: [...(input.regexScripts ?? [])],
  });

  return createQueryEnvelope('workbench.query_dead_code_findings', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    findings: result.findings,
    snapshot: snapshot.snapshot,
    summary: result.summary,
    variableFlowSummary: variableFlow.summary,
  });
}

/**
 * handleQueryTokenBudget 함수.
 * core token budget analyzer 결과를 snapshot metadata와 함께 반환함.
 *
 * @param input - token component 목록
 * @param workspace - startup에서 계산한 workspace root 상태
 * @returns diagnostic envelope에 감싼 token budget view
 */
export async function handleQueryTokenBudget(input: QueryTokenBudgetInput, workspace: WorkspaceRootStatus): Promise<DiagnosticEnvelope> {
  const snapshot = await resolveAnalyzeSnapshot(input, workspace, { components: input.components });
  if (!snapshot.ok) return createQueryEnvelope('workbench.query_token_budget', 'domain_error', snapshot.diagnostics);

  const result = analyzeTokenBudget([...input.components]);
  return createQueryEnvelope('workbench.query_token_budget', statusForSnapshot(snapshot.refused, snapshot.diagnostics), snapshot.diagnostics, {
    ...result,
    snapshot: snapshot.snapshot,
  });
}

/**
 * toElementCBSData 함수.
 * MCP JSON input의 reads/writes 배열을 core analyzer가 요구하는 Set으로 변환함.
 *
 * @param elements - MCP JSON element 입력 목록
 * @returns core ElementCBSData 목록
 */
function toElementCBSData(elements: readonly ElementInput[]): ElementCBSData[] {
  return elements.map((element) => ({
    elementName: element.elementName,
    elementType: element.elementType,
    executionOrder: element.executionOrder,
    reads: new Set(element.reads ?? []),
    writes: new Set(element.writes ?? []),
  }));
}

/**
 * toArtifactInput 함수.
 * MCP JSON artifact 입력을 core composition analyzer 입력으로 변환함.
 *
 * @param artifact - MCP artifact 입력
 * @returns core ArtifactInput
 */
function toArtifactInput(artifact: ArtifactAnalyzeInput): ArtifactInput {
  return {
    defaultVariables: artifact.defaultVariables ?? {},
    elements: toElementCBSData(artifact.elements ?? []),
    lorebookKeywords: artifact.lorebookKeywords,
    name: artifact.name,
    namespace: artifact.namespace,
    regexPatterns: artifact.regexPatterns,
    type: artifact.type,
  };
}

interface LuaSourceResolution {
  filePath: string;
  ok: true;
  sourceText: string;
}

interface LuaSourceFailure {
  diagnostics: readonly WorkbenchDiagnostic[];
  ok: false;
}

type LuaQueryResolution =
  | {
      artifact: ReturnType<typeof analyzeLuaSource>;
      ok: true;
      snapshot: Extract<Awaited<ReturnType<typeof resolveAnalyzeSnapshot>>, { ok: true }>;
    }
  | {
      envelope: DiagnosticEnvelope;
      ok: false;
    };

/**
 * analyzeLuaQueryInput 함수.
 * Lua source와 snapshot을 공통 방식으로 해석한 뒤 core Lua analyzer를 실행함.
 *
 * @param input - Lua source 또는 sourcePath 입력
 * @param workspace - startup에서 계산한 workspace root 상태
 * @param toolName - 실패 envelope에 넣을 tool name
 * @returns Lua artifact와 snapshot 또는 diagnostic envelope
 */
async function analyzeLuaQueryInput(input: QueryLuaInput, workspace: WorkspaceRootStatus, toolName: string): Promise<LuaQueryResolution> {
  const source = await resolveLuaSource(input, workspace);
  if (!source.ok) return { envelope: createQueryEnvelope(toolName, 'domain_error', source.diagnostics), ok: false };

  const snapshot = await resolveAnalyzeSnapshot({ ...input, sourceText: input.sourcePath ? undefined : source.sourceText }, workspace, { filePath: source.filePath, sourceText: source.sourceText });
  if (!snapshot.ok) return { envelope: createQueryEnvelope(toolName, 'domain_error', snapshot.diagnostics), ok: false };

  return {
    artifact: analyzeLuaSource({ charxData: input.charxData ?? null, filePath: source.filePath, source: source.sourceText }),
    ok: true,
    snapshot,
  };
}

/**
 * resolveLuaSource 함수.
 * Lua query용 sourceText 또는 workspace-safe sourcePath를 읽음.
 *
 * @param input - Lua query input
 * @param workspace - workspace root 상태
 * @returns Lua source text 또는 diagnostic
 */
async function resolveLuaSource(input: QueryLuaInput, workspace: WorkspaceRootStatus): Promise<LuaSourceResolution | LuaSourceFailure> {
  if (input.sourceText !== undefined) {
    return { filePath: input.filePath ?? input.sourcePath ?? '<inline>.lua', ok: true, sourceText: input.sourceText };
  }

  if (!input.sourcePath) {
    return {
      diagnostics: [{ category: 'input', id: 'LUA_SOURCE_MISSING', message: 'Either sourceText or sourcePath is required for Lua analyze queries.', path: null, ruleId: 'analyze.lua-source-required', severity: 'error' }],
      ok: false,
    };
  }

  if (!workspace.ok) {
    return {
      diagnostics: [{ category: 'workspace', id: 'WORKSPACE_ROOT_UNAVAILABLE', message: `Workspace root is unavailable: ${workspace.reason}`, path: input.sourcePath, ruleId: 'workspace.root-unavailable', severity: 'error' }],
      ok: false,
    };
  }

  const safeResult = await resolveSafeWorkspacePath({ inputPath: input.sourcePath, intent: 'read-existing', workspace });
  if (!safeResult.ok) {
    return {
      diagnostics: [{ category: 'path', id: 'PATH_RESOLVE_FAILED', message: `Path resolution failed: ${safeResult.reason}`, path: input.sourcePath, ruleId: `path.${safeResult.reason}`, severity: 'error' }],
      ok: false,
    };
  }

  return { filePath: input.filePath ?? safeResult.relativePath, ok: true, sourceText: await readFile(safeResult.absolutePath, 'utf8') };
}

/**
 * createQueryEnvelope 함수.
 * analyze query 결과를 공통 diagnostic envelope로 감쌈.
 *
 * @param tool - MCP tool name
 * @param status - envelope status
 * @param diagnostics - domain diagnostics
 * @param data - query data
 * @returns diagnostic envelope
 */
function createQueryEnvelope(tool: string, status: DiagnosticEnvelopeStatus, diagnostics: readonly WorkbenchDiagnostic[], data?: EnvelopeData): DiagnosticEnvelope {
  return createDiagnosticEnvelope({ data, diagnostics, status, tool });
}

/**
 * statusForSnapshot 함수.
 * snapshot stale 상태를 envelope status로 변환함.
 *
 * @param refused - stalePolicy가 refuse인지 여부
 * @param diagnostics - snapshot diagnostics
 * @returns query envelope status
 */
function statusForSnapshot(refused: boolean, diagnostics: readonly WorkbenchDiagnostic[]): DiagnosticEnvelopeStatus {
  if (refused) return 'domain_error';
  return diagnostics.length > 0 ? 'domain_warning' : 'ok';
}

/**
 * mapToSortedEntries 함수.
 * Map<string, Set<string>>을 JSON-friendly sorted entry 배열로 변환함.
 *
 * @param map - 정규화할 map
 * @param keyName - key field 이름
 * @param valuesName - values field 이름
 * @returns 정렬된 entry 배열
 */
function mapToSortedEntries(map: Map<string, Set<string>>, keyName: string, valuesName: string): Array<Record<string, string | string[]>> {
  return [...map.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, values]) => ({ [keyName]: key, [valuesName]: [...values].sort() }));
}

/**
 * createLuaAnalyzeSummary 함수.
 * Map/Set 기반 Lua analyze phase 결과를 JSON-friendly summary로 변환함.
 *
 * @param artifact - core Lua analysis artifact
 * @returns agent-facing analyze summary
 */
function createLuaAnalyzeSummary(artifact: ReturnType<typeof analyzeLuaSource>): Record<string, unknown> {
  return {
    apiByCategory: [...artifact.analyzePhase.apiByCategory.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([category, value]) => ({ apis: [...value.apis].sort(), category, count: value.count })),
    calledBy: mapToSortedEntries(artifact.analyzePhase.calledBy, 'callee', 'callers'),
    callGraph: mapToSortedEntries(artifact.analyzePhase.callGraph, 'caller', 'callees'),
    commentSections: artifact.analyzePhase.commentSections,
    moduleByFunction: [...artifact.analyzePhase.moduleByFunction.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([functionName, moduleName]) => ({ functionName, moduleName })),
    moduleGroups: artifact.analyzePhase.moduleGroups.map((group) => ({
      ...group,
      apiCats: [...group.apiCats].sort(),
      functions: [...group.functions].sort(),
      stateKeys: [...group.stateKeys].sort(),
      tables: [...group.tables].sort(),
    })),
    registryVars: artifact.analyzePhase.registryVars,
    resolvedModuleCalls: artifact.analyzePhase.resolvedModuleCalls,
    rootFunctionNames: artifact.analyzePhase.rootFunctions.map((fn) => fn.name).sort(),
    sectionMapSections: artifact.analyzePhase.sectionMapSections,
    stateOwnership: artifact.analyzePhase.stateOwnership,
    totals: {
      apiCalls: artifact.serialized.apiCalls.length,
      functions: artifact.serialized.functions.length,
      handlers: artifact.serialized.handlers.length,
      stateAccessOccurrences: artifact.serialized.stateAccessOccurrences.length,
      stateVars: Object.keys(artifact.serialized.stateVars).length,
    },
  };
}

/**
 * createLuaCorrelationSummary 함수.
 * Lua correlation 결과에서 compact count summary를 추출함.
 *
 * @param artifact - core Lua analysis artifact
 * @returns lorebook/regex correlation count summary
 */
function createLuaCorrelationSummary(artifact: ReturnType<typeof analyzeLuaSource>): Record<string, unknown> {
  return {
    lorebook: artifact.lorebookCorrelation
      ? {
          bridgedVars: artifact.lorebookCorrelation.bridgedVars.length,
          correlations: artifact.lorebookCorrelation.correlations.length,
          entries: artifact.lorebookCorrelation.totalEntries,
          lorebookOnlyVars: artifact.lorebookCorrelation.lorebookOnlyVars.length,
          luaOnlyVars: artifact.lorebookCorrelation.luaOnlyVars.length,
        }
      : null,
    regex: artifact.regexCorrelation
      ? {
          activeScripts: artifact.regexCorrelation.activeScripts,
          bridgedVars: artifact.regexCorrelation.bridgedVars.length,
          correlations: artifact.regexCorrelation.correlations.length,
          luaOnlyVars: artifact.regexCorrelation.luaOnlyVars.length,
          regexOnlyVars: artifact.regexCorrelation.regexOnlyVars.length,
          totalScripts: artifact.regexCorrelation.totalScripts,
        }
      : null,
  };
}

/**
 * buildStateAccessSummary 함수.
 * serialized stateVars에서 read/write별 상태 변수 summary를 만든다.
 *
 * @param stateVars - Lua artifact의 serialized stateVars 객체
 * @param direction - 요약할 접근 방향
 * @returns state variable access summary 목록
 */
function buildStateAccessSummary(stateVars: Record<string, unknown>, direction: 'read' | 'write'): Array<Record<string, unknown>> {
  return Object.entries(stateVars)
    .map(([key, value]) => {
      const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
      const functions = direction === 'read' ? toSortedStringArray(record.readBy) : toSortedStringArray(record.writtenBy);
      return {
        apis: toSortedStringArray(record.apis),
        count: functions.length,
        firstWriteFunction: record.firstWriteFunction ?? null,
        firstWriteLine: typeof record.firstWriteLine === 'number' ? record.firstWriteLine : null,
        functions,
        hasDualWrite: Boolean(record.hasDualWrite),
        key,
      };
    })
    .filter((entry) => Number(entry.count) > 0)
    .sort((left, right) => String(left.key).localeCompare(String(right.key)));
}

/**
 * toSortedStringArray 함수.
 * unknown 배열 값을 안전한 정렬 문자열 배열로 좁힘.
 *
 * @param value - 배열일 수 있는 unknown 값
 * @returns 정렬된 문자열 배열
 */
function toSortedStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string').sort() : [];
}

/**
 * buildVariableNodes 함수.
 * variable-flow entry를 relationship graph node 목록으로 변환함.
 *
 * @param variables - core variable-flow entry 목록
 * @returns graph node 목록
 */
function buildVariableNodes(variables: Array<{ varName: string; events: Array<{ elementName: string; elementType: string }> }>): Array<Record<string, unknown>> {
  const elementNodes = new Map<string, Record<string, unknown>>();
  const variableNodes = variables.map((variable) => ({ id: `var:${variable.varName}`, label: variable.varName, type: 'variable' }));
  for (const variable of variables) {
    for (const event of variable.events) {
      const id = `element:${event.elementType}:${event.elementName}`;
      elementNodes.set(id, { id, label: event.elementName, type: event.elementType });
    }
  }
  return [...elementNodes.values()].sort((left, right) => String(left.id).localeCompare(String(right.id))).concat(variableNodes);
}

/**
 * buildVariableEdges 함수.
 * CBS element reads/writes를 variable relationship edge로 변환함.
 *
 * @param elements - core element CBS data 목록
 * @returns graph edge 목록
 */
function buildVariableEdges(elements: readonly ElementCBSData[]): Array<Record<string, string>> {
  const edges: Array<Record<string, string>> = [];
  for (const element of elements) {
    const elementId = `element:${element.elementType}:${element.elementName}`;
    for (const varName of [...element.writes].sort()) {
      edges.push({ source: elementId, target: `var:${varName}`, type: 'variable-write' });
    }
    for (const varName of [...element.reads].sort()) {
      edges.push({ source: `var:${varName}`, target: elementId, type: 'variable-read' });
    }
  }
  return edges.sort((left, right) => `${left.source}:${left.target}:${left.type}`.localeCompare(`${right.source}:${right.target}:${right.type}`));
}

/**
 * normalizeLuaHandler 함수.
 * core Lua serialized handler unknown 값을 button-action query에서 쓰는 shape로 좁힘.
 *
 * @param value - core Lua handler 직렬화 값
 * @returns 정규화한 handler 또는 null
 */
function normalizeLuaHandler(value: unknown): NormalizedLuaHandler | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.type !== 'string' || typeof record.line !== 'number' || typeof record.isAsync !== 'boolean') {
    return null;
  }
  return {
    detail: typeof record.detail === 'string' ? record.detail : null,
    functionName: typeof record.functionName === 'string' ? record.functionName : null,
    isAsync: record.isAsync,
    line: record.line,
    type: record.type,
  };
}

/**
 * createMissingVariableDiagnostic 함수.
 * 단일 변수 query에서 변수 이름이 없을 때 경고 diagnostic을 생성함.
 *
 * @param variableName - 찾지 못한 변수 이름
 * @returns missing variable diagnostic
 */
function createMissingVariableDiagnostic(variableName: string): WorkbenchDiagnostic {
  return {
    category: 'analyze-variable',
    id: 'VARIABLE_NOT_FOUND',
    message: `Variable "${variableName}" was not found in the current variable-flow snapshot.`,
    path: null,
    ruleId: 'analyze.variable-not-found',
    severity: 'warning',
  };
}
