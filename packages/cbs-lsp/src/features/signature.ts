import {
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
  type FragmentAnalysisVersion,
  type FragmentAnalysisService,
} from '../core';
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
  ): SignatureHelp | null {
    if (!context) {
      return null;
    }

    const request = createAnalysisRequest(params, context);
    const lookup = this.analysisService.locatePosition(request, params.position as Position);
    if (!lookup) {
      return null;
    }

    const builtin = resolveBuiltinForPosition(this.registry, lookup.nodeSpan);
    const ownerRange = resolveOwnerHeaderRange(lookup.nodeSpan);
    if (!builtin || !ownerRange) {
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
