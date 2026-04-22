/**
 * Agent-facing Layer 1/3 auxiliary contract bundles reused by CLI adapters and tests.
 * @file packages/cbs-lsp/src/auxiliary/agent-contracts.ts
 */

import { createCbsAgentProtocolMarker, type CbsAgentProtocolMarker } from '../core';
import type { ElementRegistrySnapshot, UnifiedVariableGraphSnapshot } from '../indexer';
import type { ActivationChainQueryResult, VariableFlowQueryResult } from '../services';

export interface Layer1WorkspaceSnapshotContractDescriptor {
  layer: 'layer1';
  stability: 'stable-public-read-contract';
  intendedConsumers: readonly ['agent', 'cli', 'tests'];
  trust: {
    agentsMayTrustSnapshotDirectly: true;
    stableForWorkspaceReasoning: true;
    writeCapabilitiesIncluded: false;
    authority: 'snapshotLayer1Contracts';
  };
  surfaces: {
    cli: 'report layer1';
    helper: 'snapshotLayer1Contracts';
  };
  stableFields: {
    registrySnapshot: readonly ['rootPath', 'files', 'elements', 'graphSeeds', 'summary'];
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
    fragmentElementFields: readonly ['fragment', 'fragmentIndex'];
    luaElementFields: readonly ['fragment', 'lua'];
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
    variableNode: readonly ['name', 'readers', 'writers', 'occurrenceCount', 'artifacts', 'uris'];
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
    occurrenceMetadata: readonly ['fragmentIndex', 'containingFunction', 'line'];
    runtimeDerivedFields: readonly ['graph.buildTimestamp'];
  };
  deterministicOrdering: {
    registryFiles: 'relativePath -> absolutePath';
    registryFragments: 'hostRange.start -> hostRange.end -> section -> content';
    graphVariables: 'variableName';
    graphOccurrences: 'variableName -> uri -> hostStartOffset -> hostEndOffset -> occurrenceId';
    graphIndexes: 'occurrenceId';
  };
}

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

export interface Layer3QueryEnvelopeContractDescriptor {
  layer: 'layer3';
  stability: 'stable-public-read-contract';
  intendedConsumers: readonly ['agent', 'cli', 'mcp', 'tests'];
  trust: {
    agentsMayTrustSnapshotDirectly: true;
    stableForCrossFileReasoning: true;
    writeCapabilitiesIncluded: false;
    authority: 'snapshotLayer3Queries';
  };
  surfaces: {
    cli: 'query variable|variable-at|activation-entry|activation-uri|activation-at';
    helper: 'snapshotLayer3Queries';
    services: readonly [
      'VariableFlowService.queryVariable',
      'VariableFlowService.queryAt',
      'ActivationChainService.queryEntry',
      'ActivationChainService.queryByUri',
      'ActivationChainService.queryAt',
    ];
  };
  stableFields: {
    envelope: readonly ['contract', 'activationChain', 'variableFlow'];
    variableFlow: readonly [
      'variableName',
      'node',
      'occurrences',
      'readers',
      'writers',
      'flowEntry',
      'issues',
      'defaultValue',
      'matchedOccurrence',
    ];
    variableFlowIssueMatch: readonly ['issue', 'occurrences'];
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
    activationMatch: readonly ['entry', 'edge', 'uri', 'relativePath'];
    activationCycle: readonly ['entryId', 'steps', 'hops', 'maxDepth', 'hasCycles', 'cycleCount'];
    activationCycleStep: readonly ['entryId', 'reason', 'matchedKeywords'];
  };
  nullableFields: {
    envelope: readonly ['activationChain', 'variableFlow'];
    variableFlow: readonly ['flowEntry', 'defaultValue', 'matchedOccurrence'];
    activationMatch: readonly ['uri', 'relativePath'];
  };
  alwaysPresentButMayBeEmpty: {
    variableFlowArrays: readonly ['occurrences', 'readers', 'writers', 'issues'];
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
    activationCycleSteps: readonly ['steps'];
  };
  deterministicOrdering: {
    variableOccurrences: 'occurrenceId';
    variableReadersWriters: 'uri -> hostStartOffset -> hostEndOffset -> occurrenceId';
    variableIssueOccurrences: 'occurrenceId';
    activationMatchLists: 'status(possible -> partial -> blocked) -> entry.id -> relativePath';
    activationCycleSteps: 'BFS traversal order';
  };
}

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
    variableFlowArrays: ['occurrences', 'readers', 'writers', 'issues'],
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
 * Layer 1 registry/graph public contract를 reusable JSON shape로 묶음.
 *
 * @param registry - Layer 1 ElementRegistry snapshot
 * @param graph - Layer 1 UnifiedVariableGraph snapshot
 * @returns Layer 1 public contract bundle
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
 * Layer 3 variable-flow/activation query 결과를 reusable JSON shape로 묶음.
 *
 * @param bundle - Layer 3 query payload 묶음
 * @returns Layer 3 public contract bundle
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
 * Layer 1/3 auxiliary contract를 stable JSON 문자열로 직렬화함.
 *
 * @param contract - 직렬화할 Layer 1/3 contract snapshot
 * @returns JSON CLI 출력에 바로 쓸 문자열
 */
export function serializeAgentContractForJson(
  contract: NormalizedLayer1ContractSnapshot | NormalizedLayer3QuerySnapshot,
): string {
  return JSON.stringify(contract, null, 2);
}
