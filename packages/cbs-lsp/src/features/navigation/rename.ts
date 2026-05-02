import {
  type CancellationToken,
  WorkspaceEdit,
  RenameParams,
  TextDocumentPositionParams,
  Range as LSPRange,
} from 'vscode-languageserver/node';
import type { Range } from 'risu-workbench-core';

import { SymbolTable, VariableSymbol, VariableSymbolKind } from '../../analyzer/symbolTable';
import {
  createAgentMetadataAvailability,
  createHostFragmentKey,
  fragmentAnalysisService,
  remapFragmentLocalPatchesToHost,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
  validateHostFragmentPatchEdits,
} from '../../core';
import {
  isCrossFileVariableKind,
  mergeLocalFirstSegments,
  resolveVariablePosition,
  type LocalFirstRangeEntry,
} from '../shared';
import { isRequestCancelled } from '../../utils/request-cancellation';
import type { VariableFlowService } from '../../services';
import { positionToOffset } from '../../utils/position';

export type RenameRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export type RenameUriRequestResolver = (uri: string) => FragmentAnalysisRequest | null;

export interface RenameProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: RenameRequestResolver;
  resolveUriRequest?: RenameUriRequestResolver;
  variableFlowService?: VariableFlowService;
}

export const RENAME_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'local-first',
  'rename-provider:local-first-variable-flow',
  'Rename resolves fragment-local variable and loop-alias symbols first, appends workspace chat-variable occurrences when VariableFlowService is available, and still rejects global/external symbols.',
);

export interface PrepareRenameResult {
  availability: AgentMetadataAvailabilityContract;
  canRename: boolean;
  hostRange?: LSPRange;
  range?: Range;
  symbol?: VariableSymbol;
  kind?: VariableSymbolKind;
  variableName?: string;
  message?: string;
}

