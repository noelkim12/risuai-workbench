/**
 * Diagnostic envelope helpers for domain-level MCP tool results.
 * @file packages/risuai-workbench-mcp/src/contracts/diagnostics.ts
 */

import type { PatchOperation } from './patch-plan';

export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type DiagnosticEnvelopeStatus = 'ok' | 'domain_warning' | 'domain_error' | 'not_implemented';

export interface DiagnosticSuggestedFix {
  kind: PatchOperation['kind'];
  title: string;
  target: string;
  operation: Partial<PatchOperation> & { kind: PatchOperation['kind'] };
}

export interface WorkbenchDiagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category: string;
  message: string;
  path?: string | null;
  ruleId?: string;
  suggestedFixes?: readonly DiagnosticSuggestedFix[];
}

export interface DiagnosticSummary {
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface DiagnosticEnvelope<T = unknown> {
  schema: 'risuai-workbench-mcp.diagnostics';
  schemaVersion: '0.2.0';
  tool: string;
  status: DiagnosticEnvelopeStatus;
  summary: DiagnosticSummary;
  diagnostics: readonly WorkbenchDiagnostic[];
  /** Tool-specific result payload when status is not domain_error. */
  data?: T;
}

export const MUTATION_INPUT_UNKNOWN_FIELD_POLICY = {
  action: 'reject',
  appliesTo: 'mutation-facing inputs',
  reason: 'Mutation tools must fail closed when an agent sends undeclared fields.',
} as const;

/**
 * summarizeDiagnostics 함수.
 * diagnostic severity 개수를 deterministic summary로 집계함.
 *
 * @param diagnostics - 요약할 diagnostic 목록
 * @returns error/warning/info 개수 요약
 */
export function summarizeDiagnostics(diagnostics: readonly WorkbenchDiagnostic[]): DiagnosticSummary {
  return diagnostics.reduce<DiagnosticSummary>(
    (summary, diagnostic) => {
      if (diagnostic.severity === 'error') {
        summary.errorCount += 1;
      } else if (diagnostic.severity === 'warning') {
        summary.warningCount += 1;
      } else {
        summary.infoCount += 1;
      }
      return summary;
    },
    { errorCount: 0, warningCount: 0, infoCount: 0 },
  );
}

/**
 * createDiagnosticEnvelope 함수.
 * domain diagnostic을 transport exception 대신 정상 tool result 형태로 감쌈.
 *
 * @param input - tool 이름, 상태, diagnostic 목록
 * @returns stable diagnostic envelope
 */
export function createDiagnosticEnvelope<T = unknown>(input: {
  tool: string;
  status: DiagnosticEnvelopeStatus;
  diagnostics: readonly WorkbenchDiagnostic[];
  data?: T;
}): DiagnosticEnvelope<T> {
  return {
    data: input.data,
    diagnostics: input.diagnostics,
    schema: 'risuai-workbench-mcp.diagnostics',
    schemaVersion: '0.2.0',
    status: input.status,
    summary: summarizeDiagnostics(input.diagnostics),
    tool: input.tool,
  };
}

/**
 * createNotImplementedDiagnosticEnvelope 함수.
 * roadmap registry 항목의 미구현 상태를 stable diagnostic result로 표현함.
 *
 * @param tool - roadmap tool name
 * @param phaseDescription - proposal phase 설명
 * @returns not_implemented diagnostic envelope
 */
export function createNotImplementedDiagnosticEnvelope(tool: string, phaseDescription: string): DiagnosticEnvelope {
  return createDiagnosticEnvelope({
    diagnostics: [
      {
        category: 'registry',
        id: 'ROADMAP_SURFACE_NOT_IMPLEMENTED',
        message: `${tool} is registered for ${phaseDescription} but is not implemented yet.`,
        path: null,
        ruleId: 'registry.not-implemented',
        severity: 'warning',
      },
    ],
    status: 'not_implemented',
    tool,
  });
}

/**
 * findUnknownFields 함수.
 * mutation input object에서 선언되지 않은 최상위 field를 찾음.
 *
 * @param input - 검사할 입력 값
 * @param allowedKeys - 허용된 최상위 field 목록
 * @returns deterministic unknown field 목록
 */
export function findUnknownFields(input: unknown, allowedKeys: readonly string[]): readonly string[] {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return [];
  }

  const allowed = new Set(allowedKeys);
  return Object.keys(input)
    .filter((key) => !allowed.has(key))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * createUnknownFieldDiagnosticEnvelope 함수.
 * mutation-facing input의 unknown field rejection을 diagnostic result로 반환함.
 *
 * @param input - tool 이름, 입력 값, 허용 field 목록
 * @returns unknown field가 있으면 domain_error, 없으면 ok diagnostic envelope
 */
export function createUnknownFieldDiagnosticEnvelope(input: {
  tool: string;
  input: unknown;
  allowedKeys: readonly string[];
}): DiagnosticEnvelope {
  const unknownFields = findUnknownFields(input.input, input.allowedKeys);
  if (unknownFields.length === 0) {
    return createDiagnosticEnvelope({ diagnostics: [], status: 'ok', tool: input.tool });
  }

  return createDiagnosticEnvelope({
    diagnostics: [
      {
        category: 'input',
        id: 'MUTATION_INPUT_UNKNOWN_FIELD',
        message: `Unknown input fields are rejected: ${unknownFields.join(', ')}.`,
        path: null,
        ruleId: 'input.unknown-field',
        severity: 'error',
      },
    ],
    status: 'domain_error',
    tool: input.tool,
  });
}
