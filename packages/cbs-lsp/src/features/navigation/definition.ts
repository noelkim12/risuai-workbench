import {
  type CancellationToken,
  Definition,
  LocationLink,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import type { CBSBuiltinRegistry, Position, Range } from 'risu-workbench-core';

import {
  createAgentMetadataAvailability,
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../../core';
import type { VariableSymbolKind } from '../../analyzer/symbolTable';
import {
  isCrossFileVariableKind,
  resolveVariablePosition,
} from '../shared';
import {
  collectProviderWorkspaceVariableSegments,
  mergeProviderVariableSegments,
  shouldAllowDefaultDefinitionForProvider,
  type ProviderVariableRangeEntry,
} from '../shared';
import { isRequestCancelled } from '../../utils/request-cancellation';
import type { VariableFlowService } from '../../services';
import { shouldSkipOversizedLuaText } from '../../utils/oversized-lua';
import { positionToOffset } from '../../utils/position';
import { getVariableMacroArgumentKind } from '../../analyzer/scope/scope-macro-rules';

const MAX_OVERSIZED_DEFINITION_LINE_SCAN_LENGTH = 1024 * 1024;

interface OversizedDefinitionResult {
  definition: Definition | null;
  handled: boolean;
}

export type DefinitionRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface DefinitionProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: DefinitionRequestResolver;
  variableFlowService?: VariableFlowService;
}

export const DEFINITION_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'local-first',
  'definition-provider:local-first-resolution',
  'Definition resolves fragment-local variables, loop aliases, and local #func declarations first, then appends workspace chat-variable writers/readers when VariableFlowService is available. Global and external symbols stay unavailable.',
);

function isFunctionPosition(lookup: FragmentCursorLookupResult): { functionName: string } | null {
  const tokenLookup = lookup.token;
  const nodeSpan = lookup.nodeSpan;
  if (!tokenLookup || !nodeSpan) {
    return null;
  }

  if (
    tokenLookup.category === 'argument' &&
    (nodeSpan.category === 'argument' || nodeSpan.category === 'local-function-reference') &&
    nodeSpan.owner.type === 'MacroCall' &&
    nodeSpan.owner.name.toLowerCase() === 'call' &&
    nodeSpan.argumentIndex === 0
  ) {
    const functionName = tokenLookup.token.value.trim();
    if (functionName.length > 0) {
      return { functionName };
    }
  }

  return null;
}

function findFirstDefinitionRange(definitionRanges: readonly Range[]): Range | null {
  if (definitionRanges.length === 0) {
    return null;
  }

  // Sort by position and return the first one (earliest in document order)
  const sorted = [...definitionRanges].sort((a, b) => {
    if (a.start.line !== b.start.line) {
      return a.start.line - b.start.line;
    }
    return a.start.character - b.start.character;
  });

  return sorted[0] ?? null;
}

function buildDefinitionLocationLink(
  targetUri: string,
  targetRange: Range,
  originSelectionRange?: Range | null,
): LocationLink {
  return {
    targetUri,
    targetRange,
    targetSelectionRange: targetRange,
    originSelectionRange: originSelectionRange ?? undefined,
  };
}

