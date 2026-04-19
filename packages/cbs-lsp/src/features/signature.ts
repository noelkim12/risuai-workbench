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
  resolveActiveLocalFunctionContext,
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
 * createLocalFunctionSignatureInformation 함수.
 * 로컬 `#func` 선언을 signature help 형태로 변환함.
 *
 * @param declaration - 현재 활성 로컬 함수 선언 정보
 * @returns 로컬 함수용 signature information
 */
function createLocalFunctionSignatureInformation(declaration: {
  name: string;
  parameters: readonly string[];
}): SignatureInformation {
  const label = `#func ${declaration.name}(${declaration.parameters.join(', ')})`;
  let searchFrom = 0;

  return {
    label,
    documentation: `Local function signature for \`${declaration.name}\` invoked through \`{{call::...}}\`.`,
    parameters: declaration.parameters.map((parameter) => {
      const start = label.indexOf(parameter, searchFrom);
      if (start >= 0) {
        searchFrom = start + parameter.length;
        return {
          label: [start, start + parameter.length],
          documentation: `Argument slot ${declaration.parameters.indexOf(parameter)} for local parameter \`${parameter}\`.`,
        } satisfies ParameterInformation;
      }

      return {
        label: parameter,
        documentation: `Local parameter \`${parameter}\`.`,
      } satisfies ParameterInformation;
    }),
  };
}

/**
 * clampLocalFunctionParameterIndex 함수.
 * 로컬 함수 파라미터 개수에 맞게 active parameter 범위를 제한함.
 *
 * @param activeParameter - 계산된 0-based 파라미터 인덱스
 * @param parameterCount - 로컬 함수 파라미터 수
 * @returns 안전하게 보정된 active parameter 인덱스
 */
function clampLocalFunctionParameterIndex(activeParameter: number, parameterCount: number): number {
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

    const activeLocalFunctionContext = resolveActiveLocalFunctionContext(lookup);
    if (activeLocalFunctionContext?.source === 'call-macro') {
      const ownerRange = resolveOwnerHeaderRange(lookup.nodeSpan);
      if (!ownerRange) {
        return null;
      }

      const signature = createLocalFunctionSignatureInformation(activeLocalFunctionContext.declaration);
      const completedSeparators = countCompletedTopLevelSeparators(
        lookup.fragmentAnalysis.tokens,
        ownerRange,
        lookup.fragmentLocalOffset,
        lookup.fragment.content,
      );
      const rawActiveParameter = Math.max(0, completedSeparators - 2);

      return {
        signatures: [signature],
        activeSignature: 0,
        activeParameter: clampLocalFunctionParameterIndex(
          rawActiveParameter,
          activeLocalFunctionContext.declaration.parameters.length,
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
