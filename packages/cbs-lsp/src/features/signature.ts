import {
  type CancellationToken,
  ParameterInformation,
  SignatureInformation,
  SignatureHelp,
  SignatureHelpParams,
} from 'vscode-languageserver/node';
import { generateDocumentation, TokenType } from 'risu-workbench-core';
import type {
  BlockKind,
  CBSBuiltinFunction,
  CBSBuiltinRegistry,
  MacroCallNode,
  Position,
  Range,
  Token,
} from 'risu-workbench-core';

import {
  createSyntheticDocumentVersion,
  fragmentAnalysisService,
  getCalcExpressionSublanguageDocumentation,
  getCalcExpressionZone,
  resolveActiveLocalFunctionContext,
  type LocalFunctionDeclaration,
  type FragmentAnalysisVersion,
  type FragmentAnalysisService,
} from '../core';
import { isRequestCancelled } from '../request-cancellation';
import { positionToOffset } from '../utils/position';

export interface SignatureHelpDocumentContext {
  filePath: string;
  text: string;
  uri?: string;
  version?: FragmentAnalysisVersion;
}

type SignatureAnalysisService = Pick<FragmentAnalysisService, 'locatePosition'>;

const BLOCK_BUILTIN_NAMES: Record<BlockKind, string> = {
  when: '#when',
  each: '#each',
  if: '#if',
  if_pure: '#ifpure',
  escape: '#escape',
  puredisplay: '#puredisplay',
  pure: '#pure',
  func: '#func',
};

function rangeContainsToken(range: Range, token: Token): boolean {
  const startsAfterRange =
    token.range.start.line > range.end.line ||
    (token.range.start.line === range.end.line &&
      token.range.start.character >= range.end.character);
  const endsBeforeRange =
    token.range.end.line < range.start.line ||
    (token.range.end.line === range.start.line &&
      token.range.end.character <= range.start.character);

  return !startsAfterRange && !endsBeforeRange;
}