export class DefinitionProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: DefinitionRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  readonly availability: AgentMetadataAvailabilityContract = DEFINITION_PROVIDER_AVAILABILITY;

  constructor(
    private readonly _registry: CBSBuiltinRegistry,
    options: DefinitionProviderOptions = {},
  ) {
    // Registry stored for API consistency with other providers
    void this._registry;
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
  }

  provide(params: TextDocumentPositionParams, cancellationToken?: CancellationToken): Definition | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const oversizedDefinition = this.provideOversizedLuaVariableDefinition(
      request,
      params.position,
    );
    if (oversizedDefinition.handled) {
      return oversizedDefinition.definition;
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const variablePosition = resolveVariablePosition(lookup);
    const functionPosition = variablePosition ? null : isFunctionPosition(lookup);
    let targetRange: Range | null = null;
    let variableName: string | null = null;
    let variableKind: VariableSymbolKind | null = null;

    if (variablePosition) {
      const { variableName: resolvedVariableName, kind, targetDefinitionRange } = variablePosition;
      variableName = resolvedVariableName;
      variableKind = kind;

      if (kind === 'global') {
        return null;
      }

      const symbol = symbolTable.getVariable(resolvedVariableName, kind);
      if (symbol && symbol.scope !== 'external') {
        targetRange = targetDefinitionRange ?? findFirstDefinitionRange(symbol.definitionRanges);
      }
    } else if (functionPosition) {
      const symbol = symbolTable.getFunction(functionPosition.functionName);
      const fallbackDeclaration = collectLocalFunctionDeclarations(
        lookup.fragmentAnalysis.document,
        lookup.fragment.content,
      ).find((candidate) => candidate.name === functionPosition.functionName);
      if (!symbol && !fallbackDeclaration) {
        return null;
      }

      targetRange = symbol
        ? findFirstDefinitionRange(symbol.definitionRanges)
        : fallbackDeclaration?.range ?? null;
    } else {
      return null;
    }

    if (!targetRange) {
      if (!variableName || !variableKind || !isCrossFileVariableKind(variableKind)) {
        return null;
      }
    }

    // Build the origin selection range (the variable name at cursor position)
    const tokenLookup = lookup.token;
    let originRange: Range | null = null;
    if (tokenLookup) {
      originRange = lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets(
        request.text,
        tokenLookup.localStartOffset,
        tokenLookup.localEndOffset,
      );
    }

    const localEntries: ProviderVariableRangeEntry[] = [];

    if (targetRange) {
      const hostRange = lookup.fragmentAnalysis.mapper.toHostRange(request.text, targetRange);
      if (hostRange) {
        localEntries.push({ uri: params.textDocument.uri, range: hostRange, source: 'local-definition' });
      }
    }

    const workspaceSegments: ProviderVariableRangeEntry[][] = [];
    if (variableName && variableKind && isCrossFileVariableKind(variableKind) && this.variableFlowService) {
      const workspaceLocations = collectProviderWorkspaceVariableSegments({
        variableFlowService: this.variableFlowService,
        variableName,
        includeWriters: true,
        includeReaders: true,
        includeDefaultDefinitions: shouldAllowDefaultDefinitionForProvider('definition', true),
      });
      workspaceSegments.push([
        ...workspaceLocations.writers,
        ...workspaceLocations.readers,
        ...workspaceLocations.defaultDefinitions,
      ]);
    }

    const links = mergeProviderVariableSegments([localEntries, ...workspaceSegments]).map((entry) =>
      buildDefinitionLocationLink(entry.uri, entry.range, originRange),
    );

    if (links.length === 0) {
      return null;
    }

    return links as unknown as Definition;
  }

  private provideOversizedLuaVariableDefinition(
    request: FragmentAnalysisRequest,
    position: Position,
  ): OversizedDefinitionResult {
    if (!this.variableFlowService || !shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
      return { definition: null, handled: false };
    }

    const target = this.detectCurrentLineVariableArgumentTarget(request.text, position);
    if (!target) {
      return { definition: null, handled: false };
    }

    const originRange: Range = {
      start: { line: position.line, character: target.startCharacter },
      end: { line: position.line, character: target.endCharacter },
    };
    const workspaceLocations = collectProviderWorkspaceVariableSegments({
      variableFlowService: this.variableFlowService,
      variableName: target.name,
      includeWriters: true,
      includeReaders: true,
      includeDefaultDefinitions: shouldAllowDefaultDefinitionForProvider('definition', true),
    });

    const links = mergeProviderVariableSegments([
      [
        ...workspaceLocations.writers,
        ...workspaceLocations.readers,
        ...workspaceLocations.defaultDefinitions,
      ],
    ]).map((entry) =>
      buildDefinitionLocationLink(entry.uri, entry.range, originRange),
    );

    return {
      definition: links.length > 0 ? (links as unknown as Definition) : null,
      handled: true,
    };
  }

  private detectCurrentLineVariableArgumentTarget(
    text: string,
    position: Position,
  ): { name: string; startCharacter: number; endCharacter: number } | null {
    const line = this.getLineTextAtPosition(
      text,
      position,
      MAX_OVERSIZED_DEFINITION_LINE_SCAN_LENGTH,
    );
    if (line === null || position.character > line.length) {
      return null;
    }

    const prefixText = line.slice(0, position.character);
    const macroStartCharacter = prefixText.lastIndexOf('{{');
    if (macroStartCharacter === -1) {
      return null;
    }

    const closeBeforeMacro = prefixText.lastIndexOf('}}');
    if (closeBeforeMacro > macroStartCharacter) {
      return null;
    }

    const closeCharacter = line.indexOf('}}', macroStartCharacter + 2);
    if (closeCharacter !== -1 && position.character > closeCharacter + 2) {
      return null;
    }

    const macroBodyEndCharacter = closeCharacter === -1 ? line.length : closeCharacter;
    const macroBody = line.slice(macroStartCharacter + 2, macroBodyEndCharacter);
    const macroPrefix = line.slice(macroStartCharacter + 2, position.character);
    if (macroPrefix.includes('{{') || macroPrefix.startsWith('/')) {
      return null;
    }

    const lastArgumentSeparatorIndex = macroPrefix.lastIndexOf('::');
    if (lastArgumentSeparatorIndex === -1) {
      return null;
    }

    const macroName = macroPrefix.slice(0, macroPrefix.indexOf('::')).trim().toLowerCase();

    let argumentIndex = 0;
    for (let index = 0; index < lastArgumentSeparatorIndex; index += 1) {
      if (macroPrefix.slice(index, index + 2) !== '::') {
        continue;
      }

      argumentIndex += 1;
      index += 1;
    }

    if (argumentIndex !== 0) {
      return null;
    }

    const variableKind = getVariableMacroArgumentKind(macroName, argumentIndex);
    if (variableKind !== 'chat') {
      return null;
    }

    const segmentStartCharacter = macroStartCharacter + 2 + lastArgumentSeparatorIndex + 2;
    const nextArgumentSeparatorIndex = macroBody.indexOf('::', lastArgumentSeparatorIndex + 2);
    const segmentEndCharacter =
      nextArgumentSeparatorIndex === -1
        ? macroBodyEndCharacter
        : macroStartCharacter + 2 + nextArgumentSeparatorIndex;
    const rawSegment = line.slice(segmentStartCharacter, segmentEndCharacter);
    const leadingWhitespaceLength = rawSegment.length - rawSegment.trimStart().length;
    const trailingWhitespaceLength = rawSegment.length - rawSegment.trimEnd().length;
    const startCharacter = segmentStartCharacter + leadingWhitespaceLength;
    const endCharacter = segmentEndCharacter - trailingWhitespaceLength;

    if (position.character < startCharacter || position.character > endCharacter) {
      return null;
    }

    const name = line.slice(startCharacter, endCharacter);
    return name.length > 0 ? { name, startCharacter, endCharacter } : null;
  }

  private getLineTextAtPosition(
    text: string,
    position: Position,
    maxScannedCharacters: number,
  ): string | null {
    const offset = positionToOffset(text, position);
    if (offset < 0 || offset > text.length) {
      return null;
    }

    const lineStartOffset = Math.max(text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1, 0);
    const rawLineEndOffset = text.indexOf('\n', offset);
    const lineEndOffset = rawLineEndOffset === -1 ? text.length : rawLineEndOffset;
    if (lineEndOffset - lineStartOffset > maxScannedCharacters) {
      return null;
    }

    const line = text.slice(lineStartOffset, lineEndOffset).replace(/\r$/u, '');
    return position.character <= line.length ? line : null;
  }
}
