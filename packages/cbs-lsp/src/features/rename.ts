import {
  type CancellationToken,
  WorkspaceEdit,
  RenameParams,
  TextDocumentPositionParams,
  Range as LSPRange,
} from 'vscode-languageserver/node';
import type { Range } from 'risu-workbench-core';

import { SymbolTable, VariableSymbol, VariableSymbolKind } from '../analyzer/symbolTable';
import {
  createAgentMetadataAvailability,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
} from '../core';
import { isRequestCancelled } from '../request-cancellation';

// Variable macros that support rename (first argument is the variable name)
const VARIABLE_MACRO_RULES = Object.freeze({
  addvar: { kind: 'chat', argumentIndex: 0 },
  getglobalvar: { kind: 'global', argumentIndex: 0 },
  gettempvar: { kind: 'temp', argumentIndex: 0 },
  getvar: { kind: 'chat', argumentIndex: 0 },
  setdefaultvar: { kind: 'chat', argumentIndex: 0 },
  setglobalvar: { kind: 'global', argumentIndex: 0 },
  settempvar: { kind: 'temp', argumentIndex: 0 },
  setvar: { kind: 'chat', argumentIndex: 0 },
  tempvar: { kind: 'temp', argumentIndex: 0 },
} as const);

const SLOT_MACRO_RULES = Object.freeze({
  slot: { kind: 'loop', argumentIndex: 0 },
} as const);

/**
 * Determines if the cursor position is on a variable reference.
 * Uses the same contract as DefinitionProvider and ReferencesProvider for consistency.
 */
function isVariablePosition(lookup: FragmentCursorLookupResult): {
  variableName: string;
  kind: VariableSymbolKind;
} | null {
  const tokenLookup = lookup.token;
  const nodeSpan = lookup.nodeSpan;
  if (!tokenLookup || !nodeSpan) {
    return null;
  }

  // Check for variable macros (getvar, setvar, etc.)
  if (
    tokenLookup.category === 'argument' &&
    nodeSpan.category === 'argument' &&
    nodeSpan.owner.type === 'MacroCall'
  ) {
    const macroName = nodeSpan.owner.name.toLowerCase();
    const rule = VARIABLE_MACRO_RULES[macroName as keyof typeof VARIABLE_MACRO_RULES];
    const variableName = tokenLookup.token.value.trim();

    if (rule && nodeSpan.argumentIndex === rule.argumentIndex && variableName.length > 0) {
      return { variableName, kind: rule.kind };
    }

    // Check for slot::name inside #each blocks
    const slotRule = SLOT_MACRO_RULES[macroName as keyof typeof SLOT_MACRO_RULES];
    if (slotRule && nodeSpan.argumentIndex === slotRule.argumentIndex && variableName.length > 0) {
      // Verify we're inside an #each block by checking the node path
      const isInsideEachBlock = lookup.nodePath.some(
        (node) => node.type === 'Block' && node.kind === 'each',
      );

      if (isInsideEachBlock) {
        return { variableName, kind: slotRule.kind };
      }
    }
  }

  // Handle edge case: when parser treats #each body as plain text,
  // the node span may show as 'node-range' with PlainText owner,
  // but the token still shows as 'argument' with the variable name.
  // In this case, check if we're inside an #each block.
  if (tokenLookup.category === 'argument') {
    const isInsideEachBlock = lookup.nodePath.some(
      (node) => node.type === 'Block' && node.kind === 'each',
    );

    if (isInsideEachBlock) {
      const variableName = tokenLookup.token.value.trim();
      if (variableName.length > 0) {
        return { variableName, kind: 'loop' };
      }
    }
  }

  return null;
}

export type RenameRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface RenameProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: RenameRequestResolver;
}

export const RENAME_PROVIDER_AVAILABILITY = createAgentMetadataAvailability(
  'local-only',
  'rename-provider:fragment-symbol-table',
  'Rename is limited to fragment-local variable and loop-alias symbols; globals, external symbols, and workspace-wide edits stay unavailable.',
);

export interface PrepareRenameResult {
  availability: AgentMetadataAvailabilityContract;
  canRename: boolean;
  range?: Range;
  symbol?: VariableSymbol;
  kind?: VariableSymbolKind;
  message?: string;
}

// Global variable macros - NOT renameable
const GLOBAL_VARIABLE_MACROS = new Set([
  'setglobalvar',
  'getglobalvar',
  'globalvar',
  'setdefaultvar',
]);

export class RenameProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: RenameRequestResolver;

  readonly availability: AgentMetadataAvailabilityContract = RENAME_PROVIDER_AVAILABILITY;

  constructor(options: RenameProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * Deferred contract compatibility method.
   * Returns null as rename is deferred to full workspace analysis.
   * This method exists only to satisfy the DEFERRED_SCOPE_CONTRACT test.
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

    return this.checkRenameEligibility(lookup);
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

    const prepareResult = this.checkRenameEligibility(lookup);
    if (!prepareResult.canRename || !prepareResult.symbol) {
      return null;
    }

    const { symbol } = prepareResult;
    const newName = params.newName;
    const mapper = lookup.fragmentAnalysis.mapper;

    // Collect all ranges to rename: definitions + references
    // All ranges must be mapped from fragment-local to host document coordinates
    const changes: Map<string, LSPRange[]> = new Map();

    // Add all definition ranges (mapped to host coordinates)
    for (const defRange of symbol.definitionRanges) {
      const hostRange = mapper.toHostRange(request.text, defRange);
      if (hostRange) {
        this.addRange(changes, params.textDocument.uri, hostRange);
      }
    }

    // Add all reference ranges (mapped to host coordinates)
    for (const refRange of symbol.references) {
      const hostRange = mapper.toHostRange(request.text, refRange);
      if (hostRange) {
        this.addRange(changes, params.textDocument.uri, hostRange);
      }
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
  private checkRenameEligibility(lookup: FragmentCursorLookupResult): PrepareRenameResult {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;

    if (!tokenLookup || !nodeSpan) {
      return { availability: this.availability, canRename: false, message: 'No symbol at cursor position' };
    }

    // Use shared isVariablePosition logic for consistency with definition/references
    const variablePosition = isVariablePosition(lookup);
    if (!variablePosition) {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Cursor is not on a variable name',
      };
    }

    const { variableName, kind } = variablePosition;

    // Reject global variables
    if (kind === 'global') {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Global variables cannot be renamed',
      };
    }

    // Get symbol from local fragment symbol table
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, kind);

    if (!symbol) {
      return {
        availability: this.availability,
        canRename: false,
        message: `Unresolved ${kind} variable: ${variableName}`,
      };
    }

    // Check if it's a global scope symbol - NOT renameable
    if (symbol.kind === 'global') {
      return {
        availability: this.availability,
        canRename: false,
        message: 'Global variables cannot be renamed',
      };
    }

    // Check if it's an external scope symbol - NOT renameable
    if (symbol.scope === 'external') {
      return {
        availability: this.availability,
        canRename: false,
        message: 'External variables cannot be renamed',
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
      range,
      symbol,
      kind,
    };
  }

  private addRange(changes: Map<string, LSPRange[]>, uri: string, range: Range): void {
    const existing = changes.get(uri);
    const lspRange = LSPRange.create(
      range.start.line,
      range.start.character,
      range.end.line,
      range.end.character,
    );

    if (existing) {
      existing.push(lspRange);
    } else {
      changes.set(uri, [lspRange]);
    }
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
