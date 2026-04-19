import {
  sanitizeName,
  type CollectedFunction,
  type LorebookCorrelation,
  type RegexCorrelation,
} from '@/domain';
import { escapeHtml } from '@/cli/shared/report-utils';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import type { Locale } from './i18n';
import type { DiagramPanel } from './visualization-types';

type BridgeKind = 'lorebook' | 'regex';
type BridgeFlowMode = 'source-to-lua' | 'lua-to-source' | 'bidirectional';

interface BridgeSpec {
  varName: string;
  kind: BridgeKind;
  name: string;
  direction: string;
}

interface FunctionNodeRef {
  fn: CollectedFunction;
}

interface StateInfo {
  readers: string[];
  writers: string[];
  bridges: Array<{ name: string; kind: string; direction: BridgeFlowMode }>;
}

interface CallEdge {
  caller: string;
  callee: string;
}

const CORE_HANDLER_NAMES = new Set(['listenedit', 'onoutput', 'oninput', 'onbuttonclick']);
const MAX_TREE_DEPTH = 6;
const MAX_CALLEES_PER_NODE = 20;

function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, 'en');
}

function matchesFunctionToken(fn: CollectedFunction, token: string): boolean {
  return (
    fn.name === token || fn.displayName === token || sanitizeName(fn.displayName, '') === token
  );
}

function isHandlerFunction(fn: CollectedFunction, handlerNames: ReadonlySet<string>): boolean {
  return (
    CORE_HANDLER_NAMES.has(fn.name.toLowerCase()) ||
    fn.isListenEditHandler ||
    handlerNames.has(fn.name)
  );
}

function resolveBridgeFlowMode(kind: BridgeKind, direction: string): BridgeFlowMode {
  const normalized = direction.trim().toLowerCase().replace(/→/g, '->');
  if (normalized === 'bidirectional') return 'bidirectional';
  if (normalized.startsWith('lua->') || normalized.endsWith(`->${kind}`)) return 'lua-to-source';
  if (normalized.endsWith('->lua') || normalized.startsWith(`${kind}->`)) return 'source-to-lua';
  return 'bidirectional';
}

function collectBridgeSpecs(
  artifact: LuaAnalysisArtifact,
  correlation: LorebookCorrelation | RegexCorrelation | null,
  kind: BridgeKind,
): BridgeSpec[] {
  if (!correlation) return [];
  const specs: BridgeSpec[] = [];
  for (const entry of correlation.correlations) {
    if (entry.direction === 'isolated') continue;
    const names =
      kind === 'lorebook' && 'lorebookReaders' in entry && 'lorebookWriters' in entry
        ? [...entry.lorebookReaders, ...entry.lorebookWriters]
        : kind === 'regex' && 'regexReaders' in entry && 'regexWriters' in entry
          ? [...entry.regexReaders, ...entry.regexWriters]
          : [];
    for (const rawName of names) {
      const name = rawName.trim();
      if (name) specs.push({ varName: entry.varName, kind, name, direction: entry.direction });
    }
  }
  return specs;
}

// ── Analysis: build the graph model ────────────────────────────────

interface FlowGraph {
  handlers: CollectedFunction[];
  functions: Map<string, CollectedFunction>;
  callEdges: CallEdge[];
  stateInfos: Map<string, StateInfo>;
  calleesOf: Map<string, string[]>;
}

function buildFunctionTokenIndex(functions: readonly CollectedFunction[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const fn of functions) {
    index.set(fn.name, fn.displayName);
    index.set(fn.displayName, fn.displayName);
    index.set(sanitizeName(fn.displayName, ''), fn.displayName);
  }
  return index;
}

function addResolvedCallEdge(
  caller: string,
  callee: string,
  seenEdges: Set<string>,
  callEdges: CallEdge[],
  calleesOf: Map<string, string[]>,
): void {
  const edgeKey = `${caller}|${callee}`;
  if (seenEdges.has(edgeKey)) return;
  seenEdges.add(edgeKey);

  callEdges.push({ caller, callee });
  const list = calleesOf.get(caller) ?? [];
  list.push(callee);
  calleesOf.set(caller, list);
}

