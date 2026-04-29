/**
 * 에이전트와 CLI가 공유하는 Layer 1 및 Layer 3 보조 계약 번들.
 *
 * 이 모듈은 `ElementRegistrySnapshot`, `UnifiedVariableGraphSnapshot`,
 * `ActivationChainQueryResult`, `VariableFlowQueryResult`를 안정적인 데이터 교환 형식으로
 * 정규화함. 여기서 '계약(Contract)'은 단순한 TypeScript 타입 선언이 아니라, 에이전트, CLI,
 * 테스트, 향후 MCP 어댑터가 동일한 의미로 신뢰할 수 있는 공개 읽기 전용 스냅샷 규격을 뜻함.
 *
 * Layer 1은 워크스페이스 전역의 파일, 요소, 변수 그래프를 다루는 추상화 계층.
 * Layer 3은 Layer 1 그래프를 기반으로 특정 변수 흐름이나 로어북 활성화 체인을 조회한
 * 결과를 다루는 추상화 계층.
 *
 * 이 파일의 descriptor는 각 스냅샷에서 안정적으로 유지되는 필드, nullable 경계,
 * 빈 배열과 null의 의미, 결정적 정렬 기준, 신뢰 가능한 소비 표면을 명시함.
 * 이를 통해 에이전트는 런타임 내부 구현을 추측하지 않고도 이 계약을 기준으로 직렬화된 JSON을
 * 안전하게 해석할 수 있음.
 *
 * @file packages/cbs-lsp/src/contracts/agent-contracts.ts
 */

import { createCbsAgentProtocolMarker, type CbsAgentProtocolMarker } from './agent-metadata';
import type { ElementRegistrySnapshot, UnifiedVariableGraphSnapshot } from '../indexer';
import type { ActivationChainQueryResult, VariableFlowQueryResult } from '../services';

/**
 * Layer1WorkspaceSnapshotContractDescriptor 인터페이스.
 * 워크스페이스 전역 인덱싱 정보의 구조와 안정성 정책을 정의함.
 */
export interface Layer1WorkspaceSnapshotContractDescriptor {
  /**
   * 이 계약이 속한 분석 추상화 계층.
   * `layer1`은 워크스페이스 전역 인덱싱 계층을 의미함.
   */
  layer: 'layer1';

  /**
   * 공개 계약의 안정성 수준.
   * `stable-public-read-contract`는 에이전트와 CLI가 읽기 전용으로 소비할 수 있는 안정 규격임을 나타냄.
   */
  stability: 'stable-public-read-contract';

  /**
   * 이 계약을 직접 소비하도록 설계된 대상 목록.
   */
  intendedConsumers: readonly ['agent', 'cli', 'tests'];

  /**
   * 이 스냅샷을 신뢰할 수 있는 범위와 권한 모델.
   */
  trust: {
    /** 에이전트가 내부 구현 조회 없이 이 스냅샷을 직접 신뢰해도 되는지 여부. */
    agentsMayTrustSnapshotDirectly: true;
    /** 워크스페이스 전역 추론의 기반 데이터로 사용하기에 구조가 충분히 안정적인지 여부. */
    stableForWorkspaceReasoning: true;
    /** 이 계약을 통한 쓰기 기능 포함 여부. Layer 1은 읽기 전용임. */
    writeCapabilitiesIncluded: false;
    /** 이 계약을 생성하는 권위 있는 헬퍼 함수 명칭. */
    authority: 'snapshotLayer1Contracts';
  };

  /**
   * 이 계약이 외부로 노출되는 안정적인 진입 표면 정보.
   */
  surfaces: {
    /** CLI에서 Layer 1 스냅샷을 조회하는 명령. */
    cli: 'report layer1';
    /** 코드 내부에서 Layer 1 계약 번들을 생성하는 헬퍼 함수 명칭. */
    helper: 'snapshotLayer1Contracts';
  };

