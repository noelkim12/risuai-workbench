import * as core from 'risu-workbench-core';
import type { CancellationToken } from 'vscode-languageserver/node';
import type {
  CbsBearingArtifact,
  CbsFragment,
  CbsFragmentMap,
  CBSDocument,
  DiagnosticInfo,
  Position,
  Token,
  TokenizerDiagnostic,
} from 'risu-workbench-core';

import { DiagnosticsEngine } from '../analyzer/diagnostics';
import { ScopeAnalyzer } from '../analyzer/scopeAnalyzer';
import { SymbolTable } from '../analyzer/symbolTable';
import { locateFragmentAtHostPosition, type FragmentCursorLookupResult } from './fragment-locator';
import { createFragmentOffsetMapper, type FragmentOffsetMapper } from './fragment-position';
import { isRequestCancelled } from '../utils/request-cancellation';
import {
  createDocumentRecoveryState,
  createFragmentRecoveryState,
  type DocumentRecoveryState,
  type FragmentRecoveryState,
} from './recovery-contract';

export type FragmentAnalysisVersion = number | string;

export interface FragmentAnalysisRequest {
  uri: string;
  version: FragmentAnalysisVersion;
  filePath: string;
  text: string;
}

export interface FragmentAnalysisCacheMetadata {
  key: string;
  uri: string;
  version: FragmentAnalysisVersion;
  filePath: string;
  textSignature: string;
}

export interface FragmentProviderLookupHooks {
  getTokens(): readonly Token[];
  getDocument(): CBSDocument;
  getSymbolTable(): SymbolTable;
  getDiagnostics(): readonly DiagnosticInfo[];
  getRecovery(): FragmentRecoveryState;
}

export interface FragmentDocumentAnalysis {
  fragment: CbsFragment;
  fragmentIndex: number;
  tokens: readonly Token[];
  tokenizerDiagnostics: readonly TokenizerDiagnostic[];
  document: CBSDocument;
  diagnostics: readonly DiagnosticInfo[];
  symbolTable: SymbolTable;
  recovery: FragmentRecoveryState;
  mapper: FragmentOffsetMapper;
  providerLookup: FragmentProviderLookupHooks;
}

export interface DocumentFragmentAnalysis {
  artifact: CbsBearingArtifact;
  fragmentMap: CbsFragmentMap;
  fragments: readonly CbsFragment[];
  fragmentAnalyses: readonly FragmentDocumentAnalysis[];
  fragmentsBySection: ReadonlyMap<string, readonly FragmentDocumentAnalysis[]>;
  documents: readonly CBSDocument[];
  diagnostics: readonly DiagnosticInfo[];
  recovery: DocumentRecoveryState;
  cache: FragmentAnalysisCacheMetadata;
}

interface FragmentReuseCandidate {
  section: string;
  contentSignature: string;
  analysis: FragmentDocumentAnalysis;
}

export function createSyntheticDocumentVersion(text: string): string {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `text:${text.length}:${(hash >>> 0).toString(16)}`;
}

/**
 * compareFragmentsForStableOrder 함수.
 * fragment 분석 순서를 host 문서 기준으로 안정 고정함.
 *
 * @param left - 비교할 왼쪽 fragment
 * @param right - 비교할 오른쪽 fragment
 * @returns 정렬 우선순위 차이값
 */
function compareFragmentsForStableOrder(left: CbsFragment, right: CbsFragment): number {
  return (
    left.start - right.start ||
    left.end - right.end ||
    left.section.localeCompare(right.section) ||
    left.content.localeCompare(right.content)
  );
}

export class FragmentAnalysisService {
  private readonly cache = new Map<string, DocumentFragmentAnalysis>();
  private readonly diagnosticsEngine = new DiagnosticsEngine(new core.CBSBuiltinRegistry());
  private readonly scopeAnalyzer = new ScopeAnalyzer();