export class RenameProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: RenameRequestResolver;

  private readonly resolveUriRequest: RenameUriRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  readonly availability: AgentMetadataAvailabilityContract = RENAME_PROVIDER_AVAILABILITY;

  constructor(options: RenameProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.resolveUriRequest =
      options.resolveUriRequest ??
      ((uri) => this.resolveRequest({ textDocument: { uri }, position: { line: 0, character: 0 } }));
    this.variableFlowService = options.variableFlowService ?? null;
  }

  /**
   * Legacy compatibility helper.
   * The active server path uses prepareRename/provideRename, and this no-op stays only for old deferred-contract tests.
   */
  provide(_params: TextDocumentPositionParams, _symbolTable: SymbolTable): WorkspaceEdit | null {
    return null;
  }

  /**
   * Prepare rename - validates if the cursor position allows renaming.
   * Returns the range of the symbol that would be renamed, or null if renaming is not allowed.
   */
  prepareRename(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): PrepareRenameResult {
    if (isRequestCancelled(cancellationToken)) {
      return { availability: this.availability, canRename: false, message: 'Request cancelled' };
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return { availability: this.availability, canRename: false, message: 'Cannot resolve document' };
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Position not within CBS fragment',
      };
    }

    if (isRequestCancelled(cancellationToken)) {
      return { availability: this.availability, canRename: false, message: 'Request cancelled' };
    }

    return this.checkRenameEligibility(lookup, request, positionToOffset(request.text, params.position));
  }

  /**
   * Provide rename edits - produces a WorkspaceEdit for renaming a variable.
   * Only operates on the current fragment (single-document edit).
   */
  provideRename(params: RenameParams, cancellationToken?: CancellationToken): WorkspaceEdit | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const hostOffset = positionToOffset(request.text, params.position);
    const prepareResult = this.checkRenameEligibility(lookup, request, hostOffset);
    if (!prepareResult.canRename || !prepareResult.kind || !prepareResult.variableName) {
      return null;
    }

    const newName = params.newName;

    // Collect all ranges to rename: definitions + references
    // All ranges must be mapped from fragment-local to host document coordinates
    const localDefinitionEntries: LocalFirstRangeEntry[] = [];
    const localReferenceEntries: LocalFirstRangeEntry[] = [];

    const pushValidatedLocalEntries = (ranges: readonly Range[], target: LocalFirstRangeEntry[]): boolean => {
      const remapped = remapFragmentLocalPatchesToHost(
        request,
        lookup.fragmentAnalysis,
        ranges.map((range) => ({ range, newText: newName })),
      );
      if (!remapped.ok) {
        return false;
      }

      for (const edit of remapped.edits) {
        target.push({ uri: edit.uri, range: edit.range });
      }

      return true;
    };

    if (prepareResult.symbol) {
      const { symbol } = prepareResult;

      if (!pushValidatedLocalEntries(symbol.definitionRanges, localDefinitionEntries)) {
        return null;
      }

      if (!pushValidatedLocalEntries(symbol.references, localReferenceEntries)) {
        return null;
      }
    } else if (prepareResult.range) {
      if (!pushValidatedLocalEntries([prepareResult.range], localDefinitionEntries)) {
        return null;
      }
    }

    const workspaceEntries: LocalFirstRangeEntry[] = [];
    if (isCrossFileVariableKind(prepareResult.kind) && this.variableFlowService) {
      const workspaceQuery = this.variableFlowService.queryVariable(prepareResult.variableName);
      for (const occurrence of workspaceQuery?.occurrences ?? []) {
        workspaceEntries.push({ uri: occurrence.uri, range: occurrence.hostRange });
      }
    }

    const mergedEntries = mergeLocalFirstSegments([
      localDefinitionEntries,
      localReferenceEntries,
      workspaceEntries,
    ]);
    const directWorkspaceEntries = workspaceEntries.filter((entry) =>
      this.resolveUriRequest(entry.uri)?.filePath.endsWith('.risulua'),
    );
    const directWorkspaceKeys = new Set(
      directWorkspaceEntries.map(
        (entry) =>
          `${entry.uri}:${entry.range.start.line}:${entry.range.start.character}:${entry.range.end.line}:${entry.range.end.character}`,
      ),
    );
    const validatedEntries = mergedEntries.filter(
      (entry) =>
        !directWorkspaceKeys.has(
          `${entry.uri}:${entry.range.start.line}:${entry.range.start.character}:${entry.range.end.line}:${entry.range.end.character}`,
        ),
    );

    const validatedPatchSet = validateHostFragmentPatchEdits(
      this.analysisService,
      validatedEntries.map((entry) => ({
        uri: entry.uri,
        range: entry.range,
        newText: newName,
      })),
      {
        resolveRequestForUri: this.resolveUriRequest,
        allowedFragmentKeysByUri: new Map([
          [params.textDocument.uri, new Set([createHostFragmentKey(lookup.fragmentAnalysis)])],
        ]),
      },
    );

    if (!validatedPatchSet.ok) {
      return null;
    }

    const changes: Map<string, LSPRange[]> = new Map();
    for (const entry of [
      ...validatedPatchSet.edits,
      ...directWorkspaceEntries.map((entry) => ({ ...entry, newText: newName })),
    ]) {
      const existing = changes.get(entry.uri);
      const lspRange = LSPRange.create(
        entry.range.start.line,
        entry.range.start.character,
        entry.range.end.line,
        entry.range.end.character,
      );

      if (existing) {
        existing.push(lspRange);
      } else {
        changes.set(entry.uri, [lspRange]);
      }
    }

    if (changes.size === 0) {
      return null;
    }

    // Build WorkspaceEdit with document changes
    const documentChanges: { uri: string; edits: { range: LSPRange; newText: string }[] }[] = [];

    for (const [uri, ranges] of changes) {
      const edits = ranges.map((range) => ({
        range,
        newText: newName,
      }));
      documentChanges.push({ uri, edits });
    }

    return {
      documentChanges: documentChanges.map((change) => ({
        textDocument: { uri: change.uri, version: null },
        edits: change.edits,
      })),
    };
  }

  /**
   * Check if the cursor is on a valid renameable variable.
   * Returns the symbol and range if eligible, or an error message if not.
   */
  private checkRenameEligibility(
    lookup: FragmentCursorLookupResult,
    request: FragmentAnalysisRequest,
    hostOffset: number,
  ): PrepareRenameResult {
    if (lookup.fragmentAnalysis.recovery.hasSyntaxRecovery) {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Malformed CBS fragment cannot be patched safely',
      };
    }

    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;

    if (!tokenLookup || !nodeSpan) {
      return { availability: this.availability, canRename: false, message: 'No symbol at cursor position' };
    }

    // Use shared isVariablePosition logic for consistency with definition/references
    const variablePosition = resolveVariablePosition(lookup);
    if (!variablePosition) {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Cursor is not on a variable name',
      };
    }

    const { variableName, kind } = variablePosition;
    const hostRange = lookup.fragmentAnalysis.mapper.toHostRange(request.text, tokenLookup.localRange);

    if (!hostRange) {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Position not within CBS fragment',
      };
    }

    // Reject global variables
    if (kind === 'global') {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Global variables cannot be renamed',
        variableName,
      };
    }

    // Get symbol from local fragment symbol table
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, kind);

    if (!symbol) {
      if (isCrossFileVariableKind(kind) && this.variableFlowService) {
        const workspaceQuery = this.variableFlowService.queryAt(request.uri, hostOffset);
        if (
          workspaceQuery?.matchedOccurrence?.variableName === variableName &&
          workspaceQuery.writers.length > 0
        ) {
          return {
            availability: this.availability,
            canRename: true,
            hostRange,
            range: tokenLookup.localRange,
            kind,
            variableName,
          };
        }
      }

      return {
        availability: this.availability,
        canRename: false,
        message: `Unresolved ${kind} variable: ${variableName}`,
        variableName,
      };
    }

    // Check if it's a global scope symbol - NOT renameable
    if (symbol.kind === 'global') {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Global variables cannot be renamed',
        variableName,
      };
    }

    // Check if it's an external scope symbol - NOT renameable
    if (symbol.scope === 'external') {
      return {
        availability: this.availability,
        canRename: false,
        message: 'External variables cannot be renamed',
        variableName,
      };
    }

    // Valid renameable local variable
    const range: Range = {
      start: {
        line: tokenLookup.localRange.start.line,
        character: tokenLookup.localRange.start.character,
      },
      end: {
        line: tokenLookup.localRange.end.line,
        character: tokenLookup.localRange.end.character,
      },
    };

    return {
      availability: this.availability,
      canRename: true,
      hostRange,
      range,
      symbol,
      kind,
      variableName,
    };
  }

  /**
   * Helper to check if a document change is a TextDocumentEdit.
   * Used for type narrowing in tests.
   */
  static isTextDocumentEdit(change: unknown): change is { textDocument: { uri: string }; edits: Array<{ range: LSPRange; newText: string }> } {
    return (
      typeof change === 'object' &&
      change !== null &&
      'textDocument' in change &&
      'edits' in change
    );
  }
}
