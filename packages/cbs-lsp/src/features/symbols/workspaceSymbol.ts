/**
 * CBS workspace symbol provider.
 * @file packages/cbs-lsp/src/features/workspaceSymbol.ts
 */

import type {
  CancellationToken,
  Location,
  Position,
  SymbolInformation,
  SymbolKind,
  WorkspaceSymbolParams,
} from 'vscode-languageserver/node';
import { SymbolKind as LspSymbolKind } from 'vscode-languageserver/node';

import {
  ACTIVE_FEATURE_AVAILABILITY,
  collectLocalFunctionDeclarations,
  createAgentMetadataExplanation,
  createCbsAgentProtocolMarker,
  createNormalizedRuntimeAvailabilitySnapshot,
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataExplanationContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type NormalizedRuntimeAvailabilitySnapshot,
} from '../../core';
import type { ElementRegistryFileRecord } from '../../indexer';
import type { WorkspaceDiagnosticsState } from '../../helpers/server-workspace-helper';
import { offsetToPosition } from '../../utils/position';
import { isRequestCancelled } from '../../utils/request-cancellation';

const WORKSPACE_SYMBOL_SNAPSHOT_PROVENANCE = Object.freeze(
  createAgentMetadataExplanation(
    'contextual-inference',
    'workspace-symbol:workspace-builder',
    'Workspace symbol snapshots are derived from ElementRegistry, UnifiedVariableGraph, ActivationChainService, and fragment analysis. They expose workspace-wide variables, CBS local functions, lorebook entries, and prompt sections while preserving deterministic prefix/fuzzy query ordering.',
  ),
);

const WORKSPACE_SYMBOL_SOURCE_ORDER = Object.freeze({
  variable: 0,
  localFunction: 1,
  lorebookEntry: 2,
  promptSection: 3,
} as const);

type WorkspaceSymbolSource = keyof typeof WORKSPACE_SYMBOL_SOURCE_ORDER;

interface WorkspaceSymbolCandidate {
  symbol: SymbolInformation;
  source: WorkspaceSymbolSource;
  queryRank: number;
}

export interface NormalizedWorkspaceSymbolSnapshot {
  containerName: string | null;
  name: string;
  symbolKind: string;
  uri: string;
}

export interface NormalizedWorkspaceSymbolsEnvelopeSnapshot {
  schema: string;
  schemaVersion: string;
  availability: NormalizedRuntimeAvailabilitySnapshot;
  provenance: AgentMetadataExplanationContract;
  symbols: NormalizedWorkspaceSymbolSnapshot[];
}

export interface WorkspaceSymbolProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveWorkspaceStates: () => WorkspaceDiagnosticsState[];
}

/**
 * getLocalFunctionContainerName 함수.
 * fragment-local `#func` 심볼의 container label을 stable하게 계산함.
 *
 * @param file - owning workspace file record
 * @param section - fragment section 이름
 * @param fragmentIndex - 같은 section 안에서의 fragment 순번
 * @param sectionCount - 같은 section fragment 총 개수
 * @returns workspace symbol container label
 */
function getLocalFunctionContainerName(
  file: ElementRegistryFileRecord,
  section: string,
  fragmentIndex: number,
  sectionCount: number,
): string {
  return `${file.relativePath}#${sectionCount > 1 ? `${section} [${fragmentIndex + 1}]` : section}`;
}

/**
 * getQueryRank 함수.
 * query가 심볼 이름과 prefix/fuzzy 매칭되는지 판별하고 정렬용 rank를 계산함.
 *
 * @param name - 검사할 symbol 이름
 * @param query - 사용자가 입력한 workspace symbol query
 * @returns prefix=0, fuzzy=1, 불일치=null
 */
function getQueryRank(name: string, query: string): number | null {
  if (query.length === 0) {
    return 0;
  }

  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerName.startsWith(lowerQuery)) {
    return 0;
  }

  let queryIndex = 0;
  for (let nameIndex = 0; nameIndex < lowerName.length && queryIndex < lowerQuery.length; nameIndex += 1) {
    if (lowerName[nameIndex] === lowerQuery[queryIndex]) {
      queryIndex += 1;
    }
  }

  return queryIndex === lowerQuery.length ? 1 : null;
}