function buildFlowGraph(artifact: LuaAnalysisArtifact): FlowGraph {
  const handlerNames = new Set(
    artifact.collected.handlers
      .map((entry) => entry.functionName)
      .filter((name): name is string => Boolean(name)),
  );

  const allFunctions = [...artifact.collected.functions].sort((a, b) => a.startLine - b.startLine);
  const handlers: CollectedFunction[] = [];
  const functions = new Map<string, CollectedFunction>();
  const functionTokenIndex = buildFunctionTokenIndex(allFunctions);

  for (const fn of allFunctions) {
    functions.set(fn.displayName, fn);
    if (isHandlerFunction(fn, handlerNames)) {
      handlers.push(fn);
    }
  }

  // Resolve call edges
  const callEdges: CallEdge[] = [];
  const calleesOf = new Map<string, string[]>();
  const seenEdges = new Set<string>();

  for (const [callerToken, calleeTokens] of artifact.analyzePhase.callGraph.entries()) {
    const caller = functionTokenIndex.get(callerToken);
    if (!caller) continue;

    for (const calleeToken of calleeTokens) {
      const callee = functionTokenIndex.get(calleeToken);
      if (!callee) continue;
      addResolvedCallEdge(caller, callee, seenEdges, callEdges, calleesOf);
    }
  }

  for (const call of artifact.collected.calls) {
    if (!call.caller || !call.callee) continue;
    // Resolve caller
    const callerFn = allFunctions.find((fn) => matchesFunctionToken(fn, call.caller!));
    if (!callerFn) continue;
    // Resolve callee
    const calleeFn = allFunctions.find((fn) => matchesFunctionToken(fn, call.callee!));
    if (!calleeFn) continue;
    addResolvedCallEdge(
      callerFn.displayName,
      calleeFn.displayName,
      seenEdges,
      callEdges,
      calleesOf,
    );
  }

  // State info
  const stateInfos = new Map<string, StateInfo>();
  function ensureState(varName: string): StateInfo {
    let info = stateInfos.get(varName);
    if (!info) {
      info = { readers: [], writers: [], bridges: [] };
      stateInfos.set(varName, info);
    }
    return info;
  }

  for (const fn of allFunctions) {
    for (const varName of fn.stateReads) {
      const info = ensureState(varName);
      if (!info.readers.includes(fn.displayName)) info.readers.push(fn.displayName);
    }
    for (const varName of fn.stateWrites) {
      const info = ensureState(varName);
      if (!info.writers.includes(fn.displayName)) info.writers.push(fn.displayName);
    }
  }

  // Bridges
  const bridgeSpecs = [
    ...collectBridgeSpecs(artifact, artifact.lorebookCorrelation, 'lorebook'),
    ...collectBridgeSpecs(artifact, artifact.regexCorrelation, 'regex'),
  ];
  const bridgeDedup = new Set<string>();
  for (const bridge of bridgeSpecs) {
    const key = `${bridge.kind}:${bridge.name}:${bridge.varName}`;
    if (bridgeDedup.has(key)) continue;
    bridgeDedup.add(key);
    const info = ensureState(bridge.varName);
    const mode = resolveBridgeFlowMode(bridge.kind, bridge.direction);
    info.bridges.push({ name: bridge.name, kind: bridge.kind, direction: mode });
  }

  return { handlers, functions, callEdges, stateInfos, calleesOf };
}

// ── HTML rendering ─────────────────────────────────────────────────

