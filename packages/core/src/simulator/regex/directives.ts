/**
 * Pure helpers for inspecting parsed RisuAI regex directives.
 * @file packages/core/src/simulator/regex/directives.ts
 */
import type { RisuRegexDirective, RisuRegexDirectiveKind } from './types';

/**
 * hasRisuRegexDirective 함수.
 * Parsed directive 목록에 지정 kind가 있는지 확인함.
 *
 * @param directives - 검사할 parsed RisuAI directive 목록
 * @param kind - 찾을 directive kind
 * @returns kind가 하나 이상 있으면 true
 */
export function hasRisuRegexDirective(directives: readonly RisuRegexDirective[], kind: RisuRegexDirectiveKind): boolean {
  return directives.some((directive) => directive.kind === kind);
}

/**
 * getRisuRegexOrder 함수.
 * 첫 번째 `<order n>` directive의 numeric order를 반환함.
 *
 * @param directives - 검사할 parsed RisuAI directive 목록
 * @returns order directive가 있으면 parsed order, 없으면 undefined
 */
export function getRisuRegexOrder(directives: readonly RisuRegexDirective[]): number | undefined {
  return directives.find((directive) => directive.kind === 'order')?.order;
}