/**
 * createPositionFromOffset 함수.
 * host document offset을 LSP Position으로 변환함.
 *
 * @param text - host document 원문
 * @param offset - 변환할 host offset
 * @returns host document 기준 Position
 */
function createPositionFromOffset(text: string, offset: number): Position {
  return offsetToPosition(text, Math.max(0, Math.min(offset, text.length)));
}

/**
 * createFallbackLocation 함수.
 * host range를 모를 때 사용할 zero-based fallback location을 만듦.
 *
 * @param uri - 대상 문서 URI
 * @returns line 0, character 0 기준 fallback location
 */
function createFallbackLocation(uri: string): Location {
  return {
    uri,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    },
  };
}

/**
 * createOffsetLocation 함수.
 * host document offset 구간을 LSP Location으로 변환함.
 *
 * @param file - 위치를 계산할 host document record
 * @param startOffset - 시작 host offset
 * @param endOffset - 종료 host offset
 * @returns host text를 기준으로 계산한 Location
 */
function createOffsetLocation(
  file: Pick<ElementRegistryFileRecord, 'text' | 'uri'>,
  startOffset: number,
  endOffset: number,
): Location {
  return {
    uri: file.uri,
    range: {
      start: createPositionFromOffset(file.text, startOffset),
      end: createPositionFromOffset(file.text, endOffset),
    },
  };
}

/**
 * createFileRequest 함수.
 * workspace file record를 fragment analysis 입력으로 변환함.
 *
 * @param file - 분석할 workspace file record
 * @returns fragment analysis용 synthetic request
 */
function createFileRequest(file: ElementRegistryFileRecord): FragmentAnalysisRequest {
  return {
    uri: file.uri,
    version: createSyntheticDocumentVersion(file.text),
    filePath: file.absolutePath,
    text: file.text,
  };
}

/**
 * findBestLorebookEntryOffset 함수.
 * lorebook entry 이름이 host text 어디에 가장 잘 대응하는지 보수적으로 찾음.
 *
 * @param file - lorebook host file record
 * @param entryName - activation-chain entry 이름
 * @returns host offset, 못 찾으면 null
 */
function findBestLorebookEntryOffset(file: ElementRegistryFileRecord, entryName: string): number | null {
  const directIndex = file.text.indexOf(entryName);
  if (directIndex >= 0) {
    return directIndex;
  }

  const yamlNameIndex = file.text.indexOf(`name: ${entryName}`);
  if (yamlNameIndex >= 0) {
    return yamlNameIndex + 'name: '.length;
  }

  return null;
}

/**
 * getPromptSectionSymbolKind 함수.
 * prompt section symbol의 kind를 stable하게 고정함.
 *
 * @returns prompt section용 SymbolKind
 */
function getPromptSectionSymbolKind(): SymbolKind {
  return LspSymbolKind.Module;
}

/**
 * getLorebookEntrySymbolKind 함수.
 * lorebook entry symbol의 kind를 stable하게 고정함.
 *
 * @returns lorebook entry용 SymbolKind
 */
function getLorebookEntrySymbolKind(): SymbolKind {
  return LspSymbolKind.Namespace;
}

/**
 * getLocalFunctionSymbolKind 함수.
 * CBS local function symbol의 kind를 stable하게 고정함.
 *
 * @returns local function용 SymbolKind
 */
function getLocalFunctionSymbolKind(): SymbolKind {
  return LspSymbolKind.Function;
}

/**
 * getVariableSymbolKind 함수.
 * UnifiedVariableGraph 변수 symbol의 kind를 stable하게 고정함.
 *
 * @returns variable용 SymbolKind
 */
function getVariableSymbolKind(): SymbolKind {
  return LspSymbolKind.Variable;
}

/**
 * compareNormalizedWorkspaceSymbols 함수.
 * normalized workspace symbol snapshot의 deterministic ordering을 비교함.
 *
 * @param left - 왼쪽 snapshot
 * @param right - 오른쪽 snapshot
 * @returns 정렬 비교값
 */
