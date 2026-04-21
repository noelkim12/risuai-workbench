/**
 * CBS LSP runtime-facing availability contract shared by server info, traces, and normalized payload snapshots.
 * @file packages/cbs-lsp/src/core/availability-contract.ts
 */

import {
  createAgentMetadataAvailability,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataAvailabilityScope,
} from './agent-metadata';

export interface ActiveFeatureAvailabilityMap {
  codeAction: AgentMetadataAvailabilityContract;
  codelens: AgentMetadataAvailabilityContract;
  completion: AgentMetadataAvailabilityContract;
  definition: AgentMetadataAvailabilityContract;
  diagnostics: AgentMetadataAvailabilityContract;
  documentSymbol: AgentMetadataAvailabilityContract;
  formatting: AgentMetadataAvailabilityContract;
  folding: AgentMetadataAvailabilityContract;
  hover: AgentMetadataAvailabilityContract;
  luaHover: AgentMetadataAvailabilityContract;
  references: AgentMetadataAvailabilityContract;
  rename: AgentMetadataAvailabilityContract;
  semanticTokens: AgentMetadataAvailabilityContract;
  signature: AgentMetadataAvailabilityContract;
}

export interface DeferredFeatureAvailabilityMap {
  'lua-completion': AgentMetadataAvailabilityContract;
  'lua-diagnostics': AgentMetadataAvailabilityContract;
  'lua-ast-fragment-routing': AgentMetadataAvailabilityContract;
}

export interface ExcludedArtifactAvailabilityMap {
  risutoggle: AgentMetadataAvailabilityContract;
  risuvar: AgentMetadataAvailabilityContract;
}

export type LuaLsCompanionStatus = 'unavailable' | 'stopped' | 'starting' | 'ready' | 'crashed';

export type LuaLsCompanionHealth = 'unavailable' | 'idle' | 'healthy' | 'degraded';

export interface LuaLsCompanionRuntime {
  key: 'luals';
  status: LuaLsCompanionStatus;
  health: LuaLsCompanionHealth;
  transport: 'stdio';
  executablePath: string | null;
  pid: number | null;
  detail: string;
}

export interface CompanionRuntimeMap {
  luals: LuaLsCompanionRuntime;
}

export interface DeferredScopeContract {
  deferredFeatures: readonly (keyof DeferredFeatureAvailabilityMap)[];
  featureAvailability: DeferredFeatureAvailabilityMap;
  luaRoutingMode: 'full-document-fragment';
}

export interface CbsRuntimeAvailabilityContract {
  companions: CompanionRuntimeMap;
  excludedArtifacts: ExcludedArtifactAvailabilityMap;
  featureAvailability: ActiveFeatureAvailabilityMap & DeferredFeatureAvailabilityMap;
}

export interface NormalizedAvailabilitySnapshotEntry extends AgentMetadataAvailabilityContract {
  key: string;
}

export interface NormalizedRuntimeAvailabilitySnapshot {
  artifacts: NormalizedAvailabilitySnapshotEntry[];
  companions: LuaLsCompanionRuntime[];
  features: NormalizedAvailabilitySnapshotEntry[];
}

