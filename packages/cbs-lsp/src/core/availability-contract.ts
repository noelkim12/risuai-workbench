/**
 * CBS LSP runtime-facing availability contract shared by server info, traces, and normalized payload snapshots.
 * @file packages/cbs-lsp/src/core/availability-contract.ts
 */

import {
  createCbsAgentProtocolMarker,
  createAgentMetadataAvailability,
  type CbsAgentProtocolMarker,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataAvailabilityScope,
} from './agent-metadata';

export interface ActiveFeatureAvailabilityMap {
  codeAction: AgentMetadataAvailabilityContract;
  codelens: AgentMetadataAvailabilityContract;
  completion: AgentMetadataAvailabilityContract;
  definition: AgentMetadataAvailabilityContract;
  diagnostics: AgentMetadataAvailabilityContract;
  documentHighlight: AgentMetadataAvailabilityContract;
  documentSymbol: AgentMetadataAvailabilityContract;
  formatting: AgentMetadataAvailabilityContract;
  folding: AgentMetadataAvailabilityContract;
  hover: AgentMetadataAvailabilityContract;
  inlayHint: AgentMetadataAvailabilityContract;
  selectionRange: AgentMetadataAvailabilityContract;
  'lua-completion': AgentMetadataAvailabilityContract;
  'lua-diagnostics': AgentMetadataAvailabilityContract;
  luaHover: AgentMetadataAvailabilityContract;
  references: AgentMetadataAvailabilityContract;
  rename: AgentMetadataAvailabilityContract;
  semanticTokens: AgentMetadataAvailabilityContract;
  signature: AgentMetadataAvailabilityContract;
}