function compareNormalizedWorkspaceSymbols(
  left: NormalizedWorkspaceSymbolSnapshot,
  right: NormalizedWorkspaceSymbolSnapshot,
): number {
  return (
    left.name.localeCompare(right.name) ||
    (left.containerName ?? '').localeCompare(right.containerName ?? '') ||
    left.symbolKind.localeCompare(right.symbolKind) ||
    left.uri.localeCompare(right.uri)
  );
}

/**
 * normalizeWorkspaceSymbolKindForSnapshot 함수.
 * LSP numeric SymbolKind를 agent가 읽기 쉬운 stable string label로 변환함.
 *
 * @param kind - LSP SymbolKind 값
 * @returns stable string label
 */
function normalizeWorkspaceSymbolKindForSnapshot(kind: SymbolKind): string {
  switch (kind) {
    case LspSymbolKind.Variable:
      return 'variable';
    case LspSymbolKind.Function:
      return 'function';
    case LspSymbolKind.Namespace:
      return 'namespace';
    case LspSymbolKind.Module:
      return 'module';
    default:
      return `symbol-kind:${kind}`;
  }
}

/**
 * normalizeWorkspaceSymbolForSnapshot 함수.
 * SymbolInformation 한 건을 agent/golden 친화적인 stable JSON shape로 정규화함.
 *
 * @param symbol - 정규화할 workspace symbol
 * @returns deterministic field names를 가진 snapshot node
 */
export function normalizeWorkspaceSymbolForSnapshot(
  symbol: SymbolInformation,
): NormalizedWorkspaceSymbolSnapshot {
  return {
    containerName: symbol.containerName ?? null,
    name: symbol.name,
    symbolKind: normalizeWorkspaceSymbolKindForSnapshot(symbol.kind),
    uri: symbol.location.uri,
  };
}

/**
 * normalizeWorkspaceSymbolsForSnapshot 함수.
 * SymbolInformation 배열 전체를 deterministic ordering의 normalized list로 정규화함.
 *
 * @param symbols - 정규화할 workspace symbol 목록
 * @returns stable ordering을 가진 normalized list
 */
export function normalizeWorkspaceSymbolsForSnapshot(
  symbols: readonly SymbolInformation[],
): NormalizedWorkspaceSymbolSnapshot[] {
  return [...symbols].map(normalizeWorkspaceSymbolForSnapshot).sort(compareNormalizedWorkspaceSymbols);
}

/**
 * normalizeWorkspaceSymbolsEnvelopeForSnapshot 함수.
 * workspace symbol normalized list에 shared availability/provenance envelope를 붙임.
 *
 * @param symbols - 정규화할 workspace symbol 목록
 * @returns schema/version과 availability/provenance를 포함한 snapshot envelope
 */
export function normalizeWorkspaceSymbolsEnvelopeForSnapshot(
  symbols: readonly SymbolInformation[],
): NormalizedWorkspaceSymbolsEnvelopeSnapshot {
  return {
    ...createCbsAgentProtocolMarker(),
    availability: createNormalizedRuntimeAvailabilitySnapshot(),
    provenance: WORKSPACE_SYMBOL_SNAPSHOT_PROVENANCE,
    symbols: normalizeWorkspaceSymbolsForSnapshot(symbols),
  };
}

/**
 * WorkspaceSymbolProvider 클래스.
 * ElementRegistry, UnifiedVariableGraph, ActivationChainService, fragment analysis를 결합해
 * workspace-wide symbol search surface를 제공함.
 */
export class WorkspaceSymbolProvider {
  private readonly analysisService: FragmentAnalysisService;

