import type { CbsFragment, CbsFragmentMap, DiagnosticInfo } from 'risu-workbench-core';
import type { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver';

import {
  createFragmentOffsetMapper,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  type FragmentDocumentAnalysis,
  type FragmentOffsetMapper,
  type FragmentAnalysisVersion,
} from './core';

/** Severity mapping from string to LSP DiagnosticSeverity */
const SEVERITY_MAP: Record<'error' | 'warning' | 'info' | 'hint', DiagnosticSeverity> = {
  error: 1, // DiagnosticSeverity.Error
  warning: 2, // DiagnosticSeverity.Warning
  info: 3, // DiagnosticSeverity.Information
  hint: 4, // DiagnosticSeverity.Hint
};

export interface DiagnosticDocumentContext {
  uri?: string;
  version?: FragmentAnalysisVersion;
}

/**
 * Map a document to CBS fragments using core fragment mapping.
 * Returns null for non-CBS files (toggle, variable) and unknown extensions.
 *
 * @param filePath - The document file path
 * @param content - The document content
 * @returns CbsFragmentMap with fragments and metadata, or null if not applicable
 */
export function mapDocumentToCbsFragments(
  filePath: string,
  content: string,
  context: DiagnosticDocumentContext = {},
): CbsFragmentMap | null {
  return (
    fragmentAnalysisService.analyzeDocument({
      uri: context.uri ?? filePath,
      version: context.version ?? createSyntheticDocumentVersion(content),
      filePath,
      text: content,
    })?.fragmentMap ?? null
  );
}

/**
 * Create a diagnostic for a specific range within a CBS fragment.
 * Note: This requires the original document content to compute correct positions.
 *
 * @param documentContent - The full document content (needed for correct line/char calculation)
 * @param fragment - The CBS fragment containing the range
 * @param message - The diagnostic message
 * @param severity - The severity level ('error', 'warning', 'info', 'hint')
 * @param code - The diagnostic code (e.g., 'CBS001')
 * @param startOffset - Start offset within the fragment content (0-indexed)
 * @param endOffset - End offset within the fragment content (0-indexed, exclusive)
 * @returns Diagnostic object for LSP
 */
export function createDiagnosticForFragment(
  documentContent: string,
  fragment: CbsFragment,
  message: string,
  severity: 'error' | 'warning' | 'info' | 'hint' = 'error',
  code?: string,
  startOffset: number = 0,
  endOffset: number = fragment.content.length,
): Diagnostic {
  const mapper = createFragmentOffsetMapper(fragment);
  const range =
    mapper.toHostRangeFromOffsets(documentContent, startOffset, endOffset) ??
    mapper.toHostRangeFromOffsets(documentContent, 0, 0)!;

  return {
    message,
    severity: SEVERITY_MAP[severity],
    code,
    range,
    source: 'risu-cbs',
  };
}

function createDiagnosticForFragmentRange(
  documentContent: string,
  fragment: CbsFragment,
  mapper: FragmentOffsetMapper,
  diagnostic: DiagnosticInfo,
): Diagnostic {
  const range = mapper.toHostRange(documentContent, diagnostic.range);

  if (range) {
    return {
      message: diagnostic.message,
      severity: SEVERITY_MAP[diagnostic.severity],
      code: diagnostic.code,
      range,
      source: 'risu-cbs',
    };
  }

  return createDiagnosticForFragment(
    documentContent,
    fragment,
    diagnostic.message,
    diagnostic.severity,
    diagnostic.code,
  );
}

function mapFragmentDiagnosticsToHost(
  documentContent: string,
  fragmentAnalysis: FragmentDocumentAnalysis,
): Diagnostic[] {
  return fragmentAnalysis.diagnostics.map((diagnostic) =>
    createDiagnosticForFragmentRange(
      documentContent,
      fragmentAnalysis.fragment,
      fragmentAnalysis.mapper,
      diagnostic,
    ),
  );
}

/**
 * Route diagnostics for a document.
 * Maps the document to CBS fragments and returns diagnostics array.
 * Returns empty array for non-CBS files.
 *
 * @param filePath - The document file path
 * @param content - The document content
 * @param options - Diagnostic options (e.g., checkUnknownFunctions)
 * @returns Array of diagnostics for the document
 */
export function routeDiagnosticsForDocument(
  filePath: string,
  content: string,
  _options: Record<string, boolean> = {},
  context: DiagnosticDocumentContext = {},
): Diagnostic[] {
  const analysis = fragmentAnalysisService.analyzeDocument({
    uri: context.uri ?? filePath,
    version: context.version ?? createSyntheticDocumentVersion(content),
    filePath,
    text: content,
  });

  // Return empty array for non-CBS files or empty fragments
  if (!analysis || analysis.fragmentAnalyses.length === 0) {
    return [];
  }

  return analysis.fragmentAnalyses.flatMap((fragmentAnalysis) =>
    mapFragmentDiagnosticsToHost(content, fragmentAnalysis),
  );
}
