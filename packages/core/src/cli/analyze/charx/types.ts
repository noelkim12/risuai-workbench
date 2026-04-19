import {
  type DeadCodeResult,
  type ElementCBSData,
  type LorebookActivationChainResult,
  type LorebookRegexCorrelation,
  type TokenBudgetResult,
  type UnifiedVarEntry,
  type VarFlowResult,
} from '@/domain';
import type { LuaAnalysisArtifact } from '@/domain/analyze/lua-core';
import type { TextMentionEdge } from '@/domain/analyze/text-mention';
import type { LorebookStructureResult } from '@/domain/lorebook/structure';

export type { ElementCBSData, LorebookRegexCorrelation, UnifiedVarEntry };

/** defaultVariables 파싱 결과 및 관련 CBS 데이터. */
export interface VariablesResult {
  variables: Record<string, string>;
  cbsData: ElementCBSData[];
}

/** backgroundHTML에서 추출한 CBS 데이터와 에셋 참조(src, url()) 목록. */
export interface HtmlResult {
  cbsData: ElementCBSData | null;
  assetRefs: string[];
}

/** Phase 1 (COLLECT) 결과 — 각 소스별로 수집한 CBS 변수 연산 데이터. */
export interface CollectResult {
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
  variables: VariablesResult;
  html: HtmlResult;
  tsCBS: ElementCBSData[];
  luaCBS: ElementCBSData[];
  luaArtifacts: LuaAnalysisArtifact[];
}

/** Phase 2 (CORRELATE) 결과 — 통합 변수 그래프와 Lorebook↔Regex 상관관계. */
export interface CorrelateResult {
  unifiedGraph: Map<string, UnifiedVarEntry>;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  defaultVariables: Record<string, string>;
}

/** Markdown/HTML 리포터 공용 입력 데이터. */
export interface CharxReportData {
  charx: unknown;
  characterName: string;
  unifiedGraph: Map<string, UnifiedVarEntry>;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookStructure: LorebookStructureResult;
  lorebookActivationChain: LorebookActivationChainResult;
  defaultVariables: Record<string, string>;
  htmlAnalysis: HtmlResult;
  tokenBudget: TokenBudgetResult;
  variableFlow: VarFlowResult;
  deadCode: DeadCodeResult;
  textMentions: TextMentionEdge[];
  collected: CollectResult;
  luaArtifacts: LuaAnalysisArtifact[];
}