export const ACTIVE_FEATURE_AVAILABILITY = Object.freeze({
  codeAction: createAgentMetadataAvailability(
    'local-only',
    'server-capability:codeAction',
    'Code actions are active for routed CBS fragments, reuse diagnostics metadata for quick fixes and guidance, and only promote automatic host edits that pass the shared host-fragment safety contract.',
  ),
  codelens: createAgentMetadataAvailability(
    'local-only',
    'server-capability:codelens',
    'CodeLens is active for routed lorebook documents, summarizes workspace activation edges for the current lorebook entry, and requests refresh after document or watched-file changes rebuild activation edges.',
  ),
  completion: createAgentMetadataAvailability(
    'local-only',
    'server-capability:completion',
    'Completion is active for routed CBS fragments and operates on the current document/fragment context only.',
  ),
  definition: createAgentMetadataAvailability(
    'local-first',
    'server-capability:definition',
    'Definition is active for routed CBS fragments, returns fragment-local definitions first, and appends workspace chat-variable writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
  ),
  diagnostics: createAgentMetadataAvailability(
    'local-only',
    'server-capability:diagnostics',
    'Diagnostics are active for routed CBS fragments and report results within the current document only.',
  ),
  documentSymbol: createAgentMetadataAvailability(
    'local-only',
    'server-capability:documentSymbol',
    'Document symbols are active for routed CBS fragments, expose fragment-local outline structure, and group multi-fragment documents by CBS-bearing section containers only.',
  ),
  formatting: createAgentMetadataAvailability(
    'local-only',
    'server-capability:formatting',
    'Formatting is active for routed CBS fragments, produces fragment-local canonical text edits, and only promotes host edits that pass the shared host-fragment safety contract.',
  ),
  folding: createAgentMetadataAvailability(
    'local-only',
    'server-capability:folding',
    'Folding is active for routed CBS fragments and only reflects ranges in the current document.',
  ),
  hover: createAgentMetadataAvailability(
    'local-only',
    'server-capability:hover',
    'Hover is active for routed CBS fragments and describes symbols visible from the current CBS document context only.',
  ),
  luaHover: createAgentMetadataAvailability(
    'local-only',
    'lua-provider:hover-proxy',
    'Lua hover is active for `.risulua` documents by forwarding `textDocument/hover` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable or still starting, the server returns no Lua hover result and leaves CBS capabilities unchanged.',
  ),
  references: createAgentMetadataAvailability(
    'local-first',
    'server-capability:references',
    'References are active for routed CBS fragments, return fragment-local read/write locations first, and append workspace chat-variable readers/writers when VariableFlowService workspace state is available. Global and external symbols stay unavailable.',
  ),
  rename: createAgentMetadataAvailability(
    'local-first',
    'server-capability:rename',
    'Rename is active for routed CBS fragments, keeps prepareRename rejection messages for malformed/unresolved/global/external positions, and applies fragment-local edits first before appending workspace chat-variable occurrences when VariableFlowService workspace state is available.',
  ),
  semanticTokens: createAgentMetadataAvailability(
    'local-only',
    'server-capability:semanticTokens',
    'Semantic tokens are active for routed CBS fragments and colorize only the current document.',
  ),
  signature: createAgentMetadataAvailability(
    'local-only',
    'server-capability:signature',
    'Signature help is active for routed CBS fragments and uses the current document context only.',
  ),
}) satisfies ActiveFeatureAvailabilityMap;

export const EXCLUDED_ARTIFACT_AVAILABILITY = Object.freeze({
  risutoggle: createAgentMetadataAvailability(
    'workspace-disabled',
    'document-router:risutoggle',
    '`.risutoggle` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
  ),
  risuvar: createAgentMetadataAvailability(
    'workspace-disabled',
    'document-router:risuvar',
    '`.risuvar` artifacts do not carry CBS fragments, so CBS LSP routing stays disabled for them.',
  ),
}) satisfies ExcludedArtifactAvailabilityMap;

export const DEFERRED_SCOPE_CONTRACT = Object.freeze({
  deferredFeatures: [
    'lua-ast-fragment-routing',
  ] as const,
  featureAvailability: {
    'lua-completion': createAgentMetadataAvailability(
      'deferred',
      'deferred-scope-contract:lua-completion',
      'Lua completion proxy stays deferred until the minimal LuaLS hover seam is expanded into editor completion request routing.',
    ),
    'lua-diagnostics': createAgentMetadataAvailability(
      'deferred',
      'deferred-scope-contract:lua-diagnostics',
      'Lua diagnostics proxy stays deferred until the server forwards LuaLS diagnostics notifications into host `publishDiagnostics` plumbing.',
    ),
    'lua-ast-fragment-routing': createAgentMetadataAvailability(
      'deferred',
      'deferred-scope-contract:lua-ast-fragment-routing',
      'Lua AST-specific fragment routing stays deferred while the current contract still uses full-document fragment routing.',
    ),
  },
  luaRoutingMode: 'full-document-fragment' as const,
}) satisfies DeferredScopeContract;

/**
 * createLuaLsCompanionRuntime 함수.
 * LuaLS sidecar runtime 상태를 availability/trace에서 재사용할 canonical shape로 만듦.
 *
 * @param overrides - 상태별 override 필드
 * @returns LuaLS companion runtime snapshot
 */