function countCompletedTopLevelSeparators(
  tokens: readonly Token[],
  ownerRange: Range,
  cursorOffset: number,
  content: string,
): number {
  let depth = 0;
  let completedSeparators = 0;

  for (const token of tokens) {
    if (token.type === TokenType.EOF || !rangeContainsToken(ownerRange, token)) {
      continue;
    }

    if (token.type === TokenType.OpenBrace) {
      depth += 1;
      continue;
    }

    if (token.type === TokenType.CloseBrace) {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (token.type !== TokenType.ArgumentSeparator || depth !== 1) {
      continue;
    }

    if (positionToOffset(content, token.range.end) <= cursorOffset) {
      completedSeparators += 1;
    }
  }

  return completedSeparators;
}

function resolveBlockBuiltinName(kind: BlockKind): string {
  return BLOCK_BUILTIN_NAMES[kind];
}

function formatBlockParameterLabel(parameter: CBSBuiltinFunction['arguments'][number]): string {
  const prefix = parameter.variadic ? '...' : '';
  const suffix = parameter.required ? '' : '?';
  return `${prefix}${parameter.name}${suffix}`;
}

function buildParameterInfos(
  builtin: CBSBuiltinFunction,
  signatureLabel: string,
): ParameterInformation[] {
  let searchFrom = 0;

  return builtin.arguments.map((parameter) => {
    const displayLabel = builtin.isBlock ? formatBlockParameterLabel(parameter) : parameter.name;
    const start = signatureLabel.indexOf(displayLabel, searchFrom);

    if (start >= 0) {
      searchFrom = start + displayLabel.length;
      return {
        label: [start, start + displayLabel.length],
        documentation: parameter.description,
      };
    }

    return {
      label: parameter.name,
      documentation: parameter.description,
    };
  });
}

function clampActiveParameter(activeParameter: number, builtin: CBSBuiltinFunction): number {
  if (builtin.arguments.length === 0) {
    return 0;
  }

  const lastParameterIndex = builtin.arguments.length - 1;
  const lastParameter = builtin.arguments[lastParameterIndex];
  if (lastParameter?.variadic) {
    return Math.min(Math.max(activeParameter, 0), lastParameterIndex);
  }

  return Math.min(Math.max(activeParameter, 0), lastParameterIndex);
}

function createSignatureInformation(builtin: CBSBuiltinFunction): SignatureInformation {
  const documentation = generateDocumentation(builtin);

  return {
    label: documentation.signature,
    documentation: builtin.description,
    parameters: buildParameterInfos(builtin, documentation.signature),
  };
}

/**
 * createNamedParameterInformation 함수.
 * label substring 매칭 없이 문자열 label 기반 parameter information을 만듦.
 *
 * @param label - 시그니처에서 보여줄 파라미터 라벨
 * @param documentation - 파라미터 의미 설명
 * @returns 문자열 label 기반 parameter information
 */
function createNamedParameterInformation(
  label: string,
  documentation: string,
): ParameterInformation {
  return {
    label,
    documentation,
  };
}

function formatRangeStart(range: Range): string {
  return `line ${range.start.line + 1}, character ${range.start.character + 1}`;
}

/**
 * createLocalCallSignatureInformation 함수.
 * `{{call::funcName::...}}` 문맥을 위한 로컬 함수 호출 시그니처를 만듦.
 *
 * @param declaration - 현재 call macro가 가리키는 로컬 함수 선언 정보
 * @returns 로컬 call macro용 signature information
 */
function createLocalCallSignatureInformation(
  declaration: LocalFunctionDeclaration,
): SignatureInformation {
  const parameterLabels = [declaration.name, ...declaration.parameters];
  const label = `call::${parameterLabels.join('::')}`;

  return {
    label,
    documentation: [
      `Local function call for fragment-local \`#func ${declaration.name}\` declared at ${formatRangeStart(declaration.range)}.`,
      'The first slot selects the local function name, and the remaining slots feed `arg::N` references inside the function body.',
    ].join(' '),
    parameters: [
      createNamedParameterInformation(
        declaration.name,
        `Local function name slot. Resolves to fragment-local \`#func ${declaration.name}\` declared at ${formatRangeStart(declaration.range)}.`,
      ),
      ...declaration.parameters.map((parameter, index) => {
        const parameterDeclaration = declaration.parameterDeclarations[index];
        return createNamedParameterInformation(
          parameter,
          parameterDeclaration
            ? `Call argument slot ${index} feeds local parameter \`${parameterDeclaration.name}\` declared at ${formatRangeStart(parameterDeclaration.range)}. The function body can read it via \`arg::${index}\`.`
            : `Call argument slot ${index} feeds local parameter \`${parameter}\`. The function body can read it via \`arg::${index}\`.`,
        );
      }),
    ],
  };
}

/**
 * createCalcExpressionSignatureInformation 함수.
 * `{{? ...}}`와 `{{calc::...}}`가 공유하는 calc expression 전용 시그니처를 만듦.
 *
 * @returns calc expression sublanguage 전용 signature information
 */
function createCalcExpressionSignatureInformation(): SignatureInformation {
  const calcDocumentation = getCalcExpressionSublanguageDocumentation();

  return {
    label: '{{? expression}} / {{calc::expression}}',
    documentation: calcDocumentation.summary,
    parameters: [
      createNamedParameterInformation(
        'expression',
        [
          calcDocumentation.summary,
          calcDocumentation.variables,
          calcDocumentation.operators,
          calcDocumentation.coercion,
        ].join(' '),
      ),
    ],
  };
}

/**
 * createEachBlockHeaderSignatureInformation 함수.
 * `#each` block header 문맥 전용 시그니처를 만듦.
 *
 * @returns `#each` block header 의미를 설명하는 signature information
 */
function createEachBlockHeaderSignatureInformation(): SignatureInformation {
  return {
    label: '#each iteratorExpression as alias',
    documentation: [
      'Block header for fragment-local iteration.',
      '`iteratorExpression` resolves the list or array source for the loop, and `alias` becomes the loop binding referenced through `slot::alias` inside the block body.',
    ].join(' '),
    parameters: [
      createNamedParameterInformation(
        'iteratorExpression',
        'List or array expression consumed by the current `#each` block. Optional operators such as `keep` still belong to this iterator segment.',
      ),
      createNamedParameterInformation(
        'alias',
        'Loop binding name introduced by `as`. Inside the block body, `slot::alias` reads the current iterated item.',
      ),
    ],
  };
}

/**
 * createFuncBlockHeaderSignatureInformation 함수.
 * `#func` block header 문맥 전용 시그니처를 만듦.
 *
 * @param declaration - 현재 헤더에서 읽어낸 로컬 함수 선언 정보
 * @returns `#func` header 의미를 설명하는 signature information
 */
function createFuncBlockHeaderSignatureInformation(
  declaration: Pick<LocalFunctionDeclaration, 'name' | 'parameters'> | null,
): SignatureInformation {
  const declaredParameters = declaration?.parameters ?? [];
  const declaredSummary =
    declaration && declaredParameters.length > 0
      ? ` Current header slots: ${declaredParameters
          .map((parameter, index) => `\`arg::${index}\` → \`${parameter}\``)
          .join(', ')}.`
      : declaration
        ? ' Current header has no declared local parameters yet.'
        : '';

  return {
    label: '#func functionName ...parameters',
    documentation: [
      'Block header that declares a fragment-local function callable through `{{call::functionName::...}}`.',
      'The first slot declares the local function name. Each following space-separated token declares a local parameter exposed inside the body as `arg::0`, `arg::1`, and so on.',
      declaredSummary,
    ].join(''),
    parameters: [
      createNamedParameterInformation(
        'functionName',
        'Fragment-local function name. `{{call::functionName::...}}` resolves this slot to select which `#func` block to invoke.',
      ),
      createNamedParameterInformation(
        '...parameters',
        'Space-separated local parameter names. The first declared name maps to `arg::0`, the next to `arg::1`, and so on inside the `#func` body.',
      ),
    ],
  };
}

