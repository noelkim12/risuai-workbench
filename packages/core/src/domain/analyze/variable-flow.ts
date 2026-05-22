/**
 * CBS 변수 읽기와 쓰기 이벤트를 런타임 phase 기준으로 분석하는 유틸 모음.
 * @file packages/core/src/domain/analyze/variable-flow.ts
 */

import type { ElementCBSData } from './correlation';
import { PHASE_MAP, PipelinePhase } from './constants';
import type { VarEvent, VarFlowEntry, VarFlowIssue, VarFlowResult } from './variable-flow-types';

/**
 * analyzeVariableFlow 함수.
 * CBS 변수 이벤트를 수집하고 phase 순서에 맞춰 변수별 흐름과 이슈 요약을 만든다.
 *
 * @param elements - 분석 대상 element별 CBS 변수 읽기, 쓰기, 실행 순서 정보 목록
 * @param defaultVariables - 봇 설정이나 기본 스코프에서 제공된 변수 초기값 맵
 * @returns 변수별 이벤트, 기본값, 이슈와 전체 요약을 담은 변수 흐름 분석 결과
 */
export function analyzeVariableFlow(
  elements: ElementCBSData[],
  defaultVariables: Record<string, string>,
): VarFlowResult {
  const allEvents: VarEvent[] = [];

  for (const element of elements) {
    const phase = PHASE_MAP[element.elementType] ?? PipelinePhase.CBS_EXPANSION;

    for (const varName of element.reads) {
      allEvents.push({
        varName,
        action: 'read',
        phase,
        elementType: element.elementType,
        elementName: element.elementName,
        executionOrder: element.executionOrder,
      });
    }
    for (const varName of element.writes) {
      allEvents.push({
        varName,
        action: 'write',
        phase,
        elementType: element.elementType,
        elementName: element.elementName,
        executionOrder: element.executionOrder,
      });
    }
  }

  const eventMap = new Map<string, VarEvent[]>();
  for (const event of allEvents) {
    const bucket = eventMap.get(event.varName) ?? [];
    bucket.push(event);
    eventMap.set(event.varName, bucket);
  }

  const variables: VarFlowEntry[] = [];
  for (const [varName, events] of [...eventMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const orderedEvents = [...events].sort(compareRuntimeOrder);
    const defaultValue = defaultVariables[varName] ?? null;
    variables.push({
      varName,
      events: orderedEvents,
      defaultValue,
      issues: detectIssues(varName, orderedEvents, defaultValue),
    });
  }

  const byIssueType: Record<string, number> = {};
  let withIssues = 0;
  for (const variable of variables) {
    if (variable.issues.length > 0) {
      withIssues += 1;
    }
    for (const issue of variable.issues) {
      byIssueType[issue.type] = (byIssueType[issue.type] ?? 0) + 1;
    }
  }

  return {
    variables,
    summary: {
      totalVariables: variables.length,
      withIssues,
      byIssueType,
    },
  };
}

/**
 * detectIssues 함수.
 * 정렬된 변수 이벤트에서 초기화 전 읽기, 쓰기 전용, 충돌, phase 순서 위험을 찾는다.
 *
 * @param varName - 이슈를 판정할 CBS 변수 이름
 * @param events - 런타임 순서로 정렬된 해당 변수의 읽기와 쓰기 이벤트 목록
 * @param defaultValue - 분석 시작 시점에 이미 존재하는 기본값, 없으면 null
 * @returns 발견된 변수 흐름 이슈 목록
 */
function detectIssues(
  varName: string,
  events: VarEvent[],
  defaultValue: string | null,
): VarFlowIssue[] {
  const issues: VarFlowIssue[] = [];
  const reads = events.filter((event) => event.action === 'read');
  const writes = events.filter((event) => event.action === 'write');
  let hasValue = defaultValue !== null;

  for (const event of events) {
    if (event.action === 'read' && !hasValue) {
      issues.push({
        type: 'uninitialized-read',
        severity: 'warning',
        message: `Variable "${varName}" may be read before it is initialized.`,
        events: [event],
      });
      break;
    }
    if (event.action === 'write') {
      hasValue = true;
    }
  }

  if (writes.length > 0 && reads.length === 0) {
    issues.push({
      type: 'write-only',
      severity: 'info',
      message: `Variable "${varName}" is written but never read.`,
      events: writes,
    });
  }

  const uniqueWriters = [...new Set(writes.map((event) => `${event.elementType}:${event.elementName}`))];
  if (uniqueWriters.length >= 2) {
    issues.push({
      type: 'overwrite-conflict',
      severity: 'warning',
      message: `Variable "${varName}" is written by multiple elements: ${uniqueWriters.join(', ')}.`,
      events: writes,
    });
  }

  const seenPairs = new Set<string>();
  for (const read of reads) {
    for (const write of writes) {
      if (!isDefinitivelyLater(write, read)) continue;
      const pairKey = `${write.elementType}:${write.elementName}->${read.elementType}:${read.elementName}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      issues.push({
        type: 'phase-order-risk',
        severity: 'warning',
        message: `Variable "${varName}" is written by "${write.elementName}" after "${read.elementName}" may already read it.`,
        events: [write, read],
      });
    }
  }

  return issues;
}

/**
 * compareRuntimeOrder 함수.
 * phase, 실행 순서, 이벤트 동작, element 이름을 기준으로 변수 이벤트를 런타임 순서에 가깝게 정렬한다.
 *
 * @param left - 정렬 비교의 왼쪽 변수 이벤트
 * @param right - 정렬 비교의 오른쪽 변수 이벤트
 * @returns left가 앞서면 음수, right가 앞서면 양수, 같은 순서면 0
 */
function compareRuntimeOrder(left: VarEvent, right: VarEvent): number {
  if (left.phase !== right.phase) {
    return left.phase - right.phase;
  }

  if (left.executionOrder !== undefined && right.executionOrder !== undefined) {
    if (left.executionOrder !== right.executionOrder) {
      return right.executionOrder - left.executionOrder;
    }
  }

  if (left.action !== right.action) {
    return left.action === 'write' ? -1 : 1;
  }

  return left.elementName.localeCompare(right.elementName);
}

/**
 * isDefinitivelyLater 함수.
 * 쓰기 이벤트가 읽기 이벤트보다 명확히 늦게 실행되는지 phase와 실행 순서로 판정한다.
 *
 * @param write - 쓰기 시점을 확인할 변수 이벤트
 * @param read - 비교 기준이 되는 읽기 변수 이벤트
 * @returns 쓰기가 읽기보다 확정적으로 늦으면 true, 아니면 false
 */
function isDefinitivelyLater(write: VarEvent, read: VarEvent): boolean {
  if (write.phase !== read.phase) {
    return write.phase > read.phase;
  }

  if (write.executionOrder !== undefined && read.executionOrder !== undefined) {
    return write.executionOrder < read.executionOrder;
  }

  return false;
}