function renderStateAccess(
  fn: CollectedFunction,
  stateInfos: Map<string, StateInfo>,
  indent: number,
): string {
  const items: string[] = [];
  const reads = [...fn.stateReads].sort(compareStrings);
  const writes = [...fn.stateWrites].sort(compareStrings);

  for (const varName of reads) {
    const info = stateInfos.get(varName);
    const bridgeTags =
      info?.bridges
        .map((b) => {
          const arrow =
            b.direction === 'source-to-lua' ? '←' : b.direction === 'lua-to-source' ? '→' : '↔';
          return `<span class="lf-tree-bridge">${arrow} ${escapeHtml(b.name)} <span class="lf-tree-dim">(${escapeHtml(b.kind)})</span></span>`;
        })
        .join('') ?? '';
    items.push(
      `<div class="lf-tree-leaf lf-tree-leaf--read" style="padding-left:${indent}px"><span class="lf-tree-icon">◇</span><span class="lf-tree-dim">reads</span> <span class="lf-tree-var">${escapeHtml(varName)}</span>${bridgeTags}</div>`,
    );
  }
  for (const varName of writes) {
    const info = stateInfos.get(varName);
    const bridgeTags =
      info?.bridges
        .map((b) => {
          const arrow =
            b.direction === 'source-to-lua' ? '←' : b.direction === 'lua-to-source' ? '→' : '↔';
          return `<span class="lf-tree-bridge">${arrow} ${escapeHtml(b.name)} <span class="lf-tree-dim">(${escapeHtml(b.kind)})</span></span>`;
        })
        .join('') ?? '';
    items.push(
      `<div class="lf-tree-leaf lf-tree-leaf--write" style="padding-left:${indent}px"><span class="lf-tree-icon">◆</span><span class="lf-tree-dim">writes</span> <span class="lf-tree-var">${escapeHtml(varName)}</span>${bridgeTags}</div>`,
    );
  }
  return items.join('');
}

function renderCallTree(
  fnName: string,
  graph: FlowGraph,
  depth: number,
  visited: Set<string>,
  indent: number,
): string {
  if (depth > MAX_TREE_DEPTH || visited.has(fnName)) {
    if (visited.has(fnName)) {
      return `<div class="lf-tree-leaf lf-tree-leaf--cycle" style="padding-left:${indent}px"><span class="lf-tree-icon">↻</span><span class="lf-tree-dim">${escapeHtml(fnName)}</span> (cycle)</div>`;
    }
    return '';
  }
  visited.add(fnName);

  const fn = graph.functions.get(fnName);
  if (!fn) {
    visited.delete(fnName);
    return '';
  }

  const lines: string[] = [];

  // State access for this function
  lines.push(renderStateAccess(fn, graph.stateInfos, indent + 20));

  // Callees
  const callees = (graph.calleesOf.get(fnName) ?? []).slice(0, MAX_CALLEES_PER_NODE);
  for (const callee of callees) {
    lines.push(
      `<div class="lf-tree-call" style="padding-left:${indent}px"><span class="lf-tree-icon">→</span><span class="lf-tree-fn">${escapeHtml(callee)}</span></div>`,
    );
    lines.push(renderCallTree(callee, graph, depth + 1, visited, indent + 20));
  }

  visited.delete(fnName);
  return lines.join('');
}

function renderHandlerTree(handler: CollectedFunction, graph: FlowGraph): string {
  const visited = new Set<string>();
  const bodyHtml = renderCallTree(handler.displayName, graph, 0, visited, 16);
  const isEmpty = bodyHtml.trim() === '';

  return `<div class="lf-handler-tree"><div class="lf-handler-header"><span class="lf-handler-badge">HND</span><span class="lf-handler-name">${escapeHtml(handler.displayName)}</span></div>${isEmpty ? '<div class="lf-tree-empty">No calls or state access detected</div>' : `<div class="lf-handler-body">${bodyHtml}</div>`}</div>`;
}