/**
 * clampExplicitParameterIndex 함수.
 * 명시적으로 계산한 파라미터 개수에 맞춰 active parameter를 제한함.
 *
 * @param activeParameter - 계산된 0-based 파라미터 인덱스
 * @param parameterCount - 시그니처에 노출한 총 파라미터 수
 * @returns 안전하게 보정된 active parameter 인덱스
 */
function clampExplicitParameterIndex(activeParameter: number, parameterCount: number): number {
  if (parameterCount <= 0) {
    return 0;
  }

  return Math.min(Math.max(activeParameter, 0), parameterCount - 1);
}

function createAnalysisRequest(
  params: SignatureHelpParams,
  context: SignatureHelpDocumentContext,
): {
  filePath: string;
  text: string;
  uri: string;
  version: FragmentAnalysisVersion;
} {
  return {
    filePath: context.filePath,
    text: context.text,
    uri: context.uri ?? params.textDocument.uri,
    version: context.version ?? createSyntheticDocumentVersion(context.text),
  };
}

function resolveBuiltinForPosition(
  registry: CBSBuiltinRegistry,
  nodeSpan: { owner: unknown; category: string } | null,
): CBSBuiltinFunction | null {
  if (!nodeSpan) {
    return null;
  }

  if (
    (nodeSpan.category === 'macro-name' ||
      nodeSpan.category === 'argument' ||
      nodeSpan.category === 'node-range') &&
    typeof nodeSpan.owner === 'object' &&
    nodeSpan.owner !== null &&
    'type' in nodeSpan.owner &&
    nodeSpan.owner.type === 'MacroCall' &&
    'name' in nodeSpan.owner
  ) {
    return registry.get((nodeSpan.owner as MacroCallNode).name) ?? null;
  }

  if (
    nodeSpan.category === 'block-header' &&
    typeof nodeSpan.owner === 'object' &&
    nodeSpan.owner !== null &&
    'type' in nodeSpan.owner &&
    nodeSpan.owner.type === 'Block' &&
    'kind' in nodeSpan.owner
  ) {
    return registry.get(resolveBlockBuiltinName(nodeSpan.owner.kind as BlockKind)) ?? null;
  }

  return null;
}

