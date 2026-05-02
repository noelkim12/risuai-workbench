/**
 * block diagnostics 수집기.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/collectors/block.collector.ts
 */

import { type BlockNode, type CBSBuiltinFunction, type DiagnosticInfo } from 'risu-workbench-core';

import type { DiagnosticsContext } from '../context';
import {
  EACH_MODE_OPERATORS,
  extractBlockHeaderInfo,
  extractBlockNameRange,
  extractEachLoopBinding,
  parseBlockHeaderSegments,
  stripLeadingBlockHeaderOperators,
  WHEN_BINARY_OPERATORS,
  WHEN_MODE_OPERATORS,
  WHEN_UNARY_OPERATORS,
} from '../block-header';
import {
  findShorterAlias,
  formatBuiltinDiagnosticTarget,
  formatExpectedArgumentCount,
  hasMeaningfulNodes,
  normalizeBuiltinLookupKey,
} from '../builtin-helpers';
import { createDiagnosticInfo } from '../diagnostic-info';
import {
  createDiagnosticFixExplanation,
  createReplacementQuickFix,
} from '../quick-fix';
import { DiagnosticCode } from '../taxonomy';

/**
 * collectBlockDiagnostics 함수.
 * block builtin/구조/header validation diagnostics를 수집함.
 *
 * @param context - diagnostics 실행 문맥
 * @param node - 검사할 block 노드
 * @returns block 관련 diagnostics 목록
 */
export function collectBlockDiagnostics(
  context: DiagnosticsContext,
  node: BlockNode,
): DiagnosticInfo[] {
  const builtin = context.registry.get(`#${node.kind}`);
  if (!builtin) {
    return [];
  }

  const diagnostics: DiagnosticInfo[] = [];
  const blockNameRange = context.hasSourceText
    ? extractBlockNameRange(node, context.sourceText) ?? node.openRange
    : node.openRange;

  appendDeprecatedDiagnostic(diagnostics, builtin, blockNameRange);
  appendBlockArgumentDiagnostics(diagnostics, node, builtin, context.sourceText);
  appendBlockStructuralDiagnostics(diagnostics, node, builtin, context.sourceText);

  if (context.hasSourceText) {
    appendBlockHeaderDiagnostics(diagnostics, context, node);
  }

  return diagnostics;
}

/**
 * appendDeprecatedDiagnostic 함수.
 * deprecated builtin metadata를 diagnostic 목록에 추가함.
 *
 * @param diagnostics - diagnostic을 누적할 출력 배열
 * @param builtin - deprecation metadata를 확인할 builtin 정의
 * @param range - diagnostic과 quick fix가 가리킬 block 이름 range
 */
function appendDeprecatedDiagnostic(
  diagnostics: DiagnosticInfo[],
  builtin: CBSBuiltinFunction,
  range: BlockNode['openRange'],
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

/**
 * appendBlockArgumentDiagnostics 함수.
 * block condition 유무를 builtin argument contract와 비교함.
 *
 * @param diagnostics - diagnostic을 누적할 출력 배열
 * @param node - argument를 검사할 block 노드
 * @param builtin - 기대 argument contract를 가진 builtin 정의
 * @param sourceText - 의미 있는 condition node 판정에 쓸 fragment 원문
 */
function appendBlockArgumentDiagnostics(
  diagnostics: DiagnosticInfo[],
  node: BlockNode,
  builtin: CBSBuiltinFunction,
  sourceText: string,
): void {
  const actualCount = hasMeaningfulNodes(node.condition, sourceText) ? 1 : 0;
  const diagnosticTarget = formatBuiltinDiagnosticTarget(builtin);
  const requiredArguments = builtin.arguments.filter((argument) => argument.required);
  const maxCount = builtin.arguments.some((argument) => argument.variadic)
    ? Number.POSITIVE_INFINITY
    : builtin.arguments.length;

  if (actualCount < requiredArguments.length) {
    const missingArgument = requiredArguments[actualCount];
    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.MissingRequiredArgument,
        node.openRange,
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
        node.openRange,
        `${diagnosticTarget} expects ${formatExpectedArgumentCount(builtin.arguments)}, but received ${actualCount}`,
      ),
    );
  }
}

/**
 * appendBlockStructuralDiagnostics 함수.
 * body가 비어 있는 block 구조를 diagnostic으로 보고함.
 *
 * @param diagnostics - diagnostic을 누적할 출력 배열
 * @param node - body와 else body를 검사할 block 노드
 * @param builtin - diagnostic target 표시에 쓸 builtin 정의
 * @param sourceText - meaningful node 판정에 쓸 fragment 원문
 */
function appendBlockStructuralDiagnostics(
  diagnostics: DiagnosticInfo[],
  node: BlockNode,
  builtin: CBSBuiltinFunction,
  sourceText: string,
): void {
  if (hasMeaningfulNodes(node.body, sourceText) || hasMeaningfulNodes(node.elseBody, sourceText)) {
    return;
  }

  diagnostics.push(
    createDiagnosticInfo(
      DiagnosticCode.EmptyBlock,
      node.openRange,
      `${formatBuiltinDiagnosticTarget(builtin)} has an empty body`,
    ),
  );
}

/**
 * appendBlockHeaderDiagnostics 함수.
 * source text 기반 block header validation diagnostic을 추가함.
 *
 * @param diagnostics - diagnostic을 누적할 출력 배열
 * @param context - registry와 source text를 제공하는 diagnostics 문맥
 * @param node - header를 검사할 block 노드
 */
