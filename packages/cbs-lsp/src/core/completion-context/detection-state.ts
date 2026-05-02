/**
 * Completion trigger 판별에서 공유하는 cursor/token/node-path 상태 헬퍼 모음.
 * @file packages/cbs-lsp/src/core/completion-context/detection-state.ts
 */

import { TokenType, type Range as CBSRange } from 'risu-workbench-core';
import { normalizeLookupKey } from '../../analyzer/scope/lookup-key';
import { getVariableMacroArgumentKind } from '../../analyzer/scope/scope-macro-rules';
import { positionToOffset } from '../../utils/position';
import type { CompletionTriggerContext } from '../completion-context';
import type { FragmentCursorLookupResult } from '../fragment-locator';

type CompletionToken = FragmentCursorLookupResult['fragmentAnalysis']['tokens'][number];

/**
 * CompletionOpenBraceToken 타입.
 * 현재 macro context의 open brace 위치와 token index를 묶음.
 */
export interface CompletionOpenBraceToken {
  index: number;
  offset: number;
}

/**
 * CompletionSeparatorToken 타입.
 * cursor 이전 separator token과 fragment-local offset을 묶음.
 */
export interface CompletionSeparatorToken {
  token: CompletionToken;
  offset: number;
}

/**
 * CompletionDetectionState 클래스.
 * detector decision logic이 재사용하는 fragment cursor 상태와 계산 헬퍼를 보관함.
 */
export class CompletionDetectionState {
  readonly lookup: FragmentCursorLookupResult;
  readonly content: string;
  readonly fragmentLocalOffset: number;
  readonly tokens: readonly CompletionToken[];
  readonly token: FragmentCursorLookupResult['token'];
  readonly nodePath: FragmentCursorLookupResult['nodePath'];
  readonly nodeSpan: FragmentCursorLookupResult['nodeSpan'];

  /**
   * constructor 함수.
   * fragment cursor lookup에서 detector 준비 상태를 구성함.
   *
   * @param lookup - fragment locator가 계산한 cursor lookup 결과
   */
  constructor(lookup: FragmentCursorLookupResult) {
    this.lookup = lookup;
    this.content = lookup.fragmentAnalysis.fragment.content;
    this.fragmentLocalOffset = lookup.fragmentLocalOffset;
    this.tokens = lookup.fragmentAnalysis.tokens;
    this.token = lookup.token;
    this.nodePath = lookup.nodePath;
    this.nodeSpan = lookup.nodeSpan;
  }

  /**
   * offsetOf 함수.
   * CBS range position을 현재 fragment content의 local offset으로 변환함.
   *
   * @param position - offset으로 바꿀 CBS range position
   * @returns fragment-local offset
   */
  offsetOf(position: CBSRange['start']): number {
    return positionToOffset(this.content, position);
  }

  /**
   * findParentMacro 함수.
   * nodePath에서 cursor가 속한 가장 가까운 macro call을 찾음.
   *
   * @returns parent macro 정보 또는 null
   */
  findParentMacro(): { name: string; range: CBSRange } | null {
    for (let i = this.nodePath.length - 1; i >= 0; i--) {
      const node = this.nodePath[i];
      if (node?.type === 'MacroCall') {
        return node as unknown as { name: string; range: CBSRange };
      }
    }
    return null;
  }

  /**
   * findOpenBlockKind 함수.
   * nodePath에서 현재 열려 있는 block kind를 찾음.
   *
   * @returns open block kind 또는 null
   */
  findOpenBlockKind(): string | null {
    for (let i = this.nodePath.length - 1; i >= 0; i--) {
      const node = this.nodePath[i];
      if (node?.type === 'Block') {
        return node.kind;
      }
    }
    return null;
  }

  /**
   * findWhenBlock 함수.
   * #when header operator completion에 사용할 block span을 찾음.
   *
   * @returns when block open range 또는 null
   */
  findWhenBlock(): { openRange: CBSRange } | null {
    for (const node of this.nodePath) {
      if (node.type === 'Block' && node.kind === 'when') {
        return node as { openRange: CBSRange };
      }
    }
    return null;
  }

  /**
   * findOpenBraceToken 함수.
   * cursor 이전의 마지막 유효 OpenBrace를 찾아 현재 macro 시작점을 고정함.
   *
   * @returns open brace token 위치 또는 null
   */
  findOpenBraceToken(): CompletionOpenBraceToken | null {
    let startIndex = this.tokens.length - 1;
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const token = this.tokens[i];
      const tokenStart = this.offsetOf(token.range.start);
      const tokenEnd = this.offsetOf(token.range.end);

      if (
        tokenEnd <= this.fragmentLocalOffset ||
        (tokenStart <= this.fragmentLocalOffset && tokenEnd > this.fragmentLocalOffset)
      ) {
        startIndex = i;
        break;
      }
    }

