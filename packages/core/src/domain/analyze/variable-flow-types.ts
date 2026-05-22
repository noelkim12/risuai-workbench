/**
 * CBS 변수 흐름 분석에서 공유하는 타입 정의 모음.
 * @file packages/core/src/domain/analyze/variable-flow-types.ts
 */

import type { PipelinePhase } from './constants';

/**
 * VarEvent 인터페이스.
 * 단일 CBS 변수의 읽기 또는 쓰기 이벤트를 나타낸다.
 */
export interface VarEvent {
  /** 이벤트가 참조하는 CBS 변수 이름 */
  varName: string;
  /** 변수 접근 동작, 읽기 또는 쓰기 */
  action: 'read' | 'write';
  /** 이벤트가 속한 RisuAI 실행 파이프라인 phase */
  phase: PipelinePhase;
  /** 이벤트를 발생시킨 element 타입 */
  elementType: string;
  /** 이벤트를 발생시킨 element 표시 이름 */
  elementName: string;
  /** 같은 phase 내부에서 큰 값이 먼저 실행되는 순서 힌트 */
  executionOrder?: number;
}

/**
 * VarFlowEntry 인터페이스.
 * 변수 하나에 대한 전체 이벤트 흐름, 기본값, 이슈를 묶는다.
 */
export interface VarFlowEntry {
  /** 분석 대상 CBS 변수 이름 */
  varName: string;
  /** 런타임 순서로 정렬된 읽기와 쓰기 이벤트 목록 */
  events: VarEvent[];
  /** 봇 설정이나 기본 스코프에서 주어진 초기값, 없으면 null */
  defaultValue: string | null;
  /** 이 변수에서 감지된 흐름 이슈 목록 */
  issues: VarFlowIssue[];
}

/**
 * VarFlowIssue 인터페이스.
 * 변수 흐름에서 발견한 진단성 이슈 한 건을 나타낸다.
 */
export interface VarFlowIssue {
  /** 이슈 분류 코드 */
  type: 'uninitialized-read' | 'write-only' | 'overwrite-conflict' | 'phase-order-risk';
  /** 사용자에게 표시할 이슈 심각도 */
  severity: 'info' | 'warning' | 'error';
  /** 이슈 설명 메시지 */
  message: string;
  /** 이슈 판단에 사용된 관련 이벤트 목록 */
  events: VarEvent[];
}

/**
 * VarFlowResult 인터페이스.
 * 전체 CBS 변수 흐름 분석 결과와 집계 요약을 담는다.
 */
export interface VarFlowResult {
  /** 변수 이름별 흐름 분석 엔트리 목록 */
  variables: VarFlowEntry[];
  /** 전체 분석 결과 집계 */
  summary: {
    /** 분석된 전체 변수 수 */
    totalVariables: number;
    /** 하나 이상의 이슈가 있는 변수 수 */
    withIssues: number;
    /** 이슈 타입별 발생 건수 */
    byIssueType: Record<string, number>;
  };
}