  constructor(private readonly options: WorkspaceSymbolProviderOptions) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
  }

  /**
   * provide 함수.
   * 현재 workspace 전역 symbol을 query 기준으로 prefix/fuzzy 필터링해 반환함.
   *
   * @param params - LSP workspace symbol request params
   * @param cancellationToken - 요청 취소 여부를 확인할 토큰
   * @returns deterministic ordering이 적용된 workspace symbol 목록
   */
  provide(params: WorkspaceSymbolParams, cancellationToken?: CancellationToken): SymbolInformation[] {
    if (isRequestCancelled(cancellationToken)) {
      return [];
    }

    const states = this.options.resolveWorkspaceStates();
    if (states.length === 0) {
      return [];
    }

    const query = params.query.trim();
    const candidates: WorkspaceSymbolCandidate[] = [];

    for (const state of states) {
      if (isRequestCancelled(cancellationToken)) {
        return [];
      }

      candidates.push(...this.collectVariableSymbols(state, query));
      candidates.push(...this.collectLocalFunctionSymbols(state, query, cancellationToken));
      candidates.push(...this.collectLorebookEntrySymbols(state, query));
      candidates.push(...this.collectPromptSectionSymbols(state, query));
    }

    return this.sortCandidates(candidates).map((candidate) => candidate.symbol);
  }

  /**
   * collectVariableSymbols 함수.
   * UnifiedVariableGraph 변수 이름을 workspace symbol 후보로 수집함.
   *
   * @param state - 현재 workspace state
   * @param query - query 문자열
   * @returns variable symbol 후보 목록
   */
  private collectVariableSymbols(
    state: WorkspaceDiagnosticsState,
    query: string,
  ): WorkspaceSymbolCandidate[] {
    const candidates: WorkspaceSymbolCandidate[] = [];

    for (const variable of state.graph.getSnapshot().variables) {
      const queryRank = getQueryRank(variable.name, query);
      if (queryRank === null) {
        continue;
      }

      const firstOccurrence = variable.writers[0] ?? variable.readers[0];
      if (!firstOccurrence) {
        continue;
      }

      candidates.push({
        source: 'variable',
        queryRank,
        symbol: {
          name: variable.name,
          kind: getVariableSymbolKind(),
          location: {
            uri: firstOccurrence.uri,
            range: firstOccurrence.hostRange,
          },
          containerName: firstOccurrence.relativePath,
        },
      });
    }

    return candidates;
  }

  /**
   * collectLocalFunctionSymbols 함수.
   * CBS fragment 전체를 스캔해 `#func` 선언을 workspace symbol 후보로 수집함.
   *
   * @param state - 현재 workspace state
   * @param query - query 문자열
   * @param cancellationToken - 요청 취소 토큰
   * @returns local function symbol 후보 목록
   */
  private collectLocalFunctionSymbols(
    state: WorkspaceDiagnosticsState,
    query: string,
    cancellationToken?: CancellationToken,
  ): WorkspaceSymbolCandidate[] {
    const candidates: WorkspaceSymbolCandidate[] = [];

    for (const file of state.registry.getSnapshot().files) {
      if (!file.cbsBearingArtifact || !file.hasCbsFragments) {
        continue;
      }

      if (isRequestCancelled(cancellationToken)) {
        return [];
      }

      const request = createFileRequest(file);
      const analysis = this.analysisService.analyzeDocument(request, cancellationToken);
      if (!analysis) {
        continue;
      }

      for (const fragmentAnalysis of analysis.fragmentAnalyses) {
        const sameSectionCount =
          analysis.fragmentsBySection.get(fragmentAnalysis.fragment.section)?.length ?? 1;
        const containerName = getLocalFunctionContainerName(
          file,
          fragmentAnalysis.fragment.section,
          fragmentAnalysis.fragmentIndex,
          sameSectionCount,
        );

        for (const declaration of collectLocalFunctionDeclarations(
          fragmentAnalysis.document,
          fragmentAnalysis.fragment.content,
        )) {
          const queryRank = getQueryRank(declaration.name, query);
          if (queryRank === null) {
            continue;
          }

          const hostRange = fragmentAnalysis.mapper.toHostRange(file.text, declaration.range);
          if (!hostRange) {
            continue;
          }

          candidates.push({
            source: 'localFunction',
            queryRank,
            symbol: {
              name: declaration.name,
              kind: getLocalFunctionSymbolKind(),
              location: {
                uri: file.uri,
                range: hostRange,
              },
              containerName,
            },
          });
        }
      }
    }

    return candidates;
  }

  /**
   * collectLorebookEntrySymbols 함수.
   * activation-chain lorebook entry를 workspace symbol 후보로 수집함.
   *
   * @param state - 현재 workspace state
   * @param query - query 문자열
   * @returns lorebook entry symbol 후보 목록
   */
  private collectLorebookEntrySymbols(
    state: WorkspaceDiagnosticsState,
    query: string,
  ): WorkspaceSymbolCandidate[] {
    const candidates: WorkspaceSymbolCandidate[] = [];

    for (const entryId of state.activationChainService.getAllEntryIds()) {
      const entryQuery = state.activationChainService.queryEntry(entryId);
      if (!entryQuery) {
        continue;
      }

      const entryName = entryQuery.entry.name;
      const queryRank = getQueryRank(entryName, query);
      if (!entryName || queryRank === null) {
        continue;
      }

      const nameOffset = findBestLorebookEntryOffset(entryQuery.file, entryName);
      const location =
        nameOffset === null
          ? createFallbackLocation(entryQuery.file.uri)
          : createOffsetLocation(entryQuery.file, nameOffset, nameOffset + entryName.length);
      candidates.push({
        source: 'lorebookEntry',
        queryRank,
        symbol: {
          name: entryName,
          kind: getLorebookEntrySymbolKind(),
          location,
          containerName: entryQuery.file.relativePath,
        },
      });
    }

    return candidates;
  }

  /**
   * collectPromptSectionSymbols 함수.
   * prompt fragment section을 workspace symbol 후보로 수집함.
   *
   * @param state - 현재 workspace state
   * @param query - query 문자열
   * @returns prompt section symbol 후보 목록
   */
  private collectPromptSectionSymbols(
    state: WorkspaceDiagnosticsState,
    query: string,
  ): WorkspaceSymbolCandidate[] {
    const candidates: WorkspaceSymbolCandidate[] = [];
    const seen = new Set<string>();

    for (const element of state.registry.getSnapshot().elements) {
      if (element.analysisKind !== 'cbs-fragment' || element.artifact !== 'prompt') {
        continue;
      }

      const sectionName = element.fragment.section;
      const queryRank = getQueryRank(sectionName, query);
      if (queryRank === null) {
        continue;
      }

      const dedupeKey = `${element.uri}#${sectionName}#${element.fragment.fragmentIndex}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);

      candidates.push({
        source: 'promptSection',
        queryRank,
        symbol: {
          name: sectionName,
          kind: getPromptSectionSymbolKind(),
          location: createOffsetLocation(
            { text: state.registry.getFileByUri(element.uri)?.text ?? '', uri: element.uri },
            element.fragment.hostRange.start,
            element.fragment.hostRange.start,
          ),
          containerName: element.relativePath,
        },
      });
    }

    return candidates;
  }

  /**
   * sortCandidates 함수.
   * workspace symbol 후보를 query rank/source/kind/container/location 순으로 deterministic 정렬함.
   *
   * @param candidates - 정렬할 후보 목록
   * @returns deterministic ordering이 적용된 후보 목록
   */
  private sortCandidates(candidates: readonly WorkspaceSymbolCandidate[]): WorkspaceSymbolCandidate[] {
    return [...candidates].sort((left, right) => {
      return (
        left.queryRank - right.queryRank ||
        WORKSPACE_SYMBOL_SOURCE_ORDER[left.source] - WORKSPACE_SYMBOL_SOURCE_ORDER[right.source] ||
        left.symbol.name.localeCompare(right.symbol.name) ||
        (left.symbol.containerName ?? '').localeCompare(right.symbol.containerName ?? '') ||
        left.symbol.kind - right.symbol.kind ||
        left.symbol.location.uri.localeCompare(right.symbol.location.uri) ||
        left.symbol.location.range.start.line - right.symbol.location.range.start.line ||
        left.symbol.location.range.start.character - right.symbol.location.range.start.character ||
        left.symbol.location.range.end.line - right.symbol.location.range.end.line ||
        left.symbol.location.range.end.character - right.symbol.location.range.end.character
      );
    });
  }
}

export const WORKSPACE_SYMBOL_PROVIDER_AVAILABILITY: AgentMetadataAvailabilityContract =
  ACTIVE_FEATURE_AVAILABILITY.workspaceSymbol;
export const WORKSPACE_SYMBOL_SNAPSHOT_PROVENANCE_CONTRACT = WORKSPACE_SYMBOL_SNAPSHOT_PROVENANCE;
