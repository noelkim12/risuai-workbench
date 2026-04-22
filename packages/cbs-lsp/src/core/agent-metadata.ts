/**
 * completion/hover/symbol provider가 공통으로 재사용할 agent-friendly category contract.
 * @file packages/cbs-lsp/src/core/agent-metadata.ts
 */

export type AgentMetadataCategory =
  | 'builtin'
  | 'block-keyword'
  | 'variable'
  | 'contextual-token'
  | 'metadata-key'
  | 'snippet'
  | 'expression-operator';

export type AgentMetadataKind =
  | 'callable-builtin'
  | 'documentation-only-builtin'
  | 'block-close'
  | 'else-keyword'
  | 'chat-variable'
  | 'temp-variable'
  | 'global-variable'
  | 'loop-alias'
  | 'local-function'
  | 'argument-index'
  | 'when-operator'
  | 'calc-expression-zone'
  | 'metadata-property'
  | 'block-snippet'
  | 'calc-operator';

export const CBS_AGENT_PROTOCOL_SCHEMA = 'cbs-lsp-agent-contract';
export const CBS_AGENT_PROTOCOL_VERSION = '1.0.0';

export interface CbsAgentProtocolMarker {
  schema: typeof CBS_AGENT_PROTOCOL_SCHEMA;
  schemaVersion: typeof CBS_AGENT_PROTOCOL_VERSION;
}

export interface AgentMetadataCategoryContract {
  category: AgentMetadataCategory;
  kind: AgentMetadataKind;
}

export type AgentMetadataExplanationReason =
  | 'registry-lookup'
  | 'scope-analysis'
  | 'contextual-inference'
  | 'diagnostic-taxonomy';

export interface AgentMetadataExplanationContract {
  reason: AgentMetadataExplanationReason;
  source: string;
  detail: string;
}

export type AgentMetadataAvailabilityScope =
  | 'local-only'
  | 'local-first'
  | 'deferred'
  | 'workspace-disabled';

export interface AgentMetadataAvailabilityContract {
  scope: AgentMetadataAvailabilityScope;
  source: string;
  detail: string;
}

export type AgentMetadataWorkspaceFreshness = 'fresh' | 'stale';

export interface AgentMetadataWorkspaceSnapshotContract extends CbsAgentProtocolMarker {
  rootPath: string;
  snapshotVersion: number;
  requestVersion: string | number;
  trackedDocumentVersion: string | number | null;
  freshness: AgentMetadataWorkspaceFreshness;
  detail: string;
}

export interface AgentMetadataEnvelope {
  cbs: {
    schema: typeof CBS_AGENT_PROTOCOL_SCHEMA;
    schemaVersion: typeof CBS_AGENT_PROTOCOL_VERSION;
    availability?: AgentMetadataAvailabilityContract;
    category: AgentMetadataCategoryContract;
    explanation?: AgentMetadataExplanationContract;
    workspace?: AgentMetadataWorkspaceSnapshotContract;
  };
}

/**
 * createCbsAgentProtocolMarker 함수.
 * agent-facing public payload가 공유할 stable schema/version marker를 생성함.
 *
 * @returns 공통 schema/version marker
 */
export function createCbsAgentProtocolMarker(): CbsAgentProtocolMarker {
  return {
    schema: CBS_AGENT_PROTOCOL_SCHEMA,
    schemaVersion: CBS_AGENT_PROTOCOL_VERSION,
  };
}

/**
 * createAgentMetadataAvailability 함수.
 * feature/provider availability honesty contract를 생성함.
 *
 * @param scope - local-only/local-first/deferred/workspace-disabled 중 현재 availability 범위
 * @param source - availability 판단의 source label
 * @param detail - 현재 범위가 왜 그런지 설명하는 안정적인 문구
 * @returns payload/capability/readme가 공통으로 재사용할 availability contract
 */
export function createAgentMetadataAvailability(
  scope: AgentMetadataAvailabilityScope,
  source: string,
  detail: string,
): AgentMetadataAvailabilityContract {
  return {
    scope,
    source,
    detail,
  };
}

/**
 * createAgentMetadataExplanation 함수.
 * agent-friendly explanation metadata contract를 생성함.
 *
 * @param reason - 결과가 어떤 provenance category에서 비롯됐는지 나타내는 stable reason 값
 * @param source - reason을 만든 구체적인 source label
 * @param detail - source가 현재 결과를 만든 이유를 짧게 요약한 설명
 * @returns provider payload와 snapshot helper가 공통으로 재사용할 explanation contract
 */