    for (let i = startIndex; i >= 0; i--) {
      const token = this.tokens[i];
      const tokenStart = this.offsetOf(token.range.start);

      if (token.type === TokenType.OpenBrace) {
        return { index: i, offset: tokenStart };
      }
      if (token.type === TokenType.CloseBrace && i < startIndex) {
        return null;
      }
    }
    return null;
  }

  /**
   * findLastSeparatorBeforeCursor 함수.
   * cursor 앞의 마지막 ArgumentSeparator를 찾아 argument 기반 범위를 계산함.
   *
   * @returns separator token 위치 또는 null
   */
  findLastSeparatorBeforeCursor(): CompletionSeparatorToken | null {
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const token = this.tokens[i];
      const tokenEnd = this.offsetOf(token.range.end);
      if (token.type === TokenType.ArgumentSeparator && tokenEnd <= this.fragmentLocalOffset) {
        return {
          token,
          offset: this.offsetOf(token.range.start),
        };
      }
    }
    return null;
  }

  /**
   * getPrefixFromTokenEnd 함수.
   * token 끝부터 cursor까지의 prefix를 보수적으로 계산함.
   *
   * @param token - prefix 기준이 되는 token
   * @returns 현재 정책상 빈 prefix
   */
  getPrefixFromTokenEnd(token: CompletionToken): string {
    const tokenEnd = this.offsetOf(token.range.end);
    if (this.fragmentLocalOffset <= tokenEnd) return '';
    return '';
  }

  /**
   * getTypedTokenPrefix 함수.
   * cursor가 token 안에 있을 때 실제 입력된 token prefix를 계산함.
   *
   * @returns trim된 입력 prefix
   */
  getTypedTokenPrefix(): string {
    if (!this.token || this.fragmentLocalOffset <= this.token.localStartOffset) {
      return '';
    }

    const typedLength = Math.min(
      this.token.token.value.length,
      Math.max(0, this.fragmentLocalOffset - this.token.localStartOffset),
    );
    return this.token.token.value.slice(0, typedLength).trim();
  }

  /**
   * inferArgumentIndexFromOpenBrace 함수.
   * open brace 뒤 cursor 전 separator 개수로 argument index를 추론함.
   *
   * @param openBraceIndex - 기준 OpenBrace token index
   * @returns 추론된 argument index
   */
  inferArgumentIndexFromOpenBrace(openBraceIndex: number): number {
    const openBrace = this.tokens[openBraceIndex];
    if (!openBrace) {
      return 0;
    }

    const openBraceOffset = this.offsetOf(openBrace.range.start);
    const separatorCount = this.tokens.filter((candidate) => {
      if (candidate.type !== TokenType.ArgumentSeparator) {
        return false;
      }

      const candidateStart = this.offsetOf(candidate.range.start);
      return candidateStart >= openBraceOffset && candidateStart < this.fragmentLocalOffset;
    }).length;

    return Math.max(0, separatorCount - 1);
  }

  /**
   * createVariableArgumentContext 함수.
   * macro argument 위치가 scope variable completion 대상이면 context를 생성함.
   *
   * @param macroName - completion을 요청한 macro 이름
   * @param argumentIndex - cursor가 위치한 macro argument index
   * @param prefix - 현재 입력 prefix
   * @param startOffset - 교체 범위 시작 offset
   * @param endOffset - 교체 범위 끝 offset
   * @returns variable completion context 또는 null
   */
  createVariableArgumentContext(
    macroName: string,
    argumentIndex: number,
    prefix: string,
    startOffset: number,
    endOffset: number,
  ): CompletionTriggerContext | null {
    const kind = getVariableMacroArgumentKind(normalizeLookupKey(macroName), argumentIndex);
    if (!kind) {
      return null;
    }

    return {
      type: 'variable-names',
      prefix,
      startOffset,
      endOffset,
      kind,
    };
  }
}

/**
 * createCompletionDetectionState 함수.
 * detector 함수들이 공유할 CompletionDetectionState seam을 생성함.
 *
 * @param lookup - fragment locator가 계산한 cursor lookup 결과
 * @returns completion detection state 객체
 */
export function createCompletionDetectionState(
  lookup: FragmentCursorLookupResult,
): CompletionDetectionState {
  return new CompletionDetectionState(lookup);
}
