/**
 * diagnostics taxonomy와 rule metadata 정의 모음.
 * @file packages/cbs-lsp/src/analyzer/diagnostics/taxonomy.ts
 */

import type { DiagnosticInfo } from 'risu-workbench-core';

import {
  CALC_EXPRESSION_SUBLANGUAGE_LABEL,
} from '../../core/calc-expression';
import {
  createAgentMetadataExplanation,
  type AgentMetadataExplanationContract,
} from '../../contracts/agent-metadata';

/**
 * DiagnosticCode enum.
 * CBS diagnostics가 LSP와 agent metadata에서 공유하는 안정 diagnostic code 집합.
 */
export enum DiagnosticCode {
  UnclosedMacro = 'CBS001',
  UnclosedBlock = 'CBS002',
  UnknownFunction = 'CBS003',
  WrongArgumentCount = 'CBS004',
  MissingRequiredArgument = 'CBS005',
  InvalidBlockNesting = 'CBS006',
  CallStackExceeded = 'CBS007',
  CalcExpressionEmpty = 'CBS008',
  CalcExpressionUnbalancedParentheses = 'CBS009',
  CalcExpressionOperatorSequence = 'CBS010',
  CalcExpressionUnsupportedToken = 'CBS011',
  CalcExpressionIncompleteReferenceToken = 'CBS012',
  CalcExpressionInvalidReferenceIdentifier = 'CBS013',
  DeprecatedFunction = 'CBS100',
  UndefinedVariable = 'CBS101',
  UnusedVariable = 'CBS102',
  EmptyBlock = 'CBS103',
  LegacyAngleBracket = 'CBS104',
  AliasAvailable = 'CBS200',
}

/** diagnostics를 발행한 pipeline 단계. */
export type DiagnosticOwner = 'tokenizer' | 'parser' | 'analyzer';

/** diagnostics rule을 agent가 읽을 수 있게 묶는 상위 category. */
export type DiagnosticRuleCategory =
  | 'syntax'
  | 'expression'
  | 'symbol'
  | 'compatibility'
  | 'quality';

/**
 * DiagnosticRuleMetadata 인터페이스.
 * diagnostic code 한 건의 owner, severity, 의미, agent explanation을 정의함.
 */
export interface DiagnosticRuleMetadata {
  category: DiagnosticRuleCategory;
  code: DiagnosticCode;
  explanation?: AgentMetadataExplanationContract;
  owner: DiagnosticOwner;
  severity: DiagnosticInfo['severity'];
  meaning: string;
}

/**
 * DiagnosticDefinition 인터페이스.
 * taxonomy table에 저장되는 최종 diagnostic rule 정의.
 */
export interface DiagnosticDefinition extends DiagnosticRuleMetadata {}

/**
 * createDiagnosticRuleExplanation 함수.
 * diagnostic taxonomy rule metadata용 explanation contract를 생성함.
 *
 * @param owner - 진단을 발행한 tokenizer/parser/analyzer 단계
 * @param category - 진단 taxonomy category 이름
 * @returns agent-friendly diagnostic rule explanation metadata
 */
export function createDiagnosticRuleExplanation(
  owner: DiagnosticOwner,
  category: DiagnosticRuleCategory,
): AgentMetadataExplanationContract {
  return createAgentMetadataExplanation(
    'diagnostic-taxonomy',
    `diagnostic-taxonomy:${owner}:${category}`,
    `Diagnostic taxonomy metadata from the ${owner} stage for the ${category} rule category.`,
  );
}

/**
 * CBS diagnostic code별 taxonomy metadata.
 * severity와 owner를 한 곳에 고정해 collector와 agent-facing envelope이 같은 의미를 쓰게 함.
 */
