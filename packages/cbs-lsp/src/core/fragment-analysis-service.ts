import * as core from 'risu-workbench-core';
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
}

export interface FragmentProviderLookupHooks {
  getTokens(): readonly Token[];
  getDocument(): CBSDocument;
  getSymbolTable(): SymbolTable;
  getDiagnostics(): readonly DiagnosticInfo[];
}

export interface FragmentDocumentAnalysis {
  fragment: CbsFragment;
  fragmentIndex: number;
  tokens: readonly Token[];
  tokenizerDiagnostics: readonly TokenizerDiagnostic[];
  document: CBSDocument;
  diagnostics: readonly DiagnosticInfo[];
  symbolTable: SymbolTable;
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
  cache: FragmentAnalysisCacheMetadata;
}

export function createSyntheticDocumentVersion(text: string): string {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `text:${text.length}:${(hash >>> 0).toString(16)}`;
}

export class FragmentAnalysisService {
  private readonly cache = new Map<string, DocumentFragmentAnalysis>();
  private readonly diagnosticsEngine = new DiagnosticsEngine(new core.CBSBuiltinRegistry());
  private readonly scopeAnalyzer = new ScopeAnalyzer();

  analyzeDocument(request: FragmentAnalysisRequest): DocumentFragmentAnalysis | null {
    const cacheKey = this.createCacheKey(request.uri, request.version);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const artifact = this.resolveArtifact(request.filePath);
    if (!artifact) {
      this.clearUri(request.uri);
      return null;
    }

    const fragmentMap = core.mapToCbsFragments(artifact, request.text);
    const fragmentAnalyses = fragmentMap.fragments.map((fragment, fragmentIndex) =>
      this.analyzeFragment(fragment, fragmentIndex),
    );
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
      fragments: fragmentMap.fragments,
      fragmentAnalyses,
      fragmentsBySection: sections,
      documents: fragmentAnalyses.map((fragmentAnalysis) => fragmentAnalysis.document),
      diagnostics: fragmentAnalyses.flatMap((fragmentAnalysis) => fragmentAnalysis.diagnostics),
      cache: {
        key: cacheKey,
        uri: request.uri,
        version: request.version,
        filePath: request.filePath,
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
  ): FragmentCursorLookupResult | null {
    const analysis = this.analyzeDocument(request);
    if (!analysis) {
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

  private analyzeFragment(fragment: CbsFragment, fragmentIndex: number): FragmentDocumentAnalysis {
    const tokenizer = new core.CBSTokenizer();
    const tokens = tokenizer.tokenize(fragment.content);
    const tokenizerDiagnostics = tokenizer.getDiagnostics();
    const document = new core.CBSParser().parse(fragment.content);
    const symbolTable = this.scopeAnalyzer.analyze(document, fragment.content);
    const diagnostics = this.diagnosticsEngine.analyze(document, fragment.content, symbolTable);
    const mapper = createFragmentOffsetMapper(fragment);

    return {
      fragment,
      fragmentIndex,
      tokens,
      tokenizerDiagnostics,
      document,
      diagnostics,
      symbolTable,
      mapper,
      providerLookup: {
        getTokens: () => tokens,
        getDocument: () => document,
        getSymbolTable: () => symbolTable,
        getDiagnostics: () => diagnostics,
      },
    };
  }

  private createCacheKey(uri: string, version: FragmentAnalysisVersion): string {
    return `${uri}::${String(version)}`;
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
