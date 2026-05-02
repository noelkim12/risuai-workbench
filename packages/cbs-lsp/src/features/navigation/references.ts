import { type CancellationToken, Location, ReferenceParams } from 'vscode-languageserver/node';
import type { Range } from 'risu-workbench-core';

import {
  createAgentMetadataAvailability,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../../core';
import type { VariableSymbol } from '../../analyzer/symbolTable';
import {
  isCrossFileVariableKind,
  resolveVariablePosition,
  type LocalFirstRangeEntry,
} from '../shared';
import {
  collectProviderWorkspaceVariableSegments,
  mergeProviderVariableSegments,
  shouldAllowDefaultDefinitionForProvider,
  type ProviderVariableRangeEntry,
} from '../shared';
import { isRequestCancelled } from '../../utils/request-cancellation';
import type { VariableFlowService } from '../../services';

export type ReferencesRequestResolver = (
  params: ReferenceParams,
) => FragmentAnalysisRequest | null;

export interface ReferencesProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: ReferencesRequestResolver;
  variableFlowService?: VariableFlowService;
}

export const REFERENCES_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'local-first',
  'references-provider:local-first-resolution',
  'References resolve fragment-local variable and loop-alias symbols first, then append workspace chat-variable readers/writers when VariableFlowService is available. Global and external symbols stay unavailable.',
);

export class ReferencesProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: ReferencesRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  readonly availability: AgentMetadataAvailabilityContract = REFERENCES_PROVIDER_AVAILABILITY;

  constructor(options: ReferencesProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
  }

  provide(params: ReferenceParams, cancellationToken?: CancellationToken): Location[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return [];
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return [];
    }

    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const variablePosition = resolveVariablePosition(lookup);
    if (!variablePosition) {
      return [];
    }

    const { variableName, kind } = variablePosition;

    // Get symbol from local fragment symbol table
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, kind);
    const includeDeclaration = params.context?.includeDeclaration ?? false;
    const localSegments: ProviderVariableRangeEntry[][] = [];

    if (symbol && symbol.kind !== 'global' && symbol.scope !== 'external') {
      const localLocations = this.buildLocations(symbol, lookup, request, includeDeclaration);
      if (includeDeclaration) {
        localSegments.push(
          localLocations.definitions.map((entry) => ({ ...entry, source: 'local-definition' })),
        );
      }
      localSegments.push(
        localLocations.references.map((entry) => ({ ...entry, source: 'local-reference' })),
      );
    }

    const workspaceSegments: ProviderVariableRangeEntry[][] = [];
    if (isCrossFileVariableKind(kind) && this.variableFlowService) {
      const workspaceLocations = collectProviderWorkspaceVariableSegments({
        variableFlowService: this.variableFlowService,
        variableName,
        includeWriters: includeDeclaration,
        includeReaders: true,
        includeDefaultDefinitions: shouldAllowDefaultDefinitionForProvider('references', includeDeclaration),
      });

      if (includeDeclaration) {
        workspaceSegments.push(workspaceLocations.writers, workspaceLocations.defaultDefinitions);
      }

      workspaceSegments.push(workspaceLocations.readers);
    }

    return mergeProviderVariableSegments([...localSegments, ...workspaceSegments]).map((entry) => ({
      uri: entry.uri,
      range: entry.range,
    }));
  }

  private buildLocations(
    symbol: VariableSymbol,
    lookup: FragmentCursorLookupResult,
    request: FragmentAnalysisRequest,
    includeDeclaration: boolean,
  ): { definitions: LocalFirstRangeEntry[]; references: LocalFirstRangeEntry[] } {
    const mapper = lookup.fragmentAnalysis.mapper;
    const definitions: LocalFirstRangeEntry[] = [];
    const references: LocalFirstRangeEntry[] = [];

    if (includeDeclaration) {
      for (const defRange of symbol.definitionRanges) {
        const hostRange = this.toHostRange(mapper, request.text, defRange);
        if (hostRange) {
          definitions.push({
            uri: request.uri,
            range: hostRange,
          });
        }
      }
    }

    for (const refRange of symbol.references) {
      const hostRange = this.toHostRange(mapper, request.text, refRange);
      if (hostRange) {
        references.push({
          uri: request.uri,
          range: hostRange,
        });
      }
    }

    return { definitions, references };
  }

  private toHostRange(
    mapper: FragmentCursorLookupResult['fragmentAnalysis']['mapper'],
    documentContent: string,
    localRange: Range,
  ): Range | null {
    return mapper.toHostRange(documentContent, localRange);
  }
}
