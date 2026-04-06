import {
  type DeadCodeResult,
  type ElementCBSData,
  type LorebookRegexCorrelation,
  type TokenBudgetResult,
  type UnifiedVarEntry,
  type VarFlowResult,
} from '@/domain';
import type { LorebookStructureResult } from '@/domain';

export type { ElementCBSData, LorebookRegexCorrelation, UnifiedVarEntry };

/** Phase 1 (COLLECT) 결과 — module 디렉토리에서 수집한 CBS 변수 연산 데이터. */
export interface ModuleCollectResult {
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
  luaCBS: ElementCBSData[];
  htmlCBS: ElementCBSData | null;
  metadata: Record<string, unknown>;
}

/** Phase 2 (CORRELATE) 결과 — 통합 변수 그래프와 Lorebook↔Regex 상관관계. */
export interface ModuleCorrelateResult {
  unifiedGraph: Map<string, UnifiedVarEntry>;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
}

/** Markdown/HTML 리포터 공용 입력 데이터. */
export interface ModuleReportData {
  moduleName: string;
  collected: ModuleCollectResult;
  unifiedGraph: Map<string, UnifiedVarEntry>;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookStructure: LorebookStructureResult | null;
  tokenBudget: TokenBudgetResult;
  variableFlow: VarFlowResult;
  deadCode: DeadCodeResult;
}