export function createAgentMetadataExplanation(
  reason: AgentMetadataExplanationReason,
  source: string,
  detail: string,
): AgentMetadataExplanationContract {
  return {
    reason,
    source,
    detail,
  };
}

/**
 * createAgentMetadataWorkspaceSnapshot 함수.
 * workspace-aware provider가 현재 snapshot freshness를 data envelope에 실을 때 쓰는 공통 구조를 생성함.
 *
 * @param workspace - 현재 요청과 비교한 workspace snapshot freshness 정보
 * @returns completion/hover payload에 붙일 workspace snapshot contract
 */
export function createAgentMetadataWorkspaceSnapshot(
  workspace: Omit<AgentMetadataWorkspaceSnapshotContract, keyof CbsAgentProtocolMarker>,
): AgentMetadataWorkspaceSnapshotContract {
  return {
    ...createCbsAgentProtocolMarker(),
    ...workspace,
  };
}

/**
 * createAgentMetadataEnvelope 함수.
 * provider payload에 붙일 공통 agent metadata envelope를 생성함.
 *
 * @param category - 결과가 어떤 stable category/kind에 속하는지 나타내는 구조화된 값
 * @returns completion/hover/symbol payload에서 그대로 재사용할 metadata envelope
 */
export function createAgentMetadataEnvelope(
  category: AgentMetadataCategoryContract,
  explanation?: AgentMetadataExplanationContract,
  availability?: AgentMetadataAvailabilityContract,
  workspace?: AgentMetadataWorkspaceSnapshotContract,
): AgentMetadataEnvelope {
  return {
    cbs: {
      ...createCbsAgentProtocolMarker(),
      availability,
      category,
      explanation,
      workspace,
    },
  };
}

/**
 * isAgentMetadataEnvelope 함수.
 * unknown payload가 CBS agent metadata envelope 구조를 따르는지 검사함.
 *
 * @param value - 판별할 임의 값
 * @returns CBS agent metadata envelope이면 true
 */
export function isAgentMetadataEnvelope(value: unknown): value is AgentMetadataEnvelope {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const envelope = value as Partial<AgentMetadataEnvelope>;
  const availability = envelope.cbs?.availability;
  const category = envelope.cbs?.category;
  const explanation = envelope.cbs?.explanation;
  const workspace = envelope.cbs?.workspace;

  if (availability) {
    const validAvailability =
      typeof availability.scope === 'string' &&
      typeof availability.source === 'string' &&
      typeof availability.detail === 'string';

    if (!validAvailability) {
      return false;
    }
  }

  if (
    envelope.cbs?.schema !== CBS_AGENT_PROTOCOL_SCHEMA ||
    envelope.cbs?.schemaVersion !== CBS_AGENT_PROTOCOL_VERSION ||
    !category ||
    typeof category.category !== 'string' ||
    typeof category.kind !== 'string'
  ) {
    return false;
  }

  if (!explanation) {
    if (!workspace) {
      return true;
    }

    return (
      workspace.schema === CBS_AGENT_PROTOCOL_SCHEMA &&
      workspace.schemaVersion === CBS_AGENT_PROTOCOL_VERSION &&
      typeof workspace.rootPath === 'string' &&
      typeof workspace.snapshotVersion === 'number' &&
      (typeof workspace.requestVersion === 'number' || typeof workspace.requestVersion === 'string') &&
      (workspace.trackedDocumentVersion === null ||
        typeof workspace.trackedDocumentVersion === 'number' ||
        typeof workspace.trackedDocumentVersion === 'string') &&
      typeof workspace.freshness === 'string' &&
      typeof workspace.detail === 'string'
    );
  }

  const validExplanation = (
    typeof explanation.reason === 'string' &&
    typeof explanation.source === 'string' &&
    typeof explanation.detail === 'string'
  );

  if (!validExplanation) {
    return false;
  }

  if (!workspace) {
    return true;
  }

  return (
    workspace.schema === CBS_AGENT_PROTOCOL_SCHEMA &&
    workspace.schemaVersion === CBS_AGENT_PROTOCOL_VERSION &&
    typeof workspace.rootPath === 'string' &&
    typeof workspace.snapshotVersion === 'number' &&
    (typeof workspace.requestVersion === 'number' || typeof workspace.requestVersion === 'string') &&
    (workspace.trackedDocumentVersion === null ||
      typeof workspace.trackedDocumentVersion === 'number' ||
      typeof workspace.trackedDocumentVersion === 'string') &&
    typeof workspace.freshness === 'string' &&
    typeof workspace.detail === 'string'
  );
}