export function createLuaLsCompanionRuntime(
  overrides: Partial<LuaLsCompanionRuntime> = {},
): LuaLsCompanionRuntime {
  return {
    detail:
      'LuaLS sidecar is not running yet. The process foundation can probe availability, but Lua document routing/proxy features remain deferred until later checklist items land.',
    executablePath: null,
    health: 'unavailable',
    key: 'luals',
    pid: null,
    status: 'unavailable',
    transport: 'stdio',
    ...overrides,
  };
}

/**
 * createCbsRuntimeAvailabilityContract 함수.
 * initialize result와 normalized payload가 재사용할 공통 runtime-facing availability view를 생성함.
 *
 * @returns active/deferred/workspace-disabled 상태를 한곳에 모은 계약
 */
export function createCbsRuntimeAvailabilityContract(
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
): CbsRuntimeAvailabilityContract {
  return {
    companions: {
      luals: lualsRuntime,
    },
    excludedArtifacts: EXCLUDED_ARTIFACT_AVAILABILITY,
    featureAvailability: {
      ...ACTIVE_FEATURE_AVAILABILITY,
      ...DEFERRED_SCOPE_CONTRACT.featureAvailability,
    },
  };
}

function compareAvailabilityEntries(
  left: NormalizedAvailabilitySnapshotEntry,
  right: NormalizedAvailabilitySnapshotEntry,
): number {
  return (
    left.scope.localeCompare(right.scope) ||
    left.key.localeCompare(right.key) ||
    left.source.localeCompare(right.source) ||
    left.detail.localeCompare(right.detail)
  );
}

function createNormalizedAvailabilityEntries(
  entries: Record<string, AgentMetadataAvailabilityContract>,
): NormalizedAvailabilitySnapshotEntry[] {
  return Object.entries(entries)
    .map(([key, availability]) => ({
      key,
      scope: availability.scope,
      source: availability.source,
      detail: availability.detail,
    }))
    .sort(compareAvailabilityEntries);
}

/**
 * createNormalizedRuntimeAvailabilitySnapshot 함수.
 * trace와 snapshot 테스트가 그대로 읽을 수 있는 stable JSON view를 생성함.
 *
 * @returns artifacts/features availability를 정렬한 snapshot-friendly view
 */
export function createNormalizedRuntimeAvailabilitySnapshot(
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
): NormalizedRuntimeAvailabilitySnapshot {
  const contract = createCbsRuntimeAvailabilityContract(lualsRuntime);

  return {
    artifacts: createNormalizedAvailabilityEntries(
      contract.excludedArtifacts as unknown as Record<string, AgentMetadataAvailabilityContract>,
    ),
    companions: Object.values(contract.companions).sort((left, right) => left.key.localeCompare(right.key)),
    features: createNormalizedAvailabilityEntries(
      contract.featureAvailability as unknown as Record<string, AgentMetadataAvailabilityContract>,
    ),
  };
}

export interface AvailabilityTraceEntry {
  availabilityDetail: string;
  availabilityScope: AgentMetadataAvailabilityScope;
  availabilitySource: string;
  key: string;
}

export interface RuntimeAvailabilityTracePayload {
  artifacts: AvailabilityTraceEntry[];
  companions: LuaLsCompanionRuntime[];
  features: AvailabilityTraceEntry[];
}

function createAvailabilityTraceEntries(
  entries: readonly NormalizedAvailabilitySnapshotEntry[],
): AvailabilityTraceEntry[] {
  return entries.map((entry) => ({
    key: entry.key,
    availabilityScope: entry.scope,
    availabilitySource: entry.source,
    availabilityDetail: entry.detail,
  }));
}

/**
 * createRuntimeAvailabilityTracePayload 함수.
 * trace layer에서 바로 읽을 수 있는 availability payload를 생성함.
 *
 * @returns availabilityScope/source/detail 필드를 가진 trace payload
 */
export function createRuntimeAvailabilityTracePayload(
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
): RuntimeAvailabilityTracePayload {
  const snapshot = createNormalizedRuntimeAvailabilitySnapshot(lualsRuntime);

  return {
    artifacts: createAvailabilityTraceEntries(snapshot.artifacts),
    companions: snapshot.companions,
    features: createAvailabilityTraceEntries(snapshot.features),
  };
}
