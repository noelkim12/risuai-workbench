import type { VarFlowResult } from './variable-flow-types';

/** dead code finding 종류 */
export type DeadCodeType =
  | 'write-only-variable'
  | 'uninitialized-variable'
  | 'shadowed-lorebook-keyword'
  | 'empty-cbs-condition'
  | 'unreachable-lorebook-entry'
  | 'no-effect-regex';

/** dead code finding 항목 */
export interface DeadCodeFinding {
  type: DeadCodeType;
  severity: 'info' | 'warning';
  elementType: string;
  elementName: string;
  message: string;
  detail?: string;
}

/** dead code 분석 결과 */
export interface DeadCodeResult {
  findings: DeadCodeFinding[];
  summary: {
    totalFindings: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
  };
}

/** lorebook dead-code용 엔트리 정보 */
export interface LorebookEntryInfo {
  name: string;
  keywords: string[];
  insertionOrder: number;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  secondaryKeys?: string[];
}

/** regex dead-code용 스크립트 정보 */
export interface RegexScriptInfo {
  name: string;
  in: string;
  out: string;
}

/** detectDeadCode derives cleanup candidates from flow results and raw metadata */
export function detectDeadCode(
  variableFlow: VarFlowResult,
  context: {
    lorebookEntries: LorebookEntryInfo[];
    regexScripts: RegexScriptInfo[];
  },
): DeadCodeResult {
  const findings: DeadCodeFinding[] = [];

  for (const variable of variableFlow.variables) {
    if (variable.issues.some((issue) => issue.type === 'write-only')) {
      const writer = variable.events.find((event) => event.action === 'write');
      findings.push({
        type: 'write-only-variable',
        severity: 'info',
        elementType: writer?.elementType ?? 'unknown',
        elementName: writer?.elementName ?? 'unknown',
        message: `Variable "${variable.varName}" is set but never read.`,
      });
    }

    if (variable.issues.some((issue) => issue.type === 'uninitialized-read')) {
      const reader = variable.events.find((event) => event.action === 'read');
      findings.push({
        type: 'uninitialized-variable',
        severity: 'warning',
        elementType: reader?.elementType ?? 'unknown',
        elementName: reader?.elementName ?? 'unknown',
        message: `Variable "${variable.varName}" is read before initialization.`,
      });
    }
  }

  const keywordMap = new Map<string, LorebookEntryInfo[]>();
  for (const entry of context.lorebookEntries) {
    if (!entry.enabled) continue;
    for (const keyword of entry.keywords) {
      const bucket = keywordMap.get(keyword) ?? [];
      bucket.push(entry);
      keywordMap.set(keyword, bucket);
    }
  }

  for (const [keyword, entries] of keywordMap.entries()) {
    if (entries.length < 2) continue;
    const sorted = [...entries].sort((left, right) => right.insertionOrder - left.insertionOrder);
    for (let index = 1; index < sorted.length; index += 1) {
      findings.push({
        type: 'shadowed-lorebook-keyword',
        severity: 'warning',
        elementType: 'lorebook',
        elementName: sorted[index]!.name,
        message: `Lorebook entry "${sorted[index]!.name}" keyword "${keyword}" is shadowed by "${sorted[0]!.name}".`,
      });
    }
  }

  for (const entry of context.lorebookEntries) {
    if (!entry.enabled || entry.constant) continue;
    if (entry.selective && (entry.secondaryKeys?.length ?? 0) === 0) {
      findings.push({
        type: 'unreachable-lorebook-entry',
        severity: 'warning',
        elementType: 'lorebook',
        elementName: entry.name,
        message: `Lorebook entry "${entry.name}" is selective but has no secondary keys.`,
      });
    }
  }

  for (const script of context.regexScripts) {
    if (script.in !== '' && script.in === script.out) {
      findings.push({
        type: 'no-effect-regex',
        severity: 'info',
        elementType: 'regex',
        elementName: script.name,
        message: `Regex "${script.name}" has identical in/out patterns.`,
      });
    }
  }

  const byType: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const finding of findings) {
    byType[finding.type] = (byType[finding.type] ?? 0) + 1;
    bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }

  return {
    findings,
    summary: {
      totalFindings: findings.length,
      byType,
      bySeverity,
    },
  };
}