  analyzeDocument(
    request: FragmentAnalysisRequest,
    cancellationToken?: CancellationToken,
  ): DocumentFragmentAnalysis | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const cacheKey = this.createCacheKey(request.uri, request.version);
    const textSignature = createSyntheticDocumentVersion(request.text);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.cache.textSignature === textSignature) {
      return cached;
    }

    const artifact = this.resolveArtifact(request.filePath);
    if (!artifact) {
      this.clearUri(request.uri);
      return null;
    }

    const fragmentMap = core.mapToCbsFragments(artifact, request.text);
    const fragments = [...fragmentMap.fragments].sort(compareFragmentsForStableOrder);
    const previousAnalysis = this.getLatestCachedAnalysisForUri(request.uri, cacheKey);
    const reuseCandidates = this.createFragmentReusePool(previousAnalysis, artifact);
    const fragmentAnalyses: FragmentDocumentAnalysis[] = [];

    for (const [fragmentIndex, fragment] of fragments.entries()) {
      if (isRequestCancelled(cancellationToken)) {
        return null;
      }

      const reusedAnalysis = this.tryReuseFragmentAnalysis(reuseCandidates, fragment, fragmentIndex);
      if (reusedAnalysis) {
        fragmentAnalyses.push(reusedAnalysis);
        continue;
      }

      fragmentAnalyses.push(this.analyzeFragment(fragment, fragmentIndex));
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const sections = new Map<string, FragmentDocumentAnalysis[]>();

    for (const fragmentAnalysis of fragmentAnalyses) {
      const existing = sections.get(fragmentAnalysis.fragment.section);
      if (existing) {
        existing.push(fragmentAnalysis);
        continue;
      }

      sections.set(fragmentAnalysis.fragment.section, [fragmentAnalysis]);
    }

    const analysis: DocumentFragmentAnalysis = {
      artifact,
      fragmentMap,
      fragments,
      fragmentAnalyses,
      fragmentsBySection: sections,
      documents: fragmentAnalyses.map((fragmentAnalysis) => fragmentAnalysis.document),
      diagnostics: fragmentAnalyses.flatMap((fragmentAnalysis) => fragmentAnalysis.diagnostics),
      recovery: createDocumentRecoveryState(
        fragmentAnalyses.map((fragmentAnalysis) => fragmentAnalysis.recovery),
      ),
      cache: {
        key: cacheKey,
        uri: request.uri,
        version: request.version,
        filePath: request.filePath,
        textSignature,
      },
    };

    this.clearUri(request.uri, cacheKey);
    this.cache.set(cacheKey, analysis);
    return analysis;
  }

  getCachedAnalysis(
    uri: string,
    version: FragmentAnalysisVersion,
  ): DocumentFragmentAnalysis | null {
    return this.cache.get(this.createCacheKey(uri, version)) ?? null;
  }

  locatePosition(
    request: FragmentAnalysisRequest,
    hostPosition: Position,
    cancellationToken?: CancellationToken,
  ): FragmentCursorLookupResult | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const analysis = this.analyzeDocument(request, cancellationToken);
    if (!analysis) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    return locateFragmentAtHostPosition(analysis, request.text, hostPosition);
  }

  clearUri(uri: string, keepKey?: string): void {
    for (const key of this.cache.keys()) {
      if (!key.startsWith(`${uri}::`) || key === keepKey) {
        continue;
      }

      this.cache.delete(key);
    }
  }

  clearAll(): void {
    this.cache.clear();
  }

  private getLatestCachedAnalysisForUri(
    uri: string,
    preferredKey?: string,
  ): DocumentFragmentAnalysis | null {
    const preferred = preferredKey ? this.cache.get(preferredKey) ?? null : null;
    if (preferred) {
      return preferred;
    }

    let latest: DocumentFragmentAnalysis | null = null;

    for (const analysis of this.cache.values()) {
      if (analysis.cache.uri !== uri) {
        continue;
      }

      latest = analysis;
    }

    return latest;
  }

  private createFragmentReusePool(
    previousAnalysis: DocumentFragmentAnalysis | null,
    artifact: CbsBearingArtifact,
  ): Map<string, FragmentReuseCandidate[]> {
    const pool = new Map<string, FragmentReuseCandidate[]>();
    if (!previousAnalysis || previousAnalysis.artifact !== artifact) {
      return pool;
    }

    for (const fragmentAnalysis of previousAnalysis.fragmentAnalyses) {
      const contentSignature = createSyntheticDocumentVersion(fragmentAnalysis.fragment.content);
      const key = this.createFragmentReuseKey(fragmentAnalysis.fragment.section, contentSignature);
      const bucket = pool.get(key);
      const candidate: FragmentReuseCandidate = {
        section: fragmentAnalysis.fragment.section,
        contentSignature,
        analysis: fragmentAnalysis,
      };

      if (bucket) {
        bucket.push(candidate);
        continue;
      }

      pool.set(key, [candidate]);
    }

    return pool;
  }

  private tryReuseFragmentAnalysis(
    reusePool: Map<string, FragmentReuseCandidate[]>,
    fragment: CbsFragment,
    fragmentIndex: number,
  ): FragmentDocumentAnalysis | null {
    const contentSignature = createSyntheticDocumentVersion(fragment.content);
    const key = this.createFragmentReuseKey(fragment.section, contentSignature);
    const bucket = reusePool.get(key);
    const candidate = bucket?.shift();

    if (!candidate) {
      return null;
    }

    if (bucket && bucket.length === 0) {
      reusePool.delete(key);
    }

    return this.cloneFragmentAnalysis(candidate.analysis, fragment, fragmentIndex);
  }

  private cloneFragmentAnalysis(
    source: FragmentDocumentAnalysis,
    fragment: CbsFragment,
    fragmentIndex: number,
  ): FragmentDocumentAnalysis {
    const mapper = createFragmentOffsetMapper(fragment);

    return {
      fragment,
      fragmentIndex,
      tokens: source.tokens,
      tokenizerDiagnostics: source.tokenizerDiagnostics,
      document: source.document,
      diagnostics: source.diagnostics,
      symbolTable: source.symbolTable,
      recovery: source.recovery,
      mapper,
      providerLookup: {
        getTokens: () => source.tokens,
        getDocument: () => source.document,
        getSymbolTable: () => source.symbolTable,
        getDiagnostics: () => source.diagnostics,
        getRecovery: () => source.recovery,
      },
    };
  }

  private analyzeFragment(fragment: CbsFragment, fragmentIndex: number): FragmentDocumentAnalysis {
    const tokenizer = new core.CBSTokenizer();
    const tokens = tokenizer.tokenize(fragment.content);
    const tokenizerDiagnostics = tokenizer.getDiagnostics();
    const document = new core.CBSParser().parse(fragment.content);
    const scopeAnalysis = this.scopeAnalyzer.analyze(document, fragment.content);
    const { symbolTable } = scopeAnalysis;
    const diagnostics = this.diagnosticsEngine.analyze(document, fragment.content, scopeAnalysis);
    const recovery = createFragmentRecoveryState(tokenizerDiagnostics, document);
    const mapper = createFragmentOffsetMapper(fragment);

    return {
      fragment,
      fragmentIndex,
      tokens,
      tokenizerDiagnostics,
      document,
      diagnostics,
      symbolTable,
      recovery,
      mapper,
      providerLookup: {
        getTokens: () => tokens,
        getDocument: () => document,
        getSymbolTable: () => symbolTable,
        getDiagnostics: () => diagnostics,
        getRecovery: () => recovery,
      },
    };
  }

  private createCacheKey(uri: string, version: FragmentAnalysisVersion): string {
    return `${uri}::${String(version)}`;
  }

  private createFragmentReuseKey(section: string, contentSignature: string): string {
    return `${section}::${contentSignature}`;
  }

  private resolveArtifact(filePath: string): CbsBearingArtifact | null {
    try {
      const artifact = core.parseCustomExtensionArtifactFromPath(filePath);
      if (!core.isCbsBearingArtifact(artifact)) {
        return null;
      }

      return artifact as CbsBearingArtifact;
    } catch {
      return null;
    }
  }
}

export const fragmentAnalysisService = new FragmentAnalysisService();