  /**
   * Layer 1 공개 스냅샷에서 안정적으로 유지되는 필드 정의.
   */
  stableFields: {
    /** ElementRegistrySnapshot 최상위 필드 목록. */
    registrySnapshot: readonly ['rootPath', 'files', 'elements', 'graphSeeds', 'summary'];
    /** 파일 단위 레코드에서 제공되는 상세 필드 목록. */
    fileRecord: readonly [
      'uri',
      'absolutePath',
      'relativePath',
      'text',
      'artifact',
      'artifactClass',
      'cbsBearingArtifact',
      'hasCbsFragments',
      'fragmentCount',
      'fragmentSections',
      'analysisKind',
      'elementIds',
      'graphSeedCount',
      'analysisError',
    ];
    /** 레지스트리 요소에서 제공되는 필드 목록. */
    element: readonly [
      'id',
      'uri',
      'absolutePath',
      'relativePath',
      'artifact',
      'artifactClass',
      'elementName',
      'displayName',
      'analysisKind',
      'cbs',
      'graphSeed',
    ];
    /** CBS 프래그먼트 기반 요소에서 추가로 제공되는 필드. */
    fragmentElementFields: readonly ['fragment', 'fragmentIndex'];
    /** Lua 요소에서 추가로 제공되는 필드. */
    luaElementFields: readonly ['fragment', 'lua'];
    /** 통합 변수 그래프 생성을 위한 시드 필드 목록. */
    graphSeed: readonly [
      'elementId',
      'uri',
      'relativePath',
      'artifact',
      'artifactClass',
      'elementName',
      'fragmentSection',
      'fragmentIndex',
      'analysisKind',
      'cbs',
      'hostRange',
    ];
    /** UnifiedVariableGraphSnapshot 최상위 필드 목록. */
    graphSnapshot: readonly [
      'rootPath',
      'variables',
      'totalVariables',
      'totalOccurrences',
      'variableIndex',
      'occurrencesByUri',
      'occurrencesByElementId',
      'buildTimestamp',
    ];
    /** 단일 변수 노드 요약 필드 목록. */
    variableNode: readonly ['name', 'readers', 'writers', 'occurrenceCount', 'artifacts', 'uris'];
    /** 변수 발생 내역의 원자적 데이터 필드 목록. */
    occurrence: readonly [
      'occurrenceId',
      'variableName',
      'direction',
      'sourceKind',
      'sourceName',
      'uri',
      'relativePath',
      'artifact',
      'artifactClass',
      'elementId',
      'elementName',
      'fragmentSection',
      'analysisKind',
      'hostRange',
      'hostStartOffset',
      'hostEndOffset',
      'argumentRange',
      'metadata',
    ];
    /** 발생 내역 해석을 돕는 보조 메타데이터 필드. */
    occurrenceMetadata: readonly ['fragmentIndex', 'containingFunction', 'line'];
    /** 런타임에서 파생되지만 규격상 안정적인 필드. */
    runtimeDerivedFields: readonly ['graph.buildTimestamp'];
  };

  /**
   * 직렬화 결과의 결정적 정렬 기준.
   * JSON 출력 순서의 일관성을 보장함.
   */
  deterministicOrdering: {
    /** 레지스트리 파일 목록 정렬 기준. */
    registryFiles: 'relativePath -> absolutePath';
    /** 프래그먼트 목록 정렬 기준. 시작 위치를 우선함. */
    registryFragments: 'hostRange.start -> hostRange.end -> section -> content';
    /** 변수 노드 목록 정렬 기준. */
    graphVariables: 'variableName';
    /** 발생 내역 목록 정렬 기준. */
    graphOccurrences: 'variableName -> uri -> hostStartOffset -> hostEndOffset -> occurrenceId';
    /** 인덱스 버킷 내부의 정렬 기준. */
    graphIndexes: 'occurrenceId';
  };
}

/**
 * LAYER1_WORKSPACE_SNAPSHOT_CONTRACT 상수.
 * Layer 1 워크스페이스 스냅샷 계약의 런타임 구현체.
 */
