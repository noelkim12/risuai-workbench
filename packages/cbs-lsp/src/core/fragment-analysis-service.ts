/**
 * CBS-bearing 문서를 fragment 단위로 분석하고 provider용 cache를 관리하는 서비스.
 * @file packages/cbs-lsp/src/core/fragment-analysis-service.ts
 */

import * as core from 'risu-workbench-core';
import type { CancellationToken } from 'vscode-languageserver/node';
import type {
  CbsBearingArtifact,
  CbsFragment,
  CbsFragmentMap,
  CBSDocument,
  DiagnosticInfo,
  LuaWasmAnalyzeResult,
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
import { shouldSkipOversizedLuaText } from '../utils/oversized-lua';
import {
  createDocumentRecoveryState,
  createFragmentRecoveryState,
  type DocumentRecoveryState,
  type FragmentRecoveryState,
} from './recovery-contract';

/** 분석 cache를 구분하는 문서 버전 값. */
export type FragmentAnalysisVersion = number | string;

/**
 * Fragment analysis 요청 정보.
 * LSP 문서 URI, 버전, 파일 경로, 현재 text snapshot을 한 번에 전달함.
 */
export interface FragmentAnalysisRequest {
  uri: string;
  version: FragmentAnalysisVersion;
  filePath: string;
  text: string;
}

/**
 * Fragment analysis cache metadata.
 * URI/version cache key와 text signature를 함께 보관해 stale 결과를 방지함.
 */
export interface FragmentAnalysisCacheMetadata {
  key: string;
  uri: string;
  version: FragmentAnalysisVersion;
  filePath: string;
  textSignature: string;
}

/**
 * Provider lookup hook 모음.
 * 분석 결과를 지연 조회하는 provider가 동일한 fragment snapshot을 재사용할 때 씀.
 */
export interface FragmentProviderLookupHooks {
  getTokens(): readonly Token[];
  getDocument(): CBSDocument;
  getSymbolTable(): SymbolTable;
  getDiagnostics(): readonly DiagnosticInfo[];
  getRecovery(): FragmentRecoveryState;
}

/**
 * 단일 CBS fragment 분석 결과.
 * Token, AST document, diagnostics, scope, mapper를 fragment-local contract로 묶음.
 */
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

/**
 * host 문서 전체의 fragment analysis 결과.
 * CBS-bearing artifact의 fragment map과 fragment별 분석 결과를 provider 진입점으로 제공함.
 */
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

/**
 * createSyntheticDocumentVersion 함수.
 * text content를 기반으로 cache invalidation용 lightweight signature를 생성함.
 *
 * @param text - signature를 만들 문서 또는 fragment text
 * @returns 길이와 FNV-1a 계열 hash를 포함한 synthetic version 문자열
 */
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

/**
 * FragmentAnalysisService 클래스.
 * CBS-bearing 문서 분석, Lua string fragment mapping, fragment-level cache 재사용을 담당함.
 */
export class FragmentAnalysisService {
  private readonly cache = new Map<string, DocumentFragmentAnalysis>();
  private readonly luaWasmScanCache = new Map<string, LuaWasmAnalyzeResult>();
  private readonly diagnosticsEngine = new DiagnosticsEngine(new core.CBSBuiltinRegistry());
  private readonly scopeAnalyzer = new ScopeAnalyzer();

  /**
   * prepareDocumentAnalysis 함수.
   * Lua 문서의 WASM string literal scan을 미리 실행해 이후 fragment mapping latency를 줄임.
   *
   * @param request - 분석을 준비할 문서 요청
   * @returns 준비 작업 완료 promise
   */
  async prepareDocumentAnalysis(request: FragmentAnalysisRequest): Promise<void> {
    const artifact = this.resolveArtifact(request.filePath);
    if (artifact !== 'lua' || shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
      return;
    }

    const textSignature = createSyntheticDocumentVersion(request.text);
    if (this.luaWasmScanCache.has(textSignature)) {
      return;
    }

    try {
      const result = await core.analyzeLuaWithWasm(request.text, {
        includeStringLiterals: true,
        includeStateAccesses: false,
      });
      if (result.ok) {
        this.luaWasmScanCache.set(textSignature, result);
      }
    } catch {
      // Missing or failed WASM keeps the existing non-oversized full-file mapper fallback.
    }
  }

  /**
   * analyzeDocument 함수.
   * CBS-bearing 문서를 artifact fragment로 나누고 각 fragment의 token, AST, diagnostics를 생성함.
   *
   * @param request - 분석할 문서 snapshot
   * @param cancellationToken - 요청 취소 여부를 확인할 LSP cancellation token
   * @returns 문서 fragment 분석 결과, 취소되거나 지원하지 않는 artifact면 null
   */
  analyzeDocument(
    request: FragmentAnalysisRequest,
    cancellationToken?: CancellationToken,
  ): DocumentFragmentAnalysis | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    // CBS-bearing artifact가 아니면 URI cache를 비우고 provider no-op 경로로 낮춤.
    const artifact = this.resolveArtifact(request.filePath);
    if (!artifact) {
      this.clearUri(request.uri);
      return null;
    }

    // version과 text signature를 함께 비교해 같은 version의 stale text 재사용을 막음.
    const cacheKey = this.createCacheKey(request.uri, request.version);
    const textSignature = shouldSkipOversizedLuaText(request.filePath, request.text.length)
      ? `oversized-lua:${request.text.length}`
      : createSyntheticDocumentVersion(request.text);
    const cached = this.cache.get(cacheKey);
    if (cached && cached.cache.textSignature === textSignature) {
      return cached;
    }

    // oversized Lua는 full parse를 건너뛰되 provider가 안전하게 읽을 empty analysis를 캐시함.
    if (shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
      const analysis = this.createEmptyAnalysis(request, artifact, cacheKey, textSignature);
      this.clearUri(request.uri, cacheKey);
      this.cache.set(cacheKey, analysis);
      return analysis;
    }

    const fragmentMap = this.getFragmentMap(artifact, request.text, textSignature);
    const fragments = [...fragmentMap.fragments].sort(compareFragmentsForStableOrder);
    // 이전 URI 분석에서 content가 같은 fragment를 재사용해 incremental edit 비용을 줄임.
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

    // provider가 section별 fragment를 deterministic하게 조회할 수 있도록 별도 index를 구성함.
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

  /**
   * getCachedAnalysis 함수.
   * 지정 URI/version에 대해 이미 계산된 document analysis를 조회함.
   *
   * @param uri - 조회할 문서 URI
   * @param version - 조회할 문서 버전
   * @returns cache에 남아 있는 분석 결과, 없으면 null
   */
  getCachedAnalysis(
    uri: string,
    version: FragmentAnalysisVersion,
  ): DocumentFragmentAnalysis | null {
    return this.cache.get(this.createCacheKey(uri, version)) ?? null;
  }

  /**
   * locatePosition 함수.
   * host document position을 현재 fragment 분석 결과의 cursor lookup으로 변환함.
   *
   * @param request - 위치를 찾을 문서 snapshot
   * @param hostPosition - host document 기준 cursor 위치
   * @param cancellationToken - 요청 취소 여부를 확인할 LSP cancellation token
   * @returns fragment cursor lookup 결과, 취소되거나 fragment가 없으면 null
   */
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

  /**
   * clearUri 함수.
   * 지정 URI의 오래된 analysis cache를 제거함.
   *
   * @param uri - cache를 지울 문서 URI
   * @param keepKey - 삭제하지 않고 유지할 cache key
   */
  clearUri(uri: string, keepKey?: string): void {
    for (const key of this.cache.keys()) {
      if (!key.startsWith(`${uri}::`) || key === keepKey) {
        continue;
      }

      this.cache.delete(key);
    }
  }

  /**
   * clearAll 함수.
   * document analysis cache와 Lua WASM scan cache를 모두 비움.
   */
  clearAll(): void {
    this.cache.clear();
    this.luaWasmScanCache.clear();
  }

  private getFragmentMap(
    artifact: CbsBearingArtifact,
    text: string,
    textSignature: string,
  ): CbsFragmentMap {
    if (artifact !== 'lua') {
      return core.mapToCbsFragments(artifact, text);
    }

    const cachedWasmResult = this.luaWasmScanCache.get(textSignature);
    if (cachedWasmResult?.ok) {
      return core.mapLuaWasmStringLiteralsToCbsFragments(text, cachedWasmResult.stringLiterals);
    }

    try {
      const wasmResult = core.analyzeLuaWithWasmSync(text, {
        includeStringLiterals: true,
        includeStateAccesses: false,
      });
      if (wasmResult.ok) {
        this.luaWasmScanCache.set(textSignature, wasmResult);
        return core.mapLuaWasmStringLiteralsToCbsFragments(text, wasmResult.stringLiterals);
      }
    } catch {
      // Missing or failed WASM keeps the existing non-oversized full-file mapper fallback.
    }

    return core.mapToCbsFragments(artifact, text);
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

  /**
   * createEmptyAnalysis 함수.
   * full parse를 건너뛴 문서를 provider-safe empty analysis로 표현함.
   *
   * @param request - 분석 요청 원본
   * @param artifact - 라우팅된 CBS-bearing artifact
   * @param cacheKey - 현재 URI/version cache key
   * @param textSignature - cache invalidation에 쓸 lightweight signature
   * @returns fragment가 없는 document analysis
   */
  private createEmptyAnalysis(
    request: FragmentAnalysisRequest,
    artifact: CbsBearingArtifact,
    cacheKey: string,
    textSignature: string,
  ): DocumentFragmentAnalysis {
    return {
      artifact,
      fragmentMap: {
        artifact,
        fragments: [],
        fileLength: request.text.length,
      },
      fragments: [],
      fragmentAnalyses: [],
      fragmentsBySection: new Map(),
      documents: [],
      diagnostics: [],
      recovery: createDocumentRecoveryState([]),
      cache: {
        key: cacheKey,
        uri: request.uri,
        version: request.version,
        filePath: request.filePath,
        textSignature,
      },
    };
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

/** 공유 FragmentAnalysisService singleton. */
export const fragmentAnalysisService = new FragmentAnalysisService();