export interface DeferredFeatureAvailabilityMap {
  'cross-language-code-action': AgentMetadataAvailabilityContract;
  'cross-language-rename': AgentMetadataAvailabilityContract;
  'cross-language-workspace-edit': AgentMetadataAvailabilityContract;
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

export type RuntimeOperatorInstallMode = 'global' | 'local-devDependency' | 'npx';

export type RuntimeOperatorWorkspaceRootSource =
  | 'document-artifact-path'
  | 'initialize.rootUri'
  | 'initialize.workspaceFolders[0]'
  | 'none'
  | 'runtime-config.workspacePath';

export type RuntimeOperatorFailureModeKey =
  | 'luals-unavailable'
  | 'multi-root-reduced'
  | 'watched-files-client-unsupported'
  | 'workspace-root-unresolved';

export interface RuntimeOperatorInstallContract {
  binaryName: 'cbs-language-server';
  installModes: readonly RuntimeOperatorInstallMode[];
  pathRequirement: 'required-for-global';
  transport: 'stdio';
  detail: string;
}

export interface RuntimeOperatorWorkspaceContract {
  documentFallbackSource: 'document-artifact-path';
  initializeWorkspaceFolderCount: number;
  multiRootMode: 'first-workspace-folder';
  resolvedWorkspaceRoot: string | null;
  resolvedWorkspaceRootSource: RuntimeOperatorWorkspaceRootSource;
  startupSelectionOrder: readonly RuntimeOperatorWorkspaceRootSource[];
  detail: string;
}

export interface RuntimeOperatorDocsContract {
  agentIntegration: 'packages/cbs-lsp/docs/AGENT_INTEGRATION.md';
  compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md';
  lualsCompanion: 'packages/cbs-lsp/docs/LUALS_COMPANION.md';
  readme: 'packages/cbs-lsp/README.md';
  standaloneUsage: 'packages/cbs-lsp/docs/STANDALONE_USAGE.md';
  troubleshooting: 'packages/cbs-lsp/docs/TROUBLESHOOTING.md';
  vscodeClient: 'packages/vscode/README.md';
}

export interface RuntimeOperatorFailureModeContract {
  active: boolean;
  detail: string;
  key: RuntimeOperatorFailureModeKey;
  recovery: string;
  severity: 'info' | 'warning';
}

export interface RuntimeOperatorContract {
  docs: RuntimeOperatorDocsContract;
  failureModes: RuntimeOperatorFailureModeContract[];
  install: RuntimeOperatorInstallContract;
  scope: RuntimeOperatorScopeContract;
  workspace: RuntimeOperatorWorkspaceContract;
}

export interface RuntimeOperatorScopeContract {
  deferredEditFeatures: readonly [
    'cross-language-rename',
    'cross-language-workspace-edit',
    'cross-language-code-action',
  ];
  detail: string;
  multiFileEdit: 'off';
  readOnlyBridge: 'on';
}

export interface RuntimeOperatorContractOptions {
  initializeWorkspaceFolderCount?: number;
  resolvedWorkspaceRoot?: string | null;
  resolvedWorkspaceRootSource?: RuntimeOperatorWorkspaceRootSource;
  watchedFilesDynamicRegistration?: boolean;
}

export interface CbsRuntimeAvailabilityContract {
  companions: CompanionRuntimeMap;
  excludedArtifacts: ExcludedArtifactAvailabilityMap;
  featureAvailability: ActiveFeatureAvailabilityMap & DeferredFeatureAvailabilityMap;
  operator: RuntimeOperatorContract;
}

export interface NormalizedAvailabilitySnapshotEntry extends AgentMetadataAvailabilityContract {
  key: string;
}

export interface NormalizedRuntimeAvailabilitySnapshot extends CbsAgentProtocolMarker {
  artifacts: NormalizedAvailabilitySnapshotEntry[];
  companions: LuaLsCompanionRuntime[];
  features: NormalizedAvailabilitySnapshotEntry[];
  operator: RuntimeOperatorContract;
}

export const CBS_RUNTIME_AVAILABILITY_REQUEST_METHOD = 'cbs/runtimeAvailability';

export interface RuntimeAvailabilityRequestParams {
  refresh?: 'current-session';
}

export type WorkspaceAwareInteractiveFeature = 'completion' | 'hover';

const RUNTIME_OPERATOR_DOCS = Object.freeze({
  agentIntegration: 'packages/cbs-lsp/docs/AGENT_INTEGRATION.md',
  compatibility: 'packages/cbs-lsp/docs/COMPATIBILITY.md',
  lualsCompanion: 'packages/cbs-lsp/docs/LUALS_COMPANION.md',
  readme: 'packages/cbs-lsp/README.md',
  standaloneUsage: 'packages/cbs-lsp/docs/STANDALONE_USAGE.md',
  troubleshooting: 'packages/cbs-lsp/docs/TROUBLESHOOTING.md',
  vscodeClient: 'packages/vscode/README.md',
}) satisfies RuntimeOperatorDocsContract;

const RUNTIME_OPERATOR_INSTALL = Object.freeze({
  binaryName: 'cbs-language-server',
  installModes: ['local-devDependency', 'npx', 'global'] as const,
  pathRequirement: 'required-for-global',
  transport: 'stdio',
  detail:
    'Use a repo-pinned local install, ephemeral `npx`, or a global install with `cbs-language-server` available on PATH. All supported entry modes attach over stdio.',
}) satisfies RuntimeOperatorInstallContract;

const DEFAULT_STARTUP_SELECTION_ORDER = Object.freeze([
  'runtime-config.workspacePath',
  'initialize.workspaceFolders[0]',
  'initialize.rootUri',
]) satisfies readonly RuntimeOperatorWorkspaceRootSource[];

/**
 * createStaleWorkspaceAvailability 함수.
 * workspace snapshot freshness mismatch 때문에 cross-file 결과를 억제할 때 쓸 공통 availability contract를 생성함.
 *
 * @param feature - stale workspace 영향을 받는 interactive feature 이름
 * @param detail - 왜 local-only degrade가 되었는지 설명하는 안정적인 문구
 * @returns stale workspace fallback을 설명하는 availability contract
 */
export function createStaleWorkspaceAvailability(
  feature: WorkspaceAwareInteractiveFeature,
  detail: string,
): AgentMetadataAvailabilityContract {
  return createAgentMetadataAvailability('local-only', `workspace-snapshot:${feature}`, detail);
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
  documentHighlight: createAgentMetadataAvailability(
    'local-only',
    'server-capability:documentHighlight',
    'Document highlights are active for routed CBS fragments, classify fragment-local read/write occurrences for the current symbol, and never widen into workspace-wide references.',
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
  inlayHint: createAgentMetadataAvailability(
    'local-only',
    'server-capability:inlayHint',
    'Inlay hints are active for routed CBS fragments, show parameter names for setvar/getvar/call/arg, block header labels for #when/#each/#func, and never widen into workspace-wide hints.',
  ),
  selectionRange: createAgentMetadataAvailability(
    'local-only',
    'server-capability:selectionRange',
    'Selection ranges are active for routed CBS fragments, expand within the current fragment only, and follow the hierarchy: token span -> macro call -> block body -> block whole.',
  ),
  luaHover: createAgentMetadataAvailability(
    'local-only',
    'lua-provider:hover-proxy',
      'Lua hover is active for `.risulua` documents by forwarding `textDocument/hover` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable or still starting, the server returns no Lua hover result and leaves CBS capabilities unchanged.',
  ),
  'lua-completion': createAgentMetadataAvailability(
    'local-only',
    'lua-provider:completion-proxy',
    'Lua completion is active for `.risulua` documents by forwarding `textDocument/completion` to the LuaLS companion using the mirrored virtual Lua document when the sidecar is ready. If LuaLS is unavailable, crashed, or still starting, the server returns no Lua completion items and leaves CBS capabilities unchanged.',
  ),
  'lua-diagnostics': createAgentMetadataAvailability(
    'local-only',
    'lua-provider:diagnostics-proxy',
    'Lua diagnostics are active for `.risulua` documents by forwarding LuaLS `textDocument/publishDiagnostics` notifications from mirrored virtual Lua documents into host `publishDiagnostics`. If LuaLS is unavailable, crashed, or still starting, the server clears Lua diagnostics for affected documents and leaves CBS capabilities unchanged.',
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
    'cross-language-code-action',
    'cross-language-rename',
    'cross-language-workspace-edit',
    'lua-ast-fragment-routing',
  ] as const,
  featureAvailability: {
    'cross-language-code-action': createAgentMetadataAvailability(
      'deferred',
      'deferred-scope-contract:cross-language-code-action',
      'Scope honesty MVP keeps the Lua state bridge read-only: read-only bridge is on, while cross-language code actions stay off until authoritative multi-file edit merge rules exist.',
    ),
    'cross-language-rename': createAgentMetadataAvailability(
      'deferred',
      'deferred-scope-contract:cross-language-rename',
      'Scope honesty MVP keeps the Lua state bridge read-only: read-only bridge is on, while cross-language rename stays off until authoritative multi-file edit merge rules exist.',
    ),
    'cross-language-workspace-edit': createAgentMetadataAvailability(
      'deferred',
      'deferred-scope-contract:cross-language-workspace-edit',
      'Scope honesty MVP keeps the Lua state bridge read-only: read-only bridge is on, while cross-language workspace edits stay off until authoritative multi-file edit merge rules exist.',
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
      'LuaLS sidecar is not running yet. Mirrored `.risulua` hover/completion stay unavailable until the companion becomes ready, while CBS fragment features keep running normally.',
    executablePath: null,
    health: 'unavailable',
    key: 'luals',
    pid: null,
    status: 'unavailable',
    transport: 'stdio',
    ...overrides,
  };
}

function createRuntimeOperatorFailureModes(
  lualsRuntime: LuaLsCompanionRuntime,
  options: Required<RuntimeOperatorContractOptions>,
): RuntimeOperatorFailureModeContract[] {
  return [
    {
      active: options.resolvedWorkspaceRoot === null,
      detail:
        'No startup workspace root was resolved during initialize. The server can still open standalone documents, but workspace graph features stay inactive until a canonical `.risu*` artifact path reveals a root or the client provides an explicit workspace override.',
      key: 'workspace-root-unresolved',
      recovery:
        'Pass `--workspace`, set `CBS_LSP_WORKSPACE`, add `workspace` to runtime config, or send `initialize.workspaceFolders/rootUri` before relying on workspace graph features.',
      severity: 'warning',
    },
    {
      active: options.initializeWorkspaceFolderCount > 1,
      detail:
        'When multiple workspace folders are supplied, cbs-lsp currently selects only `initialize.workspaceFolders[0]` as the startup root. Additional folders are ignored until explicit multi-root orchestration lands.',
      key: 'multi-root-reduced',
      recovery:
        'Use a single canonical workspace root per server process, or start one cbs-lsp instance per extracted workspace until multi-root support becomes first-class.',
      severity: 'info',
    },
    {
      active: options.watchedFilesDynamicRegistration === false,
      detail:
        'The client does not advertise dynamic watched-file registration, so external workspace file changes are not pushed to the server. Open/change/close events for active documents still refresh diagnostics and graph state.',
      key: 'watched-files-client-unsupported',
      recovery:
        'Prefer clients that support `workspace/didChangeWatchedFiles` dynamic registration, or reopen affected documents after out-of-band file changes.',
      severity: 'info',
    },
    {
      active: lualsRuntime.status === 'unavailable' || lualsRuntime.status === 'crashed',
      detail:
        'LuaLS is unavailable or unhealthy, so `.risulua` companion features degrade to CBS-only behavior. CBS fragment features continue to run without the Lua sidecar.',
      key: 'luals-unavailable',
      recovery:
        'Install LuaLS, ensure the executable is on PATH or pass `--luals-path`. After a crash, cbs-lsp retries the sidecar automatically with bounded backoff; if the companion stays degraded after the retry budget, restart or reinitialize the server.',
      severity: 'warning',
    },
  ];
}

/**
 * createRuntimeOperatorContract 함수.
 * standalone 설치/실행/실패 모드를 runtime payload에서 재사용할 operator 계약으로 정리함.
 *
 * @param lualsRuntime - 현재 LuaLS sidecar runtime 상태
 * @param options - workspace root 선택과 watched-files 지원 같은 운영 스냅샷
 * @returns 문서/initialize/trace가 공유할 operator UX 계약
 */
export function createRuntimeOperatorContract(
  lualsRuntime: LuaLsCompanionRuntime = createLuaLsCompanionRuntime(),
  options: RuntimeOperatorContractOptions = {},
): RuntimeOperatorContract {
  const normalizedOptions: Required<RuntimeOperatorContractOptions> = {
    initializeWorkspaceFolderCount: options.initializeWorkspaceFolderCount ?? 0,
    resolvedWorkspaceRoot: options.resolvedWorkspaceRoot ?? null,
    resolvedWorkspaceRootSource: options.resolvedWorkspaceRootSource ?? 'none',
    watchedFilesDynamicRegistration: options.watchedFilesDynamicRegistration ?? false,
  };

  return {
    docs: RUNTIME_OPERATOR_DOCS,
    failureModes: createRuntimeOperatorFailureModes(lualsRuntime, normalizedOptions),
    install: RUNTIME_OPERATOR_INSTALL,
    scope: {
      deferredEditFeatures: [
        'cross-language-rename',
        'cross-language-workspace-edit',
        'cross-language-code-action',
      ],
      detail:
        'Scope honesty MVP keeps read-only bridge on and multi-file edit off. Cross-language rename, workspace edit, and code action stay deferred until authoritative edit merge rules exist.',
      multiFileEdit: 'off',
      readOnlyBridge: 'on',
    },
    workspace: {
      detail:
        'Startup root selection prefers runtime-config workspace overrides, then the first initialize workspace folder, then legacy rootUri. If initialize leaves the root unresolved, opened canonical `.risu*` artifact paths can still derive a workspace root for workspace graph features.',
      documentFallbackSource: 'document-artifact-path',
      initializeWorkspaceFolderCount: normalizedOptions.initializeWorkspaceFolderCount,
      multiRootMode: 'first-workspace-folder',
      resolvedWorkspaceRoot: normalizedOptions.resolvedWorkspaceRoot,
      resolvedWorkspaceRootSource: normalizedOptions.resolvedWorkspaceRootSource,
      startupSelectionOrder: DEFAULT_STARTUP_SELECTION_ORDER,
    },
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
  operatorOptions: RuntimeOperatorContractOptions = {},
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
    operator: createRuntimeOperatorContract(lualsRuntime, operatorOptions),
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
  operatorOptions: RuntimeOperatorContractOptions = {},
): NormalizedRuntimeAvailabilitySnapshot {
  const contract = createCbsRuntimeAvailabilityContract(lualsRuntime, operatorOptions);

  return {
    ...createCbsAgentProtocolMarker(),
    artifacts: createNormalizedAvailabilityEntries(
      contract.excludedArtifacts as unknown as Record<string, AgentMetadataAvailabilityContract>,
    ),
    companions: Object.values(contract.companions).sort((left, right) => left.key.localeCompare(right.key)),
    features: createNormalizedAvailabilityEntries(
      contract.featureAvailability as unknown as Record<string, AgentMetadataAvailabilityContract>,
    ),
    operator: contract.operator,
  };
}

export interface AvailabilityTraceEntry {
  availabilityDetail: string;
  availabilityScope: AgentMetadataAvailabilityScope;
  availabilitySource: string;
  key: string;
}

export interface RuntimeAvailabilityTracePayload extends CbsAgentProtocolMarker {
  artifacts: AvailabilityTraceEntry[];
  companions: LuaLsCompanionRuntime[];
  features: AvailabilityTraceEntry[];
  operator: RuntimeOperatorContract;
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
  operatorOptions: RuntimeOperatorContractOptions = {},
): RuntimeAvailabilityTracePayload {
  const snapshot = createNormalizedRuntimeAvailabilitySnapshot(lualsRuntime, operatorOptions);

  return {
    ...createCbsAgentProtocolMarker(),
    artifacts: createAvailabilityTraceEntries(snapshot.artifacts),
    companions: snapshot.companions,
    features: createAvailabilityTraceEntries(snapshot.features),
    operator: snapshot.operator,
  };
}
