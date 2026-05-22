/**
 * 분석 대상 텍스트 컴포넌트의 토큰 예산을 추정하는 유틸 모음.
 * @file packages/core/src/domain/analyze/token-budget.ts
 */

import { TOKEN_RATIOS, TOKEN_THRESHOLDS } from './constants';

/** 토큰 예산 산출용 단일 텍스트 컴포넌트 */
export interface TokenComponent {
  category: string;
  name: string;
  text: string;
  alwaysActive: boolean;
}

/** 토큰 예산 경고 항목 */
export interface TokenBudgetWarning {
  severity: 'info' | 'warning' | 'error';
  message: string;
  component?: string;
}

/** 토큰 예산 분석 결과 */
export interface TokenBudgetResult {
  components: Array<{
    category: string;
    name: string;
    estimatedTokens: number;
    alwaysActive: boolean;
  }>;
  byCategory: Record<
    string,
    {
      count: number;
      totalTokens: number;
      alwaysActiveTokens: number;
    }
  >;
  totals: {
    alwaysActiveTokens: number;
    conditionalTokens: number;
    worstCaseTokens: number;
  };
  warnings: TokenBudgetWarning[];
}

const CBS_MACRO_RE = /\{\{[^}]*\}\}/g;
const CJK_RE = /[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]/g;

/**
 * estimateTokens 함수.
 * 모델 호출 없이 CBS 매크로를 제외한 텍스트의 대략적인 토큰 수를 계산함.
 *
 * @param text - 토큰 수를 추정할 원본 텍스트
 * @returns CJK와 라틴 문자 비율을 반영한 반올림 토큰 추정치
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const cleaned = text.replace(CBS_MACRO_RE, '');
  if (!cleaned.trim()) return 0;

  const cjkCount = cleaned.match(CJK_RE)?.length ?? 0;
  const latinCount = cleaned.length - cjkCount;
  const cjkTokens = cjkCount / TOKEN_RATIOS.CJK_CHARS_PER_TOKEN;
  const latinTokens = latinCount / TOKEN_RATIOS.LATIN_CHARS_PER_TOKEN;

  return Math.round(cjkTokens + latinTokens);
}

/**
 * analyzeTokenBudget 함수.
 * 텍스트 컴포넌트별 토큰 추정치를 집계하고 예산 초과 경고를 생성함.
 *
 * @param components - 분석할 텍스트 컴포넌트 목록
 * @returns 컴포넌트별 추정치, 카테고리별 합계, 전체 합계와 경고 목록
 */
export function analyzeTokenBudget(components: TokenComponent[]): TokenBudgetResult {
  const analyzed = components.map((component) => ({
    category: component.category,
    name: component.name,
    estimatedTokens: estimateTokens(component.text),
    alwaysActive: component.alwaysActive,
  }));

  const byCategory: TokenBudgetResult['byCategory'] = {};
  for (const component of analyzed) {
    const bucket = byCategory[component.category] ?? {
      count: 0,
      totalTokens: 0,
      alwaysActiveTokens: 0,
    };
    bucket.count += 1;
    bucket.totalTokens += component.estimatedTokens;
    if (component.alwaysActive) {
      bucket.alwaysActiveTokens += component.estimatedTokens;
    }
    byCategory[component.category] = bucket;
  }

  const alwaysActiveTokens = analyzed
    .filter((component) => component.alwaysActive)
    .reduce((sum, component) => sum + component.estimatedTokens, 0);
  const conditionalTokens = analyzed
    .filter((component) => !component.alwaysActive)
    .reduce((sum, component) => sum + component.estimatedTokens, 0);
  const worstCaseTokens = alwaysActiveTokens + conditionalTokens;

  const warnings: TokenBudgetWarning[] = [];
  if (alwaysActiveTokens > TOKEN_THRESHOLDS.ERROR_ALWAYS_ACTIVE) {
    warnings.push({
      severity: 'error',
      message: `Always-active token usage (~${alwaysActiveTokens}) exceeds ${TOKEN_THRESHOLDS.ERROR_ALWAYS_ACTIVE}.`,
    });
  }

  for (const component of analyzed) {
    if (component.estimatedTokens > TOKEN_THRESHOLDS.WARNING_SINGLE_COMPONENT) {
      warnings.push({
        severity: 'warning',
        message: `Component "${component.name}" (${component.category}) uses ~${component.estimatedTokens} tokens.`,
        component: component.name,
      });
    }
  }

  return {
    components: analyzed,
    byCategory,
    totals: {
      alwaysActiveTokens,
      conditionalTokens,
      worstCaseTokens,
    },
    warnings,
  };
}