function appendBlockHeaderDiagnostics(
  diagnostics: DiagnosticInfo[],
  context: DiagnosticsContext,
  node: BlockNode,
): void {
  const header = extractBlockHeaderInfo(node, context.sourceText);
  if (!header) {
    return;
  }

  const builtin = context.registry.get(header.rawName);
  if (builtin) {
    appendAliasAvailabilityDiagnostic(
      diagnostics,
      header.rawName,
      extractBlockNameRange(node, context.sourceText) ?? node.openRange,
      builtin,
    );
  }

  if (node.kind === 'when') {
    diagnostics.push(...collectWhenOperatorDiagnostics(node, header.tail));
  }

  if (node.kind === 'each') {
    diagnostics.push(...collectEachHeaderDiagnostics(node, header.tail, context.sourceText));
  }
}

/**
 * collectWhenOperatorDiagnostics 함수.
 * `#when` header operator sequence의 operand 누락과 잘못된 operator를 찾음.
 *
 * @param node - diagnostic range를 제공할 `#when` block 노드
 * @param rawTail - block 이름 뒤 raw header tail
 * @returns `#when` operator 관련 diagnostics 목록
 */
function collectWhenOperatorDiagnostics(node: BlockNode, rawTail: string): DiagnosticInfo[] {
  const diagnostics: DiagnosticInfo[] = [];
  const segments = stripLeadingBlockHeaderOperators(
    parseBlockHeaderSegments(rawTail),
    WHEN_MODE_OPERATORS,
  );

  if (segments.length === 0) {
    return diagnostics;
  }

  const [firstSegment, ...rest] = segments;
  const firstOperator = firstSegment.toLowerCase();
  if (WHEN_UNARY_OPERATORS.has(firstOperator)) {
    if (rest.length === 0 || rest[0].trim().length === 0) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.MissingRequiredArgument,
          node.openRange,
          `CBS block ${JSON.stringify('#when')} is missing an operand for operator ${JSON.stringify(firstSegment)}`,
        ),
      );
      return diagnostics;
    }

    if (rest.length > 1) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.UnknownFunction,
          node.openRange,
          `Invalid #when operator sequence after ${JSON.stringify(firstSegment)}`,
        ),
      );
    }

    return diagnostics;
  }

  if (segments.length === 1) {
    return diagnostics;
  }

  for (let index = 1; index < segments.length; index += 2) {
    const operator = segments[index];
    if (!WHEN_BINARY_OPERATORS.has(operator.toLowerCase())) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.UnknownFunction,
          node.openRange,
          `Invalid #when operator ${JSON.stringify(operator)}`,
        ),
      );
      return diagnostics;
    }

    const operand = segments[index + 1];
    if (!operand || operand.trim().length === 0) {
      diagnostics.push(
        createDiagnosticInfo(
          DiagnosticCode.MissingRequiredArgument,
          node.openRange,
          `CBS block ${JSON.stringify('#when')} is missing an operand for operator ${JSON.stringify(operator)}`,
        ),
      );
      return diagnostics;
    }
  }

  if (segments.length % 2 === 0) {
    diagnostics.push(
      createDiagnosticInfo(
        DiagnosticCode.MissingRequiredArgument,
        node.openRange,
        `CBS block ${JSON.stringify('#when')} is missing a trailing condition segment`,
      ),
    );
  }

  return diagnostics;
}

/**
 * collectEachHeaderDiagnostics 함수.
 * `#each` header에서 alias binding 시도와 malformed binding을 검사함.
 *
 * @param node - diagnostic range와 binding range를 제공할 `#each` block 노드
 * @param rawTail - block 이름 뒤 raw header tail
 * @param sourceText - binding range 복원에 쓸 fragment 원문
 * @returns `#each` header 관련 diagnostics 목록
 */
function collectEachHeaderDiagnostics(
  node: BlockNode,
  rawTail: string,
  sourceText: string,
): DiagnosticInfo[] {
  const segments = stripLeadingBlockHeaderOperators(
    parseBlockHeaderSegments(rawTail),
    EACH_MODE_OPERATORS,
  );
  const headerText = segments.join('::').trim();

  if (headerText.length === 0) {
    return [];
  }

  const loopBinding = extractEachLoopBinding(node, sourceText);
  if (loopBinding) {
    return [];
  }

  if (!containsEachAliasKeyword(headerText)) {
    return [];
  }

  return [
    createDiagnosticInfo(
      DiagnosticCode.MissingRequiredArgument,
      node.openRange,
      'CBS block "#each" requires an `as <item>` loop binding',
    ),
  ];
}

/**
 * containsEachAliasKeyword 함수.
 * #each header가 optional `as` alias 구문을 시도했는지 확인함.
 *
 * @param headerText - operator prefix를 제거한 #each header 본문
 * @returns `as` keyword가 standalone token으로 있으면 true
 */
function containsEachAliasKeyword(headerText: string): boolean {
  return /(?:^|\s)as(?:\s|$)/i.test(headerText);
}

/**
 * appendAliasAvailabilityDiagnostic 함수.
 * 더 짧은 builtin alias가 있으면 replacement quick fix diagnostic을 추가함.
 *
 * @param diagnostics - diagnostic을 누적할 출력 배열
 * @param usedName - 사용자가 작성한 block builtin 이름
 * @param range - alias diagnostic과 replacement가 가리킬 range
 * @param builtin - alias metadata를 제공하는 builtin 정의
 */
function appendAliasAvailabilityDiagnostic(
  diagnostics: DiagnosticInfo[],
  usedName: string,
  range: BlockNode['openRange'],
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
