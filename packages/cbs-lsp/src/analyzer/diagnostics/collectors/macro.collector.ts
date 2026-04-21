/**
 * macro call diagnostics 수집기.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/collectors/macro.collector.ts
 */

import { type CBSBuiltinFunction, type DiagnosticInfo, type MacroCallNode } from 'risu-workbench-core';

import type { DiagnosticsContext } from '../context';
import {
  findShorterAlias,
  formatBuiltinDiagnosticTarget,
  formatExpectedArgumentCount,
  normalizeBuiltinLookupKey,
} from '../builtin-helpers';
import { collectCalcExpressionArgumentDiagnostics } from '../calc-expression-diagnostics';
import { createDiagnosticInfo } from '../diagnostic-info';
import {
  createDiagnosticFixExplanation,
  createReplacementQuickFix,
} from '../quick-fix';
import { DiagnosticCode } from '../taxonomy';

/**
 * collectMacroDiagnostics 함수.
 * registry metadata 기반 macro call diagnostics를 수집함.
 *
 * @param context - diagnostics 실행 문맥
 * @param node - 검사할 macro call 노드
 * @returns macro 관련 diagnostics 목록
 */
export function collectMacroDiagnostics(
  context: DiagnosticsContext,
  node: MacroCallNode,
): DiagnosticInfo[] {
  const builtin = context.registry.get(node.name);
  if (!builtin) {
    return [];
  }

  const diagnostics: DiagnosticInfo[] = [];

  appendDeprecatedDiagnostic(diagnostics, builtin, node.nameRange);
  appendArgumentDiagnostics(
    diagnostics,
    {
      builtin,
      actualCount: node.arguments.length,
      range: node.nameRange,
      diagnosticTarget: formatBuiltinDiagnosticTarget(builtin),
    },
  );

  if (context.hasSourceText && normalizeBuiltinLookupKey(builtin.name) === 'calc') {
    diagnostics.push(...collectCalcExpressionArgumentDiagnostics(node, context.sourceText));
  }

  appendAliasAvailabilityDiagnostic(diagnostics, node.name, node.nameRange, builtin);

  return diagnostics;
}

function appendDeprecatedDiagnostic(
  diagnostics: DiagnosticInfo[],
  builtin: CBSBuiltinFunction,
  range: MacroCallNode['nameRange'],
): void {
  if (!builtin.deprecated) {
    return;
  }

  diagnostics.push(
    createDiagnosticInfo(
      DiagnosticCode.DeprecatedFunction,
      range,
      builtin.deprecated.message,
      undefined,
      builtin.deprecated.replacement
        ? {
            fixes: [
              createReplacementQuickFix(
                `Replace with ${JSON.stringify(builtin.deprecated.replacement)}`,
                builtin.deprecated.replacement,
                createDiagnosticFixExplanation(
                  `registry-deprecated:${normalizeBuiltinLookupKey(builtin.name)}:${builtin.deprecated.replacement}`,
                  `Registry deprecation metadata marks ${builtin.name} as replaceable with ${builtin.deprecated.replacement}.`,
                ),
              ),
            ],
          }
        : undefined,
    ),
  );
}

function appendArgumentDiagnostics(
  diagnostics: DiagnosticInfo[],
  options: {
    diagnosticTarget: string;
    range: MacroCallNode['nameRange'];
    actualCount: number;
    builtin: CBSBuiltinFunction;
  },
): void {
  const { actualCount, builtin, diagnosticTarget, range } = options;
  const requiredArguments = builtin.arguments.filter((argument) => argument.required);
  const maxCount = builtin.arguments.some((argument) => argument.variadic)
    ? Number.POSITIVE_INFINITY
    : builtin.arguments.length;

  if (actualCount < requiredArguments.length) {
    const missingArgument = requiredArguments[actualCount];
    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.MissingRequiredArgument,
        range,
        missingArgument
          ? `${diagnosticTarget} is missing required argument ${JSON.stringify(missingArgument.name)}`
          : `${diagnosticTarget} is missing required arguments`,
      ),
    );
    return;
  }

  if (actualCount > maxCount) {
    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.WrongArgumentCount,
        range,
        `${diagnosticTarget} expects ${formatExpectedArgumentCount(builtin.arguments)}, but received ${actualCount}`,
      ),
    );
  }
}

function appendAliasAvailabilityDiagnostic(
  diagnostics: DiagnosticInfo[],
  usedName: string,
  range: MacroCallNode['nameRange'],
  builtin: CBSBuiltinFunction,
): void {
  const preferredAlias = findShorterAlias(usedName, builtin);
  if (!preferredAlias) {
    return;
  }

  diagnostics.push(
    createDiagnosticInfo(
      DiagnosticCode.AliasAvailable,
      range,
      `CBS alias ${JSON.stringify(preferredAlias)} is available for ${JSON.stringify(usedName)}`,
      undefined,
      {
        fixes: [
          createReplacementQuickFix(
            `Replace with shorter alias ${JSON.stringify(preferredAlias)}`,
            preferredAlias,
            createDiagnosticFixExplanation(
              `registry-alias:${normalizeBuiltinLookupKey(usedName)}:${preferredAlias}:${normalizeBuiltinLookupKey(builtin.name)}`,
              `Builtin alias metadata exposes ${preferredAlias} as a shorter canonical alias for ${usedName}.`,
            ),
          ),
        ],
      },
    ),
  );
}