export const LAYER1_WORKSPACE_SNAPSHOT_CONTRACT: Layer1WorkspaceSnapshotContractDescriptor = {
  layer: 'layer1',
  stability: 'stable-public-read-contract',
  intendedConsumers: ['agent', 'cli', 'tests'],
  trust: {
    agentsMayTrustSnapshotDirectly: true,
    stableForWorkspaceReasoning: true,
    writeCapabilitiesIncluded: false,
    authority: 'snapshotLayer1Contracts',
  },
  surfaces: {
    cli: 'report layer1',
    helper: 'snapshotLayer1Contracts',
  },
  stableFields: {
    registrySnapshot: ['rootPath', 'files', 'elements', 'graphSeeds', 'summary'],
    fileRecord: [
      'uri',
      'absolutePath',
      'relativePath',
      'text',
      'artifact',
      'artifactClass',
      'cbsBearingArtifact',
      'hasCbsFragments',
      'fragmentCount',
      'fragmentSections',
      'analysisKind',
      'elementIds',
      'graphSeedCount',
      'analysisError',
    ],
    element: [
      'id',
      'uri',
      'absolutePath',
      'relativePath',
      'artifact',
      'artifactClass',
      'elementName',
      'displayName',
      'analysisKind',
      'cbs',
      'graphSeed',
    ],
    fragmentElementFields: ['fragment', 'fragmentIndex'],
    luaElementFields: ['fragment', 'lua'],
    graphSeed: [
      'elementId',
      'uri',
      'relativePath',
      'artifact',
      'artifactClass',
      'elementName',
      'fragmentSection',
      'fragmentIndex',
      'analysisKind',
      'cbs',
      'hostRange',
    ],
    graphSnapshot: [
      'rootPath',
      'variables',
      'totalVariables',
      'totalOccurrences',
      'variableIndex',
      'occurrencesByUri',
      'occurrencesByElementId',
      'buildTimestamp',
    ],
    variableNode: ['name', 'readers', 'writers', 'occurrenceCount', 'artifacts', 'uris'],
    occurrence: [
      'occurrenceId',
      'variableName',
      'direction',
      'sourceKind',
      'sourceName',
      'uri',
      'relativePath',
      'artifact',
      'artifactClass',
      'elementId',
      'elementName',
      'fragmentSection',
      'analysisKind',
      'hostRange',
      'hostStartOffset',
      'hostEndOffset',
      'argumentRange',
      'metadata',
    ],
    occurrenceMetadata: ['fragmentIndex', 'containingFunction', 'line'],
    runtimeDerivedFields: ['graph.buildTimestamp'],
  },
  deterministicOrdering: {
    registryFiles: 'relativePath -> absolutePath',
    registryFragments: 'hostRange.start -> hostRange.end -> section -> content',
    graphVariables: 'variableName',
    graphOccurrences: 'variableName -> uri -> hostStartOffset -> hostEndOffset -> occurrenceId',
    graphIndexes: 'occurrenceId',
  },
};

/**
 * Layer3QueryEnvelopeContractDescriptor 인터페이스.
 * 변수 흐름 및 활성화 체인 등 서비스 계층의 쿼리 결과 규격을 정의함.
 */
export interface Layer3QueryEnvelopeContractDescriptor {
  /**
   * 이 계약이 속한 분석 추상화 계층.
   * `layer3`은 특정 질문에 대한 교차 파일 쿼리 결과를 제공하는 계층을 의미함.
   */
  layer: 'layer3';

  /**
   * 공개 계약의 안정성 수준.
   * 쿼리 결과의 구조와 의미가 외부 소비 도구에서 신뢰될 수 있음을 나타냄.
   */
  stability: 'stable-public-read-contract';

  /**
   * 이 계약을 직접 소비하도록 설계된 대상 목록.
   */
  intendedConsumers: readonly ['agent', 'cli', 'mcp', 'tests'];

  /**
   * Layer 3 쿼리 엔벨로프를 신뢰할 수 있는 범위 정보.
   */
  trust: {
    /** 에이전트가 이 쿼리 스냅샷을 직접 추론 입력으로 신뢰해도 되는지 여부. */
    agentsMayTrustSnapshotDirectly: true;
    /** 파일 경계를 넘는 추론에 사용할 수 있을 만큼 결과 구조가 안정적인지 여부. */
    stableForCrossFileReasoning: true;
    /** 이 계약을 통한 쓰기 기능 포함 여부. */
    writeCapabilitiesIncluded: false;
    /** 이 계약을 생성하는 권위 있는 헬퍼 함수 명칭. */
    authority: 'snapshotLayer3Queries';
  };

  /**
   * 이 계약이 노출되는 진입 표면 정보.
   */
  surfaces: {
    /** CLI에서 제공하는 관련 쿼리 명령 목록. */
    cli: 'query variable|variable-at|activation-entry|activation-uri|activation-at';
    /** 코드 내부에서 Layer 3 계약 번들을 생성하는 헬퍼 함수 명칭. */
    helper: 'snapshotLayer3Queries';
    /** 이 엔벨로프에 결과를 공급하는 안정적인 서비스 메서드 목록. */
    services: readonly [
      'VariableFlowService.queryVariable',
      'VariableFlowService.queryAt',
      'ActivationChainService.queryEntry',
      'ActivationChainService.queryByUri',
      'ActivationChainService.queryAt',
    ];
  };

