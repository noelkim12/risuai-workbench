/**
 * legacy angle-bracket syntax diagnostics 수집기.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/collectors/legacy-angle.collector.ts
 */

import { TokenType, type DiagnosticInfo } from 'risu-workbench-core';

import type { DiagnosticsContext } from '../context';
import { createDiagnosticInfo } from '../diagnostic-info';
import {
  createDiagnosticFixExplanation,
  createReplacementQuickFix,
} from '../quick-fix';
import { DiagnosticCode } from '../taxonomy';

/**
 * collectLegacyAngleBracketDiagnostics 함수.
 * 재토크나이즈한 token stream에서 `<foo>` legacy macro를 찾아 migration diagnostic을 생성함.
 *
 * @param context - diagnostics 실행 문맥
 * @returns legacy syntax diagnostics 목록
 */
export function collectLegacyAngleBracketDiagnostics(
  context: DiagnosticsContext,
): DiagnosticInfo[] {
  return context.tokens
    .filter((token) => token.type === TokenType.AngleBracketMacro)
    .map((token) =>
      createDiagnosticInfo(
        DiagnosticCode.LegacyAngleBracket,
        token.range,
        `Legacy angle-bracket macro <${token.value}> should be migrated to {{${token.value}}}`,
        undefined,
        {
          fixes: [
            createReplacementQuickFix(
              `Migrate to {{${token.value}}}`,
              `{{${token.value}}}`,
              createDiagnosticFixExplanation(
                `syntax-migration:angle-bracket:{{${token.value}}}`,
                'Legacy angle-bracket syntax can be migrated directly to the equivalent double-brace CBS macro.',
              ),
            ),
          ],
        },
      ),
    );
}
