/**
 * suggest_tests tool handler.
 * Suggest focused tests for a planned path change (MVP stub).
 * @file packages/risuai-workbench-mcp/src/tools/suggest-tests.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope, type WorkbenchDiagnostic } from '../contracts/diagnostics';

export interface SuggestTestsInput {
  path: string;
}

/**
 * handleSuggestTests 함수.
 * 변경 path 기반으로 focused test 후보를 추천함. MVP에서는 기본 stub 응답을 반환함.
 *
 * @param input - 변경 대상 workspace-relative path
 * @returns diagnostic envelope에 감싸진 test 추천 결과
 */
export async function handleSuggestTests(
  input: SuggestTestsInput,
): Promise<DiagnosticEnvelope> {
  const diagnostics: WorkbenchDiagnostic[] = [];

  if (!input.path || input.path.trim().length === 0) {
    diagnostics.push({
      category: 'suggest-tests',
      id: 'EMPTY_PATH',
      message: 'Path must not be empty.',
      path: null,
      ruleId: 'suggest-tests.empty-path',
      severity: 'warning',
    });
    return createDiagnosticEnvelope({
      diagnostics,
      status: 'domain_warning',
      tool: 'workbench.suggest_tests',
    });
  }

  diagnostics.push({
    category: 'suggest-tests',
    id: 'SUGGEST_TESTS_STUB',
    message: `Test suggestion is not yet fully implemented. Path: "${input.path}"`,
    path: input.path,
    ruleId: 'suggest-tests.stub',
    severity: 'info',
  });

  return createDiagnosticEnvelope({
    diagnostics,
    status: 'ok',
    tool: 'workbench.suggest_tests',
  });
}