function renderStateSummary(stateInfos: Map<string, StateInfo>): string {
  if (stateInfos.size === 0) return '';

  const rows: string[] = [];
  const sortedVars = [...stateInfos.keys()].sort(compareStrings);

  for (const varName of sortedVars) {
    const info = stateInfos.get(varName)!;
    const details: string[] = [];
    if (info.readers.length > 0) {
      details.push(
        `<span class="lf-state-detail"><span class="lf-tree-dim">read by</span> ${info.readers.map((r) => `<span class="lf-tree-fn">${escapeHtml(r)}</span>`).join(', ')}</span>`,
      );
    }
    if (info.writers.length > 0) {
      details.push(
        `<span class="lf-state-detail"><span class="lf-tree-dim">written by</span> ${info.writers.map((w) => `<span class="lf-tree-fn">${escapeHtml(w)}</span>`).join(', ')}</span>`,
      );
    }
    for (const bridge of info.bridges) {
      const arrow =
        bridge.direction === 'source-to-lua'
          ? '←'
          : bridge.direction === 'lua-to-source'
            ? '→'
            : '↔';
      details.push(
        `<span class="lf-state-detail"><span class="lf-tree-bridge">${arrow} ${escapeHtml(bridge.name)} <span class="lf-tree-dim">(${escapeHtml(bridge.kind)})</span></span></span>`,
      );
    }
    rows.push(
      `<div class="lf-state-row"><span class="lf-tree-var">${escapeHtml(varName)}</span><div class="lf-state-details">${details.join('')}</div></div>`,
    );
  }

  return `<div class="lf-state-summary"><div class="lf-section-header">State Variable Summary<span class="lf-lane-count">${stateInfos.size}</span></div>${rows.join('')}</div>`;
}

function renderOrphanFunctions(graph: FlowGraph): string {
  // Functions not reachable from any handler tree
  const reachable = new Set<string>();
  function walk(name: string): void {
    if (reachable.has(name)) return;
    reachable.add(name);
    for (const callee of graph.calleesOf.get(name) ?? []) walk(callee);
  }
  for (const handler of graph.handlers) walk(handler.displayName);

  const handlerNames = new Set(graph.handlers.map((h) => h.displayName));
  const orphans = [...graph.functions.values()]
    .filter((fn) => !handlerNames.has(fn.displayName) && !reachable.has(fn.displayName))
    .sort((a, b) => compareStrings(a.displayName, b.displayName));

  if (orphans.length === 0) return '';

  const cards = orphans
    .map((fn) => {
      const visited = new Set<string>();
      const bodyHtml = renderCallTree(fn.displayName, graph, 0, visited, 16);
      return `<div class="lf-orphan-fn"><span class="lf-orphan-badge">FN</span><span class="lf-tree-fn">${escapeHtml(fn.displayName)}</span>${bodyHtml}</div>`;
    })
    .join('');

  return `<div class="lf-orphan-section"><div class="lf-section-header">Standalone Functions<span class="lf-lane-count">${orphans.length}</span></div><div class="lf-orphan-body">${cards}</div></div>`;
}

function renderLuaFlowHtml(graph: FlowGraph): string {
  const parts: string[] = [];

  // Per-handler flow trees
  if (graph.handlers.length > 0) {
    parts.push(
      `<div class="lf-section-header">Handler Flow Trees<span class="lf-lane-count">${graph.handlers.length}</span></div>`,
    );
    for (const handler of graph.handlers) {
      parts.push(renderHandlerTree(handler, graph));
    }
  }

  // Orphan functions
  parts.push(renderOrphanFunctions(graph));

  // State summary
  parts.push(renderStateSummary(graph.stateInfos));

  return `<div class="lf-diagram">${parts.join('')}</div>`;
}

// ── Main builder ───────────────────────────────────────────────────

/** buildLuaInteractionFlow가 단일 Lua 아티팩트용 HTML flow diagram payload를 만든다. */
export function buildLuaInteractionFlow(
  artifact: LuaAnalysisArtifact,
  _locale: Locale,
): DiagramPanel['payload'] {
  const graph = buildFlowGraph(artifact);
  return renderLuaFlowHtml(graph);
}