function resolveOwnerHeaderRange(
  nodeSpan: { owner: unknown; category: string } | null,
): Range | null {
  if (!nodeSpan) {
    return null;
  }

  if (
    typeof nodeSpan.owner === 'object' &&
    nodeSpan.owner !== null &&
    'type' in nodeSpan.owner &&
    nodeSpan.owner.type === 'MacroCall' &&
    'range' in nodeSpan.owner
  ) {
    return nodeSpan.owner.range as Range;
  }

  if (
    nodeSpan.category === 'block-header' &&
    typeof nodeSpan.owner === 'object' &&
    nodeSpan.owner !== null &&
    'type' in nodeSpan.owner &&
    nodeSpan.owner.type === 'Block' &&
    'openRange' in nodeSpan.owner
  ) {
    return nodeSpan.owner.openRange as Range;
  }

  return null;
}

/**
 * parseLocalFunctionHeaderDeclaration 함수.
 * `#func` block header 텍스트에서 함수 이름과 파라미터 목록을 읽어냄.
 *
 * @param headerRange - 현재 block header range
 * @param content - fragment 원문 텍스트
 * @returns 헤더에서 읽은 로컬 함수 선언 정보, 해석할 수 없으면 null
 */
function parseLocalFunctionHeaderDeclaration(
  headerRange: Range,
  content: string,
): LocalFunctionDeclaration | null {
  const headerStart = positionToOffset(content, headerRange.start);
  const headerEnd = positionToOffset(content, headerRange.end);
  const headerText = content.slice(headerStart, headerEnd);
  const match = headerText.match(/^\{\{#func\s+([^\s}]+)(?:\s+([^}]+?))?\}\}$/u);
  if (!match?.[1]) {
    return null;
  }

  const name = match[1];
  const rawParameterText = match[2]?.trim() ?? '';
  const parameters = rawParameterText.length > 0 ? rawParameterText.split(/\s+/u) : [];

  return {
    name,
    range: headerRange,
    parameters,
    parameterDeclarations: [],
  };
}

/**
 * resolveEachHeaderActiveParameter 함수.
 * `#each iteratorExpression as alias` 헤더에서 현재 커서가 iterator/alias 중 어디에 있는지 계산함.
 *
 * @param ownerRange - `#each` block open range
 * @param cursorOffset - fragment-local cursor offset
 * @param content - fragment 원문 텍스트
 * @returns 0-based active parameter index
 */
function resolveEachHeaderActiveParameter(
  ownerRange: Range,
  cursorOffset: number,
  content: string,
): number {
  const headerStart = positionToOffset(content, ownerRange.start);
  const headerEnd = positionToOffset(content, ownerRange.end);
  const headerText = content.slice(headerStart, headerEnd);
  const relativeCursor = Math.max(0, Math.min(cursorOffset - headerStart, headerText.length));
  const aliasMarker = headerText.indexOf(' as ');

  if (aliasMarker < 0) {
    return 0;
  }

  return relativeCursor >= aliasMarker + ' as '.length ? 1 : 0;
}

/**
 * resolveFuncHeaderActiveParameter 함수.
 * `#func` block header에서 함수 이름 슬롯인지, 파라미터 슬롯인지 계산함.
 *
 * @param ownerRange - `#func` block open range
 * @param cursorOffset - fragment-local cursor offset
 * @param content - fragment 원문 텍스트
 * @returns 0-based active parameter index
 */
function resolveFuncHeaderActiveParameter(
  ownerRange: Range,
  cursorOffset: number,
  content: string,
): number {
  const headerStart = positionToOffset(content, ownerRange.start);
  const headerEnd = positionToOffset(content, ownerRange.end);
  const headerText = content.slice(headerStart, headerEnd);
  const relativeCursor = Math.max(0, Math.min(cursorOffset - headerStart, headerText.length));
  const nameAndParams = headerText.match(/^\{\{#func\s+(.+?)\}\}$/u)?.[1] ?? '';
  const tokens = Array.from(nameAndParams.matchAll(/\S+/gu));
  if (tokens.length === 0) {
    return 0;
  }

  const firstParameter = tokens[1];
  if (!firstParameter) {
    return 0;
  }

  return relativeCursor >= (firstParameter.index ?? 0) + '#func '.length ? 1 : 0;
}

/**
 * resolveCustomBlockHeaderSignatureHelp 함수.
 * `#each` / `#func` block header 전용 signature help를 계산함.
 *
 * @param nodeSpan - locator가 계산한 현재 node span
 * @param cursorOffset - fragment-local cursor offset
 * @param content - fragment 원문 텍스트
 * @returns 문맥 전용 signature help 정보, 없으면 null
 */
function resolveCustomBlockHeaderSignatureHelp(
  nodeSpan: { owner: unknown; category: string } | null,
  cursorOffset: number,
  content: string,
): { signature: SignatureInformation; activeParameter: number } | null {
  if (
    nodeSpan?.category !== 'block-header' ||
    typeof nodeSpan.owner !== 'object' ||
    nodeSpan.owner === null ||
    !('type' in nodeSpan.owner) ||
    nodeSpan.owner.type !== 'Block' ||
    !('kind' in nodeSpan.owner) ||
    !('openRange' in nodeSpan.owner)
  ) {
    return null;
  }

  const ownerRange = nodeSpan.owner.openRange as Range;
  const kind = nodeSpan.owner.kind as BlockKind;
  if (kind === 'each') {
    return {
      signature: createEachBlockHeaderSignatureInformation(),
      activeParameter: resolveEachHeaderActiveParameter(ownerRange, cursorOffset, content),
    };
  }

  if (kind === 'func') {
    const declaration = parseLocalFunctionHeaderDeclaration(ownerRange, content);
    return {
      signature: createFuncBlockHeaderSignatureInformation(declaration),
      activeParameter: resolveFuncHeaderActiveParameter(ownerRange, cursorOffset, content),
    };
  }

  return null;
}

export class SignatureHelpProvider {
  constructor(
    private registry: CBSBuiltinRegistry,
    private analysisService: SignatureAnalysisService = fragmentAnalysisService,
  ) {}

  provide(
    params: SignatureHelpParams,
    context?: SignatureHelpDocumentContext,
    cancellationToken?: CancellationToken,
  ): SignatureHelp | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    if (!context) {
      return null;
    }

    const request = createAnalysisRequest(params, context);
    const lookup = this.analysisService.locatePosition(
      request,
      params.position as Position,
      cancellationToken,
    );
    if (!lookup) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const customBlockHeaderSignature = resolveCustomBlockHeaderSignatureHelp(
      lookup.nodeSpan,
      lookup.fragmentLocalOffset,
      lookup.fragment.content,
    );
    if (customBlockHeaderSignature) {
      return {
        signatures: [customBlockHeaderSignature.signature],
        activeSignature: 0,
        activeParameter: clampExplicitParameterIndex(
          customBlockHeaderSignature.activeParameter,
          customBlockHeaderSignature.signature.parameters?.length ?? 0,
        ),
      };
    }

    const calcExpressionZone = getCalcExpressionZone(lookup);
    if (calcExpressionZone) {
      return {
        signatures: [createCalcExpressionSignatureInformation()],
        activeSignature: 0,
        activeParameter: 0,
      };
    }

    const activeLocalFunctionContext = resolveActiveLocalFunctionContext(lookup);
    if (activeLocalFunctionContext?.source === 'call-macro') {
      const ownerRange = resolveOwnerHeaderRange(lookup.nodeSpan);
      if (!ownerRange) {
        return null;
      }

      const signature = createLocalCallSignatureInformation(activeLocalFunctionContext.declaration);
      const completedSeparators = countCompletedTopLevelSeparators(
        lookup.fragmentAnalysis.tokens,
        ownerRange,
        lookup.fragmentLocalOffset,
        lookup.fragment.content,
      );
      const rawActiveParameter = Math.max(0, completedSeparators - 1);

      return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: clampExplicitParameterIndex(
          rawActiveParameter,
          activeLocalFunctionContext.declaration.parameters.length + 1,
        ),
      };
    }

    const builtin = resolveBuiltinForPosition(this.registry, lookup.nodeSpan);
    const ownerRange = resolveOwnerHeaderRange(lookup.nodeSpan);
    if (!builtin || !ownerRange) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const completedSeparators = countCompletedTopLevelSeparators(
      lookup.fragmentAnalysis.tokens,
      ownerRange,
      lookup.fragmentLocalOffset,
      lookup.fragment.content,
    );
    const rawActiveParameter = Math.max(0, completedSeparators - 1);
    const signature = createSignatureInformation(builtin);

    return {
      signatures: [signature],
      activeSignature: 0,
      activeParameter: clampActiveParameter(rawActiveParameter, builtin),
    };
  }
}