  /**
   * Layer 3 결과에서 안정적으로 유지되는 필드 목록.
   */
  stableFields: {
    /** 엔벨로프 최상위 필드. 계약 정보, 활성화 체인, 변수 흐름을 포함함. */
    envelope: readonly ['contract', 'activationChain', 'variableFlow'];
    /** 변수 흐름 조회 결과 필드. */
    variableFlow: readonly [
      'variableName',
      'node',
      'occurrences',
      'readers',
      'writers',
      'flowEntry',
      'issues',
      'defaultValue',
      'defaultDefinitions',
      'matchedOccurrence',
    ];
    /** 변수 흐름 내 발생한 이슈와 매칭된 발생 내역 필드. */
    variableFlowIssueMatch: readonly ['issue', 'occurrences'];
    /** 활성화 체인 조회 결과 필드. */
    activationChain: readonly [
      'entry',
      'file',
      'incoming',
      'outgoing',
      'possibleIncoming',
      'possibleOutgoing',
      'partialIncoming',
      'partialOutgoing',
      'blockedIncoming',
      'blockedOutgoing',
      'cycle',
    ];
    /** 활성화 매칭 항목 필드. */
    activationMatch: readonly ['entry', 'edge', 'uri', 'relativePath'];
    /** 활성화 순환 분석 요약 필드. */
    activationCycle: readonly ['entryId', 'steps', 'hops', 'maxDepth', 'hasCycles', 'cycleCount'];
    /** 활성화 순환 탐색 단계 필드. */
    activationCycleStep: readonly ['entryId', 'reason', 'matchedKeywords'];
  };

  /**
   * Null이 허용되는 필드 목록.
   * 쿼리 실패나 미적용 상태는 null로 표현하며, 빈 배열과 의미적으로 구분함.
   */
  nullableFields: {
    /** 엔벨로프 최상위에서 null일 수 있는 쿼리 결과 필드. */
    envelope: readonly ['activationChain', 'variableFlow'];
    /** 변수 흐름 결과 내에서 null일 수 있는 보조 필드. */
    variableFlow: readonly ['flowEntry', 'defaultValue', 'matchedOccurrence'];
    /** 활성화 매칭 항목에서 null일 수 있는 위치 정보. */
    activationMatch: readonly ['uri', 'relativePath'];
  };

  /**
   * 데이터가 없어도 정의상 항상 존재해야 하는 필드 목록.
   * 값이 없을 때는 null 대신 빈 배열로 제공함.
   */
  alwaysPresentButMayBeEmpty: {
    /** 변수 흐름 결과에서 항상 배열로 제공되어야 하는 목록. */
    variableFlowArrays: readonly ['occurrences', 'readers', 'writers', 'issues', 'defaultDefinitions'];
    /** 활성화 체인 관계 목록 중 항상 배열이어야 하는 필드. */
    activationArrays: readonly [
      'incoming',
      'outgoing',
      'possibleIncoming',
      'possibleOutgoing',
      'partialIncoming',
      'partialOutgoing',
      'blockedIncoming',
      'blockedOutgoing',
    ];
    /** 순환 분석 단계 목록. */
    activationCycleSteps: readonly ['steps'];
  };

  /**
   * Layer 3 쿼리 결과의 결정적 정렬 기준.
   */
  deterministicOrdering: {
    /** 변수 발생 내역 목록 정렬 기준. */
    variableOccurrences: 'occurrenceId';
    /** 리더/라이터 목록 정렬 기준. 위치 정보를 우선함. */
    variableReadersWriters: 'uri -> hostStartOffset -> hostEndOffset -> occurrenceId';
    /** 이슈 근거 발생 내역 목록 정렬 기준. */
    variableIssueOccurrences: 'occurrenceId';
    /** 활성화 매칭 목록 정렬 기준. 상태 및 ID를 우선함. */
    activationMatchLists: 'status(possible -> partial -> blocked) -> entry.id -> relativePath';
    /** 순환 탐색 단계 정렬 기준. BFS 탐색 순서를 보존함. */
    activationCycleSteps: 'BFS traversal order';
  };
}

/**
 * LAYER3_QUERY_ENVELOPE_CONTRACT 상수.
 * Layer 3 쿼리 엔벨로프 계약의 런타임 구현체.
 */
