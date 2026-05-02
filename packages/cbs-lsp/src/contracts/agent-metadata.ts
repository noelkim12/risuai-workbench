/**
 * completion/hover/symbol provider가 공통으로 재사용할 agent-friendly category contract.
 * @file packages/cbs-lsp/src/contracts/agent-metadata.ts
 */

/**
 * 에이전트 친화적 메타데이터 카테고리.
 * Completion, Hover, Symbol Provider 등에서 결과물의 성격을 분류하는 데 사용함.
 */
export type AgentMetadataCategory =
  | 'builtin'
  | 'block-keyword'
  | 'variable'
  | 'contextual-token'
  | 'metadata-key'
  | 'snippet'
  | 'expression-operator';

/**
 * 메타데이터 카테고리 내 세부 종류(Kind).
 * 각 카테고리별로 더 구체적인 심볼의 역할을 정의함.
 */
export type AgentMetadataKind =
  | 'callable-builtin'
  | 'documentation-only-builtin'
  | 'contextual-builtin'
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

/** CBS 에이전트 프로토콜 스키마 식별자. */
export const CBS_AGENT_PROTOCOL_SCHEMA = 'cbs-lsp-agent-contract';
/** CBS 에이전트 프로토콜 현재 버전. */
export const CBS_AGENT_PROTOCOL_VERSION = '1.0.0';

/**
 * CBS 에이전트 프로토콜 마커 인터페이스.
 * 페이로드의 스키마와 버전을 명시하여 호환성을 보장함.
 */
export interface CbsAgentProtocolMarker {
  schema: typeof CBS_AGENT_PROTOCOL_SCHEMA;
  schemaVersion: typeof CBS_AGENT_PROTOCOL_VERSION;
}

/**
 * 에이전트 메타데이터 카테고리 계약.
 * 결과물이 어떤 카테고리와 종류에 속하는지 정의함.
 */
export interface AgentMetadataCategoryContract {
  category: AgentMetadataCategory;
  kind: AgentMetadataKind;
}

/**
 * 메타데이터 설명 생성 사유.
 * 결과가 도출된 분석 단계나 출처를 나타냄.
 */
export type AgentMetadataExplanationReason =
  | 'registry-lookup'
  | 'scope-analysis'
  | 'contextual-inference'
  | 'diagnostic-taxonomy';

/**
 * 에이전트 메타데이터 설명 계약.
 * 결과물이 생성된 근거와 상세 내용을 에이전트에게 전달함.
 */
export interface AgentMetadataExplanationContract {
  reason: AgentMetadataExplanationReason;
  source: string;
  detail: string;
}

/**
 * 에이전트 메타데이터 가용성 범위.
 * 기능이나 심볼이 현재 컨텍스트에서 사용 가능한 범위를 정의함.
 */
export type AgentMetadataAvailabilityScope =
  | 'local-only'
  | 'local-first'
  | 'deferred'
  | 'workspace-disabled';

/**
 * 에이전트 메타데이터 가용성 계약.
 * 현재 기능의 가용 상태와 그 판단 근거를 정의함.
 */
export interface AgentMetadataAvailabilityContract {
  scope: AgentMetadataAvailabilityScope;
  source: string;
  detail: string;
}

/** 워크스페이스 스냅샷의 최신성 상태. */
export type AgentMetadataWorkspaceFreshness = 'fresh' | 'stale';

/**
 * 워크스페이스 스냅샷 계약.
 * 워크스페이스 인식형 프로바이더가 현재 분석 상태의 최신성을 전달할 때 사용함.
 */
export interface AgentMetadataWorkspaceSnapshotContract extends CbsAgentProtocolMarker {
  rootPath: string;
  snapshotVersion: number;
  requestVersion: string | number;
  trackedDocumentVersion: string | number | null;
  freshness: AgentMetadataWorkspaceFreshness;
  detail: string;
}

/**
 * 에이전트 메타데이터 엔벨로프.
 * LSP 응답 페이로드의 `data` 필드 등에 포함될 최종 CBS 메타데이터 구조.
 */
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
 * 공통으로 사용할 스키마 및 버전 마커를 생성함.
 *
 * @returns 생성된 프로토콜 마커
 */
export function createCbsAgentProtocolMarker(): CbsAgentProtocolMarker {
  return {
    schema: CBS_AGENT_PROTOCOL_SCHEMA,
    schemaVersion: CBS_AGENT_PROTOCOL_VERSION,
  };
}

/**
 * createAgentMetadataAvailability 함수.
 * 가용성(Availability) 메타데이터 계약을 생성함.
 *
 * @param scope - 가용성 범위
 * @param source - 판단 근거 출처
 * @param detail - 가용 상태에 대한 상세 설명
 * @returns 가용성 메타데이터 계약 객체
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
 * 근거 설명(Explanation) 메타데이터 계약을 생성함.
 *
 * @param reason - 결과 도출 사유
 * @param source - 분석 소스 식별자
 * @param detail - 분석 결과 요약 설명
 * @returns 설명 메타데이터 계약 객체
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
 * 워크스페이스 스냅샷 메타데이터 계약을 생성함.
 *
 * @param workspace - 스냅샷 상세 정보
 * @returns 워크스페이스 스냅샷 계약 객체
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
 * 최종 에이전트 메타데이터 엔벨로프를 생성함.
 *
 * @param category - 카테고리 및 종류 정보
 * @param explanation - (선택) 근거 설명 정보
 * @param availability - (선택) 가용성 정보
 * @param workspace - (선택) 워크스페이스 스냅샷 정보
 * @returns 완성된 메타데이터 엔벨로프 객체
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
  // 기본 객체 여부 확인
  if (!value || typeof value !== 'object') {
    return false;
  }

  const envelope = value as Partial<AgentMetadataEnvelope>;
  const availability = envelope.cbs?.availability;
  const category = envelope.cbs?.category;
  const explanation = envelope.cbs?.explanation;
  const workspace = envelope.cbs?.workspace;

  // 가용성(Availability) 정보가 포함된 경우 필드 타입 검증
  if (availability) {
    const validAvailability =
      typeof availability.scope === 'string' &&
      typeof availability.source === 'string' &&
      typeof availability.detail === 'string';

    if (!validAvailability) {
      return false;
    }
  }

  // 필수 필드(스키마, 버전, 카테고리) 존재 여부 및 타입 검증
  if (
    envelope.cbs?.schema !== CBS_AGENT_PROTOCOL_SCHEMA ||
    envelope.cbs?.schemaVersion !== CBS_AGENT_PROTOCOL_VERSION ||
    !category ||
    typeof category.category !== 'string' ||
    typeof category.kind !== 'string'
  ) {
    return false;
  }

  // 설명(Explanation) 정보가 없는 경우 워크스페이스 정보만 추가 검증
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

  // 설명(Explanation) 정보가 포함된 경우 필드 타입 검증
  const validExplanation = (
    typeof explanation.reason === 'string' &&
    typeof explanation.source === 'string' &&
    typeof explanation.detail === 'string'
  );

  if (!validExplanation) {
    return false;
  }

  // 워크스페이스 정보가 없는 경우 최종 true 반환
  if (!workspace) {
    return true;
  }

  // 워크스페이스(Workspace) 정보가 포함된 경우 전체 필드 유효성 검증
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
