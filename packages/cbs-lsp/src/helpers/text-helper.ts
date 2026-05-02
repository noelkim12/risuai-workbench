/**
 * cbs-lsp text/range display utility helper class.
 * @file packages/cbs-lsp/src/helpers/text-helper.ts
 */

import type { Range } from 'risu-workbench-core';

import { positionToOffset } from '../utils/position';

/**
 * CbsLspTextHelper 클래스.
 * feature/provider가 공유하는 문자열 서식과 range text 추출 유틸을 모음.
 */
export class CbsLspTextHelper {
  /**
   * formatOrdinal 함수.
   * 정수를 영문 ordinal suffix가 붙은 문자열로 바꿈.
   *
   * @param value - ordinal로 표현할 정수 값
   * @returns `1st`, `2nd`, `3rd` 같은 ordinal 문자열
   */
  static formatOrdinal(value: number): string {
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return `${value}st`;
    }
    if (mod10 === 2 && mod100 !== 12) {
      return `${value}nd`;
    }
    if (mod10 === 3 && mod100 !== 13) {
      return `${value}rd`;
    }
    return `${value}th`;
  }

  /**
   * formatRangeStart 함수.
   * range 시작 위치를 사람이 읽기 쉬운 line/character 문구로 바꿈.
   *
   * @param range - 시작 위치를 보여줄 range
   * @returns `line X, character Y` 형식 문자열
   */
  static formatRangeStart(range: Range): string {
    return `line ${range.start.line + 1}, character ${range.start.character + 1}`;
  }

  /**
   * extractRangeText 함수.
   * source text에서 range가 가리키는 부분 문자열을 잘라냄.
   *
   * @param sourceText - 원문 텍스트
   * @param range - 추출할 range
   * @returns range에 대응하는 부분 문자열
   */
  static extractRangeText(sourceText: string, range: Range): string {
    const startOffset = positionToOffset(sourceText, range.start);
    const endOffset = positionToOffset(sourceText, range.end);
    return sourceText.slice(startOffset, endOffset);
  }
}