export const LAYER3_QUERY_ENVELOPE_CONTRACT: Layer3QueryEnvelopeContractDescriptor = {
  layer: 'layer3',
  stability: 'stable-public-read-contract',
  intendedConsumers: ['agent', 'cli', 'mcp', 'tests'],
  trust: {
    agentsMayTrustSnapshotDirectly: true,
    stableForCrossFileReasoning: true,
    writeCapabilitiesIncluded: false,
    authority: 'snapshotLayer3Queries',
  },
  surfaces: {
    cli: 'query variable|variable-at|activation-entry|activation-uri|activation-at',
    helper: 'snapshotLayer3Queries',
    services: [
      'VariableFlowService.queryVariable',
      'VariableFlowService.queryAt',
      'ActivationChainService.queryEntry',
      'ActivationChainService.queryByUri',
      'ActivationChainService.queryAt',
    ],
  },
  stableFields: {
    envelope: ['contract', 'activationChain', 'variableFlow'],
    variableFlow: [
      'variableName',
      'node',
      'occurrences',
      'readers',
      'writers',
      'flowEntry',
      'issues',
      'defaultValue',
      'defaultDefinitions',
      'matchedOccurrence',
    ],
    variableFlowIssueMatch: ['issue', 'occurrences'],
    activationChain: [
      'entry',
      'file',
      'incoming',
      'outgoing',
      'possibleIncoming',
      'possibleOutgoing',
      'partialIncoming',
      'partialOutgoing',
      'blockedIncoming',
      'blockedOutgoing',
      'cycle',
    ],
    activationMatch: ['entry', 'edge', 'uri', 'relativePath'],
    activationCycle: ['entryId', 'steps', 'hops', 'maxDepth', 'hasCycles', 'cycleCount'],
    activationCycleStep: ['entryId', 'reason', 'matchedKeywords'],
  },
  nullableFields: {
    envelope: ['activationChain', 'variableFlow'],
    variableFlow: ['flowEntry', 'defaultValue', 'matchedOccurrence'],
    activationMatch: ['uri', 'relativePath'],
  },
  alwaysPresentButMayBeEmpty: {
    variableFlowArrays: ['occurrences', 'readers', 'writers', 'issues', 'defaultDefinitions'],
    activationArrays: [
      'incoming',
      'outgoing',
      'possibleIncoming',
      'possibleOutgoing',
      'partialIncoming',
      'partialOutgoing',
      'blockedIncoming',
      'blockedOutgoing',
    ],
    activationCycleSteps: ['steps'],
  },
  deterministicOrdering: {
    variableOccurrences: 'occurrenceId',
    variableReadersWriters: 'uri -> hostStartOffset -> hostEndOffset -> occurrenceId',
    variableIssueOccurrences: 'occurrenceId',
    activationMatchLists: 'status(possible -> partial -> blocked) -> entry.id -> relativePath',
    activationCycleSteps: 'BFS traversal order',
  },
};

export interface NormalizedLayer1ContractSnapshot extends CbsAgentProtocolMarker {
  contract: Layer1WorkspaceSnapshotContractDescriptor;
  graph: UnifiedVariableGraphSnapshot;
  registry: ElementRegistrySnapshot;
}

export interface NormalizedLayer3QuerySnapshot extends CbsAgentProtocolMarker {
  contract: Layer3QueryEnvelopeContractDescriptor;
  activationChain: ActivationChainQueryResult | null;
  variableFlow: VariableFlowQueryResult | null;
}

/**
 * snapshotLayer1Contracts 함수.
 * Layer 1 워크스페이스 스냅샷을 에이전트와 CLI가 신뢰할 수 있는 공개 계약 번들로 정규화함.
 *
 * @param registry - Layer 1 요소 레지스트리 스냅샷
 * @param graph - Layer 1 통합 변수 그래프 스냅샷
 * @returns 정규화된 Layer 1 공개 계약 번들
 */
export function snapshotLayer1Contracts(
  registry: ElementRegistrySnapshot,
  graph: UnifiedVariableGraphSnapshot,
): NormalizedLayer1ContractSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    contract: LAYER1_WORKSPACE_SNAPSHOT_CONTRACT,
    graph,
    registry,
  };
}

/**
 * snapshotLayer3Queries 함수.
 * Layer 3 쿼리 결과를 에이전트와 CLI가 신뢰할 수 있는 공개 계약 엔벨로프로 정규화함.
 *
 * @param bundle - 활성화 체인 및 변수 흐름 쿼리 결과 묶음
 * @returns 정규화된 Layer 3 공개 계약 엔벨로프
 */
export function snapshotLayer3Queries(bundle: {
  activationChain: ActivationChainQueryResult | null;
  variableFlow: VariableFlowQueryResult | null;
}): NormalizedLayer3QuerySnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    contract: LAYER3_QUERY_ENVELOPE_CONTRACT,
    activationChain: bundle.activationChain,
    variableFlow: bundle.variableFlow,
  };
}

/**
 * serializeAgentContractForJson 함수.
 * 에이전트용 계약 스냅샷을 안정적인 JSON 문자열로 직렬화함.
 *
 * @param contract - 직렬화할 Layer 1 또는 Layer 3 계약 스냅샷
 * @returns CLI 출력 등에 즉시 사용 가능한 안정적인 JSON 문자열
 */
export function serializeAgentContractForJson(
  contract: NormalizedLayer1ContractSnapshot | NormalizedLayer3QuerySnapshot,
): string {
  return JSON.stringify(contract, null, 2);
}
