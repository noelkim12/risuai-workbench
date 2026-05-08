/**
 * RisuAI regex directive replacement plan DTO builder.
 * @file packages/core/src/simulator/regex/replacement-plan.ts
 */
import { getRisuRegexOrder, hasRisuRegexDirective } from './directives';
import type { RegexNewlinePolicy, RegexReplacementPlacement, RegexReplacementPlanDto, RegexReplacementPlanInput } from './types';

const DEFAULT_NEWLINE_POLICY: RegexNewlinePolicy = 'preserve';

/**
 * buildRegexReplacementPlan 함수.
 * Parsed directive와 replacement preview output을 side-effect 없는 placement DTO로 변환함.
 *
 * @param input - parsed directive 목록과 replacement preview output
 * @returns replacement output을 그대로 보존하는 deterministic plan DTO
 */
export function buildRegexReplacementPlan(input: RegexReplacementPlanInput): RegexReplacementPlanDto {
  const order = getRisuRegexOrder(input.directives);
  const plan: RegexReplacementPlanDto = {
    output: input.replacementPreview.output,
    placement: getReplacementPlacement(input.directives),
    newlinePolicy: getNewlinePolicy(input.directives),
    repeatBack: hasRisuRegexDirective(input.directives, 'repeat_back'),
    cbs: hasRisuRegexDirective(input.directives, 'cbs'),
    confidence: input.directives.length > 0 ? 'simulated' : 'verified',
    appliedDirectives: input.directives,
    appliedDirectiveRawTokens: input.directives.map((directive) => directive.raw),
  };

  if (order !== undefined) {
    plan.order = order;
  }

  return plan;
}

/**
 * getReplacementPlacement 함수.
 * Supported placement directive를 우선순위에 따라 plan placement로 변환함.
 *
 * @param directives - parsed directive 목록
 * @returns directive가 요청한 placement 또는 match 기본값
 */
function getReplacementPlacement(directives: RegexReplacementPlanInput['directives']): RegexReplacementPlacement {
  if (hasRisuRegexDirective(directives, 'move_top')) {
    return 'top';
  }

  if (hasRisuRegexDirective(directives, 'move_bottom')) {
    return 'bottom';
  }

  if (hasRisuRegexDirective(directives, 'inject')) {
    return 'inject';
  }

  return 'match';
}

/**
 * getNewlinePolicy 함수.
 * Newline 관련 directive를 stable policy 값으로 변환함.
 *
 * @param directives - parsed directive 목록
 * @returns newline handling policy
 */
function getNewlinePolicy(directives: RegexReplacementPlanInput['directives']): RegexNewlinePolicy {
  if (hasRisuRegexDirective(directives, 'no_end_nl')) {
    return 'preserve-without-auto-suffix';
  }

  return DEFAULT_NEWLINE_POLICY;
}
