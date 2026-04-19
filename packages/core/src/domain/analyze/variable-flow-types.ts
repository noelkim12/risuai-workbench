import type { PipelinePhase } from './constants';

/** 단일 변수 read/write 이벤트 */
export interface VarEvent {
  varName: string;
  action: 'read' | 'write';
  phase: PipelinePhase;
  elementType: string;
  elementName: string;
  executionOrder?: number;
}

/** 변수별 흐름 엔트리 */
export interface VarFlowEntry {
  varName: string;
  events: VarEvent[];
  defaultValue: string | null;
  issues: VarFlowIssue[];
}

/** 변수 흐름 이슈 */
export interface VarFlowIssue {
  type: 'uninitialized-read' | 'write-only' | 'overwrite-conflict' | 'phase-order-risk';
  severity: 'info' | 'warning' | 'error';
  message: string;
  events: VarEvent[];
}

/** 변수 흐름 분석 결과 */
export interface VarFlowResult {
  variables: VarFlowEntry[];
  summary: {
    totalVariables: number;
    withIssues: number;
    byIssueType: Record<string, number>;
  };
}
