import type { CbsFragment, CbsFragmentMap, DiagnosticInfo } from 'risu-workbench-core';
import type { Diagnostic, DiagnosticRelatedInformation, DiagnosticSeverity } from 'vscode-languageserver';

import {
  createNormalizedRuntimeAvailabilitySnapshot,
  createFragmentOffsetMapper,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  type NormalizedRuntimeAvailabilitySnapshot,
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

export interface NormalizedHostDiagnosticRelatedInformationSnapshot {
  message: string;
  range: DiagnosticRelatedInformation['location']['range'];
  uri: string;
}

export interface NormalizedHostDiagnosticSnapshot {
  code: string | null;
  data: Diagnostic['data'] | null;
  message: string;
  range: Diagnostic['range'];
  relatedInformation: NormalizedHostDiagnosticRelatedInformationSnapshot[];
  severity: DiagnosticSeverity | null;
  source: string | null;
}

export interface NormalizedHostDiagnosticsEnvelopeSnapshot {
  availability: NormalizedRuntimeAvailabilitySnapshot;
  diagnostics: NormalizedHostDiagnosticSnapshot[];
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
  documentUri: string,
  fragment: CbsFragment,
  mapper: FragmentOffsetMapper,
  diagnostic: DiagnosticInfo,
): Diagnostic {
  const range = mapper.toHostRange(documentContent, diagnostic.range);
  const relatedInformation = mapRelatedInformation(
    documentContent,
    documentUri,
    mapper,
    diagnostic.relatedInformation,
  );

  if (range) {
    return {
      data: diagnostic.data,
      message: diagnostic.message,
      severity: SEVERITY_MAP[diagnostic.severity],
      code: diagnostic.code,
      relatedInformation,
      range,
      source: 'risu-cbs',
    };
  }

  return {
    ...createDiagnosticForFragment(
    documentContent,
    fragment,
    diagnostic.message,
    diagnostic.severity,
    diagnostic.code,
    ),
    data: diagnostic.data,
    relatedInformation,
  };
}

function mapFragmentDiagnosticsToHost(
  documentContent: string,
  documentUri: string,
  fragmentAnalysis: FragmentDocumentAnalysis,
): Diagnostic[] {
  return fragmentAnalysis.diagnostics.map((diagnostic) =>
    createDiagnosticForFragmentRange(
      documentContent,
      documentUri,
      fragmentAnalysis.fragment,
      fragmentAnalysis.mapper,
      diagnostic,
    ),
  );
}

function mapRelatedInformation(
  documentContent: string,
  documentUri: string,
  mapper: FragmentOffsetMapper,
  relatedInformation: DiagnosticInfo['relatedInformation'],
): DiagnosticRelatedInformation[] | undefined {
  if (!relatedInformation || relatedInformation.length === 0) {
    return undefined;
  }

  const mapped = relatedInformation
    .map((entry) => {
      const range = mapper.toHostRange(documentContent, entry.range);
      if (!range) {
        return null;
      }

      return {
        message: entry.message,
        location: {
          uri: documentUri,
          range,
        },
      } satisfies DiagnosticRelatedInformation;
    })
    .filter((entry): entry is DiagnosticRelatedInformation => entry !== null)
    .sort(compareRelatedInformationForHost);

  return mapped.length > 0 ? mapped : undefined;
}

function compareRelatedInformationForHost(
  left: DiagnosticRelatedInformation,
  right: DiagnosticRelatedInformation,
): number {
  return (
    comparePositions(left.location.range.start, right.location.range.start) ||
    comparePositions(left.location.range.end, right.location.range.end) ||
    left.message.localeCompare(right.message)
  );
}

function compareDiagnosticsForHost(left: Diagnostic, right: Diagnostic): number {
  const leftCode = typeof left.code === 'string' ? left.code : String(left.code ?? '');
  const rightCode = typeof right.code === 'string' ? right.code : String(right.code ?? '');

  return (
    compareNumbers(left.range.start.line, right.range.start.line) ||
    compareNumbers(left.range.start.character, right.range.start.character) ||
    compareNumbers(left.range.end.line, right.range.end.line) ||
    compareNumbers(left.range.end.character, right.range.end.character) ||
    compareNumbers(left.severity ?? 0, right.severity ?? 0) ||
    leftCode.localeCompare(rightCode) ||
    left.message.localeCompare(right.message)
  );
}

function comparePositions(
  left: Diagnostic['range']['start'],
  right: Diagnostic['range']['start'],
): number {
  return compareNumbers(left.line, right.line) || compareNumbers(left.character, right.character);
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

export function normalizeHostDiagnosticForSnapshot(
  diagnostic: Diagnostic,
): NormalizedHostDiagnosticSnapshot {
  return {
    code: diagnostic.code === undefined ? null : String(diagnostic.code),
    data: diagnostic.data ?? null,
    message: diagnostic.message,
    range: diagnostic.range,
    relatedInformation: [...(diagnostic.relatedInformation ?? [])]
      .sort(compareRelatedInformationForHost)
      .map((entry) => ({
        message: entry.message,
        range: entry.location.range,
        uri: entry.location.uri,
      })),
    severity: diagnostic.severity ?? null,
    source: diagnostic.source ?? null,
  };
}

export function normalizeHostDiagnosticsForSnapshot(
  diagnostics: readonly Diagnostic[],
): NormalizedHostDiagnosticSnapshot[] {
  return [...diagnostics].sort(compareDiagnosticsForHost).map(normalizeHostDiagnosticForSnapshot);
}

/**
 * normalizeHostDiagnosticsEnvelopeForSnapshot 함수.
 * host diagnostics normalized view에 공통 runtime availability contract를 함께 붙임.
 *
 * @param diagnostics - 정규화할 host diagnostics 배열
 * @returns diagnostics와 availability snapshot을 함께 담은 deterministic JSON view
 */
export function normalizeHostDiagnosticsEnvelopeForSnapshot(
  diagnostics: readonly Diagnostic[],
): NormalizedHostDiagnosticsEnvelopeSnapshot {
  return {
    availability: createNormalizedRuntimeAvailabilitySnapshot(),
    diagnostics: normalizeHostDiagnosticsForSnapshot(diagnostics),
  };
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

  const documentUri = context.uri ?? filePath;
  return analysis.fragmentAnalyses
    .flatMap((fragmentAnalysis) => mapFragmentDiagnosticsToHost(content, documentUri, fragmentAnalysis))
    .sort(compareDiagnosticsForHost);
}