export const DIAGNOSTIC_TAXONOMY: Readonly<Record<DiagnosticCode, DiagnosticDefinition>> = {
  [DiagnosticCode.UnclosedMacro]: {
    category: 'syntax',
    code: DiagnosticCode.UnclosedMacro,
    severity: 'error',
    owner: 'tokenizer',
    meaning: 'Unclosed CBS macro ({{ without matching }})',
  },
  [DiagnosticCode.UnclosedBlock]: {
    category: 'syntax',
    code: DiagnosticCode.UnclosedBlock,
    severity: 'error',
    owner: 'parser',
    meaning: 'Unclosed CBS block (missing matching block close)',
  },
  [DiagnosticCode.UnknownFunction]: {
    category: 'syntax',
    code: DiagnosticCode.UnknownFunction,
    severity: 'error',
    owner: 'parser',
    meaning: 'Unknown CBS function or block keyword',
  },
  [DiagnosticCode.WrongArgumentCount]: {
    category: 'symbol',
    code: DiagnosticCode.WrongArgumentCount,
    severity: 'error',
    owner: 'analyzer',
    meaning: 'Wrong number of CBS arguments',
  },
  [DiagnosticCode.MissingRequiredArgument]: {
    category: 'quality',
    code: DiagnosticCode.MissingRequiredArgument,
    severity: 'error',
    owner: 'analyzer',
    meaning: 'Missing required CBS argument',
  },
  [DiagnosticCode.InvalidBlockNesting]: {
    category: 'syntax',
    code: DiagnosticCode.InvalidBlockNesting,
    severity: 'error',
    owner: 'parser',
    meaning: 'Invalid CBS block nesting or misplaced :else',
  },
  [DiagnosticCode.CallStackExceeded]: {
    category: 'syntax',
    code: DiagnosticCode.CallStackExceeded,
    severity: 'error',
    owner: 'parser',
    meaning: 'CBS nesting depth exceeds parser limit',
  },
  [DiagnosticCode.CalcExpressionEmpty]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionEmpty,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} is empty`,
  },
  [DiagnosticCode.CalcExpressionUnbalancedParentheses]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionUnbalancedParentheses,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has unbalanced parentheses`,
  },
  [DiagnosticCode.CalcExpressionOperatorSequence]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionOperatorSequence,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} has an invalid operator sequence`,
  },
  [DiagnosticCode.CalcExpressionUnsupportedToken]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionUnsupportedToken,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an unsupported token`,
  },
  [DiagnosticCode.CalcExpressionIncompleteReferenceToken]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionIncompleteReferenceToken,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an incomplete variable reference token`,
  },
  [DiagnosticCode.CalcExpressionInvalidReferenceIdentifier]: {
    category: 'expression',
    code: DiagnosticCode.CalcExpressionInvalidReferenceIdentifier,
    severity: 'error',
    owner: 'analyzer',
    meaning: `${CALC_EXPRESSION_SUBLANGUAGE_LABEL} contains an invalid variable reference identifier`,
  },
  [DiagnosticCode.DeprecatedFunction]: {
    category: 'compatibility',
    code: DiagnosticCode.DeprecatedFunction,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Deprecated CBS function or block',
  },
  [DiagnosticCode.UndefinedVariable]: {
    category: 'symbol',
    code: DiagnosticCode.UndefinedVariable,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Reference to undefined CBS variable',
  },
  [DiagnosticCode.UnusedVariable]: {
    category: 'symbol',
    code: DiagnosticCode.UnusedVariable,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Unused CBS variable definition',
  },
  [DiagnosticCode.EmptyBlock]: {
    category: 'quality',
    code: DiagnosticCode.EmptyBlock,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Empty CBS block body',
  },
  [DiagnosticCode.LegacyAngleBracket]: {
    category: 'compatibility',
    code: DiagnosticCode.LegacyAngleBracket,
    severity: 'warning',
    owner: 'analyzer',
    meaning: 'Legacy angle-bracket macro syntax',
  },
  [DiagnosticCode.AliasAvailable]: {
    category: 'quality',
    code: DiagnosticCode.AliasAvailable,
    severity: 'info',
    owner: 'analyzer',
    meaning: 'Shorter CBS alias is available',
  },
};

/**
 * getDiagnosticDefinition 함수.
 * 문자열 code를 taxonomy에 등록된 diagnostic definition으로 해석함.
 *
 * @param code - 조회할 diagnostic code 문자열
 * @returns taxonomy definition, 미등록 code면 undefined
 */
export function getDiagnosticDefinition(code: string): DiagnosticDefinition | undefined {
  if (!Object.values(DiagnosticCode).includes(code as DiagnosticCode)) {
    return undefined;
  }

  return DIAGNOSTIC_TAXONOMY[code as DiagnosticCode];
}
