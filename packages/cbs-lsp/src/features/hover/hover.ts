/**
 * CBS LSP의 Hover(마우스 호버) 기능을 제공하는 프로바이더 구현체.
 * @file packages/cbs-lsp/src/features/hover/hover.ts
 */
import {
  type CancellationToken,
  Hover,
  MarkupKind,
  type MarkupContent,
  TextDocumentPositionParams,
} from 'vscode-languageserver/node';
import { formatHoverContent } from 'risu-workbench-core';
import type {
  BlockNode,
  CBSBuiltinFunction,
  CBSBuiltinRegistry,
  CBSNode,
  MacroCallNode,
  Position,
  Range,
} from 'risu-workbench-core';
import {
  CALC_EXPRESSION_SUBLANGUAGE_LABEL,
  getCalcExpressionSublanguageDocumentation,
} from '../../core/calc-expression';
import { CbsLspTextHelper } from '../../helpers/text-helper';

import {
  createAgentMetadataEnvelope,
  createAgentMetadataExplanation,
  createStaleWorkspaceAvailability,
  collectLocalFunctionDeclarations,
  fragmentAnalysisService,
  findCalcReferenceAtOffset,
  resolveVisibleLoopBindingFromNodePath,
  getCalcExpressionZone,
  resolveTokenMacroArgumentContext,
  resolveActiveLocalFunctionContext,
  resolveLocalFunctionDeclaration,
  resolveRuntimeArgumentSlot,
  shouldSuppressPureModeFeatures,
  isAgentMetadataEnvelope,
  type AgentMetadataCategoryContract,
  type AgentMetadataEnvelope,
  type AgentMetadataExplanationContract,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataWorkspaceSnapshotContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentCursorLookupResult,
  type LocalFunctionDeclaration,
} from '../../core';
import { isRequestCancelled } from '../../utils/request-cancellation';
import { shouldSkipOversizedLuaText } from '../../utils/oversized-lua';
import { appendWorkspaceVariableSummary } from './hover-variable-formatting';
import type {
  VariableFlowQueryResult,
  VariableFlowService,
  WorkspaceSnapshotState,
} from '../../services';
import { positionToOffset } from '../../utils/position';
import { isContextualBuiltin, isDocOnlyBuiltin } from 'risu-workbench-core';
import { resolveVariablePosition } from '../shared/local-first-contract';

const MAX_OVERSIZED_HOVER_LINE_SCAN_LENGTH = 1024 * 1024;

export type HoverRequestResolver = (
  params: TextDocumentPositionParams,
) => FragmentAnalysisRequest | null;

export interface HoverProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: HoverRequestResolver;
  variableFlowService?: VariableFlowService;
  workspaceSnapshot?: WorkspaceSnapshotState | null;
}

interface HoverTarget {
  data: AgentMetadataEnvelope;
  markdown: string;
  localStartOffset: number;
  localEndOffset: number;
}

interface EachHeaderIteratorTarget {
  name: string;
  localStartOffset: number;
  localEndOffset: number;
}

export interface AgentFriendlyHover extends Hover {
  data: AgentMetadataEnvelope;
}

export interface NormalizedHoverSnapshot {
  contents: {
    kind: string | null;
    value: string;
  };
  data: AgentMetadataEnvelope | null;
  range: Range | null;
}

/**
 * normalizeHoverContents 함수.
 * LSP Hover 객체의 다양한 contents 형식을 내부 스냅샷용 구조로 정규화함.
 *
 * @param contents - LSP Hover에서 제공하는 contents 데이터
 * @returns 정규화된 호버 콘텐츠 정보
 */
function normalizeHoverContents(contents: Hover['contents']): NormalizedHoverSnapshot['contents'] {
  if (typeof contents === 'string') {
    return { kind: null, value: contents };
  }

  if (Array.isArray(contents)) {
    return {
      kind: null,
      value: contents.map((entry) => (typeof entry === 'string' ? entry : entry.value)).join('\n'),
    };
  }

  const markup = contents as MarkupContent | { kind?: string; value: string };

  if (typeof markup === 'string') {
    return { kind: null, value: markup };
  }

  return {
    kind: 'kind' in markup ? (markup.kind ?? null) : null,
    value: markup.value,
  };
}

/**
 * normalizeHoverForSnapshot 함수.
 * Hover 객체를 테스트나 기록을 위한 스냅샷 형태로 변환함.
 *
 * @param hover - LSP Hover 객체 또는 null
 * @returns 스냅샷용으로 정규화된 데이터 객체
 */
export function normalizeHoverForSnapshot(hover: Hover | null): NormalizedHoverSnapshot | null {
  if (!hover) {
    return null;
  }

  const agentHover = hover as Partial<AgentFriendlyHover>;

  return {
    contents: normalizeHoverContents(hover.contents),
    data: isAgentMetadataEnvelope(agentHover.data) ? agentHover.data : null,
    range: hover.range ?? null,
  };
}

const SLOT_MACRO_RULES = Object.freeze({
  slot: { kind: 'loop', argumentIndex: 0 },
} as const);

const VARIABLE_MACRO_RULES = Object.freeze({
  addvar: { kind: 'chat', access: 'reads and writes via `addvar`' },
  getglobalvar: { kind: 'global', access: 'reads via `getglobalvar`' },
  gettempvar: { kind: 'temp', access: 'reads via `gettempvar`' },
  getvar: { kind: 'chat', access: 'reads via `getvar`' },
  setdefaultvar: { kind: 'chat', access: 'writes a default value via `setdefaultvar`' },
  settempvar: { kind: 'temp', access: 'writes via `settempvar`' },
  setvar: { kind: 'chat', access: 'writes via `setvar`' },
  tempvar: { kind: 'temp', access: 'reads via `tempvar`' },
} as const);

const VARIABLE_KIND_LABELS = Object.freeze({
  chat: 'persistent chat variable',
  global: 'global variable',
  loop: 'loop variable',
  temp: 'temporary variable',
} as const);

type VariableKind = keyof typeof VARIABLE_KIND_LABELS;

/**
 * formatInlineCode 함수.
 * 사용자 입력 값을 Markdown inline code span으로 안전하게 감쌈.
 *
 * @param value - inline code로 표시할 원문 값
 * @returns value 안의 backtick run보다 긴 delimiter를 사용한 code span
 */
function formatInlineCode(value: string): string {
  const backtickRuns = value.match(/`+/gu) ?? [];
  const delimiterLength = Math.max(1, ...backtickRuns.map((run) => run.length + 1));
  const delimiter = '`'.repeat(delimiterLength);
  const needsPadding = value.includes('`') || value.startsWith(' ') || value.endsWith(' ');
  const padding = needsPadding ? ' ' : '';

  return `${delimiter}${padding}${value}${padding}${delimiter}`;
}

const WHEN_OPERATOR_DOCS = Object.freeze({
  keep: {
    summary: 'Preserves the block body whitespace instead of trimming it.',
    example: '{{#when::keep::condition}}...{{/when}}',
  },
  legacy: {
    summary: 'Uses the deprecated `#if`-style whitespace behavior for compatibility.',
    example: '{{#when::legacy::condition}}...{{/when}}',
  },
  not: {
    summary: 'Negates the following condition so truthy becomes false and vice versa.',
    example: '{{#when::not::condition}}...{{/when}}',
  },
  toggle: {
    summary: 'Checks whether the named toggle is enabled.',
    example: '{{#when::toggle::featureFlag}}...{{/when}}',
  },
  var: {
    summary: 'Treats the next value as a variable lookup and tests its truthiness.',
    example: '{{#when::var::variableName}}...{{/when}}',
  },
  and: {
    summary: 'Requires both the left and right conditions to be truthy.',
    example: '{{#when::left::and::right}}...{{/when}}',
  },
  or: {
    summary: 'Succeeds when either the left or right condition is truthy.',
    example: '{{#when::left::or::right}}...{{/when}}',
  },
  is: {
    summary: 'Compares the left-hand condition with the right-hand value for equality.',
    example: '{{#when::left::is::right}}...{{/when}}',
  },
  isnot: {
    summary: 'Compares the left-hand condition with the right-hand value for inequality.',
    example: '{{#when::left::isnot::right}}...{{/when}}',
  },
  '>': {
    summary: 'Checks whether the left-hand value is greater than the right-hand value.',
    example: '{{#when::left::>::right}}...{{/when}}',
  },
  '<': {
    summary: 'Checks whether the left-hand value is less than the right-hand value.',
    example: '{{#when::left::<::right}}...{{/when}}',
  },
  '>=': {
    summary: 'Checks whether the left-hand value is greater than or equal to the right-hand value.',
    example: '{{#when::left::>=::right}}...{{/when}}',
  },
  '<=': {
    summary: 'Checks whether the left-hand value is less than or equal to the right-hand value.',
    example: '{{#when::left::<=::right}}...{{/when}}',
  },
  vis: {
    summary: 'Compares a variable value against a literal value.',
    example: '{{#when::variableName::vis::literal}}...{{/when}}',
  },
  visnot: {
    summary: 'Checks whether a variable value differs from a literal value.',
    example: '{{#when::variableName::visnot::literal}}...{{/when}}',
  },
  tis: {
    summary: 'Compares a toggle value against a literal value.',
    example: '{{#when::toggleName::tis::literal}}...{{/when}}',
  },
  tisnot: {
    summary: 'Checks whether a toggle value differs from a literal value.',
    example: '{{#when::toggleName::tisnot::literal}}...{{/when}}',
  },
} as const);

/**
 * formatParameterDefinitionSummary 함수.
 * 매개변수 이름과 정의 위치를 포함한 요약 문자열을 생성함.
 *
 * @param parameters - 이름과 범위 정보가 포함된 매개변수 배열
 * @returns 포맷팅된 정의 요약 문자열
 */
function formatParameterDefinitionSummary(
  parameters: readonly { name: string; range: Range }[],
): string {
  if (parameters.length === 0) {
    return 'none declared';
  }

  return parameters
    .map(
      (parameter) =>
        `${formatInlineCode(parameter.name)} (${CbsLspTextHelper.formatRangeStart(parameter.range)})`,
    )
    .join(', ');
}

/**
 * formatHoverRuntimeArgumentSlotSummary 함수.
 * local function runtime slot 요약을 hover용 안전 code span으로 생성함.
 *
 * @param declaration - 요약할 fragment-local 함수 선언
 * @returns hover Markdown에 표시할 runtime slot 요약
 */
function formatHoverRuntimeArgumentSlotSummary(
  declaration: LocalFunctionDeclaration,
): string {
  const slots = [
    `${formatInlineCode('arg::0')} → function name`,
    ...declaration.parameterDeclarations.map(
      (parameter) =>
        `${formatInlineCode(`arg::${parameter.runtimeArgumentIndex}`)} → ${formatInlineCode(parameter.name)}`,
    ),
  ];

  return slots.join(', ');
}

/**
 * extractPlainMacroArgumentText 함수.
 * macro argument가 plain text로만 구성될 때 trim된 표시 문자열을 추출함.
 *
 * @param node - argument를 읽을 macro call 노드
 * @param argumentIndex - 읽을 argument 슬롯 번호
 * @param sourceText - fragment-local CBS 원문
 * @returns 표시 가능한 argument 문자열 또는 null
 */
function extractPlainMacroArgumentText(
  node: MacroCallNode,
  argumentIndex: number,
  sourceText: string,
): string | null {
  const argument = node.arguments[argumentIndex];
  if (!argument || argument.length === 0) {
    return null;
  }

  const literalParts: string[] = [];
  for (const child of argument) {
    if (child.type === 'Comment') {
      continue;
    }

    if (child.type !== 'PlainText') {
      return null;
    }

    literalParts.push(
      sourceText.slice(
        positionToOffset(sourceText, child.range.start),
        positionToOffset(sourceText, child.range.end),
      ),
    );
  }

  const text = literalParts.join('').trim();
  return text.length > 0 ? text : null;
}

/**
 * findRepresentativeCallArgument 함수.
 * 현재 fragment에서 로컬 함수 호출의 runtime argument 슬롯 예시를 찾음.
 *
 * @param nodes - 검색할 CBS 노드 목록
 * @param functionName - 대상 로컬 함수 이름
 * @param runtimeArgumentIndex - 읽을 upstream `arg::N` 슬롯 번호
 * @param sourceText - fragment-local CBS 원문
 * @returns 호출부의 실제 argument 문자열 또는 null
 */
function findRepresentativeCallArgument(
  nodes: readonly CBSNode[],
  functionName: string,
  runtimeArgumentIndex: number,
  sourceText: string,
): string | null {
  for (const node of nodes) {
    if (node.type === 'MacroCall') {
      const targetName = extractPlainMacroArgumentText(node, 0, sourceText);
      if (node.name.toLowerCase() === 'call' && targetName === functionName) {
        const argument = extractPlainMacroArgumentText(node, runtimeArgumentIndex, sourceText);
        if (argument) {
          return argument;
        }
      }

      const nestedArgument = findRepresentativeCallArgument(
        node.arguments.flat(),
        functionName,
        runtimeArgumentIndex,
        sourceText,
      );
      if (nestedArgument) {
        return nestedArgument;
      }
    }

    if (node.type === 'Block') {
      const nestedArgument =
        findRepresentativeCallArgument(
          node.condition,
          functionName,
          runtimeArgumentIndex,
          sourceText,
        ) ??
        findRepresentativeCallArgument(node.body, functionName, runtimeArgumentIndex, sourceText) ??
        (node.elseBody
          ? findRepresentativeCallArgument(
              node.elseBody,
              functionName,
              runtimeArgumentIndex,
              sourceText,
            )
          : null);
      if (nestedArgument) {
        return nestedArgument;
      }
    }
  }

  return null;
}

/**
 * getTrimmedTokenOffsets 함수.
 * 토큰의 앞뒤 공백을 제외한 실제 텍스트의 오프셋 범위를 계산함.
 *
 * @param lookup - 프래그먼트 커서 조회 결과의 토큰 정보
 * @returns 공백이 제거된 텍스트의 시작 및 종료 오프셋
 */
function getTrimmedTokenOffsets(
  lookup: FragmentCursorLookupResult['token'],
): { localStartOffset: number; localEndOffset: number } | null {
  if (!lookup) {
    return null;
  }

  const raw = lookup.token.raw;
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const leadingWhitespace = raw.length - raw.trimStart().length;
  const localStartOffset = lookup.localStartOffset + leadingWhitespace;

  return {
    localStartOffset,
    localEndOffset: localStartOffset + trimmed.length,
  };
}

/**
 * getKeywordHoverTarget 함수.
 * 현재 커서 위치에 있는 토큰에서 유효한 키워드를 추출하고 해당 범위를 계산함.
 *
 * @param lookup - 프래그먼트 커서 조회 결과
 * @returns 키워드와 로컬 오프셋 범위를 포함한 객체 또는 null
 */
function getKeywordHoverTarget(
  lookup: FragmentCursorLookupResult,
): { keyword: string; localStartOffset: number; localEndOffset: number } | null {
  const tokenLookup = lookup.token;
  if (!tokenLookup) {
    return null;
  }

  const raw = tokenLookup.token.raw.trimStart();
  const keyword = raw.split(/\s+/, 1)[0] ?? '';
  if (keyword.length === 0) {
    return null;
  }

  const leadingWhitespace = tokenLookup.token.raw.length - tokenLookup.token.raw.trimStart().length;
  const localStartOffset = tokenLookup.localStartOffset + leadingWhitespace;
  const localEndOffset = localStartOffset + keyword.length;

  if (
    lookup.fragmentLocalOffset < localStartOffset ||
    lookup.fragmentLocalOffset > localEndOffset
  ) {
    return null;
  }

  return {
    keyword,
    localStartOffset,
    localEndOffset,
  };
}

/**
 * getEachHeaderIteratorTarget 함수.
 * `#each` block header의 iterator 이름 범위를 hover 대상 변수로 복원함.
 *
 * @param lookup - 프래그먼트 커서 조회 결과
 * @returns iterator 변수 이름과 fragment-local offset 범위, 없으면 null
 */
function getEachHeaderIteratorTarget(
  lookup: FragmentCursorLookupResult,
): EachHeaderIteratorTarget | null {
  const nodeSpan = lookup.nodeSpan;
  if (
    nodeSpan?.category !== 'block-header' ||
    nodeSpan.owner.type !== 'Block' ||
    nodeSpan.owner.kind !== 'each'
  ) {
    return null;
  }

  const eachBlock = nodeSpan.owner as BlockNode;
  const openStartOffset = positionToOffset(lookup.fragment.content, eachBlock.openRange.start);
  const openEndOffset = positionToOffset(lookup.fragment.content, eachBlock.openRange.end);
  const headerStartOffset = openStartOffset + 2;
  const headerEndOffset = Math.max(headerStartOffset, openEndOffset - 2);
  const headerRaw = lookup.fragment.content.slice(headerStartOffset, headerEndOffset);
  const headerMatch = /^(\s*#each\b)(\s+)(\S+)/iu.exec(headerRaw);
  if (!headerMatch) {
    return null;
  }

  const prefixLength = (headerMatch[1]?.length ?? 0) + (headerMatch[2]?.length ?? 0);
  const name = headerMatch[3] ?? '';
  const localStartOffset = headerStartOffset + prefixLength;
  const localEndOffset = localStartOffset + name.length;
  if (
    name.length === 0 ||
    lookup.fragmentLocalOffset < localStartOffset ||
    lookup.fragmentLocalOffset > localEndOffset
  ) {
    return null;
  }

  return {
    name,
    localStartOffset,
    localEndOffset,
  };
}

/**
 * HoverProvider 클래스.
 * CBS 문서 내의 다양한 토큰(빌트인, 변수, 함수 등)에 대한 마우스 호버 정보를 생성 및 관리함.
 */
export class HoverProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: HoverRequestResolver;

  private readonly variableFlowService: VariableFlowService | null;

  private readonly workspaceSnapshot: WorkspaceSnapshotState | null;

  /**
   * HoverProvider 생성자.
   * 빌트인 레지스트리와 옵션을 통해 프로바이더 인스턴스를 초기화함.
   *
   * @param registry - CBS 빌트인 함수 정보가 담긴 레지스트리
   * @param options - 서비스 및 스냅샷 정보를 포함한 설정 옵션
   */
  constructor(
    private readonly registry: CBSBuiltinRegistry,
    options: HoverProviderOptions = {},
  ) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
    this.variableFlowService = options.variableFlowService ?? null;
    this.workspaceSnapshot = options.workspaceSnapshot ?? null;
  }

  /**
   * provide 메서드.
   * 지정된 문서 위치에 적절한 호버 정보를 분석하여 반환함.
   *
   * @param params - 텍스트 문서 내 위치 파라미터
   * @param cancellationToken - 작업 취소 토큰
   * @returns 분석된 호버 정보 또는 null
   */
  provide(
    params: TextDocumentPositionParams,
    cancellationToken?: CancellationToken,
  ): AgentFriendlyHover | null {
    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const request = this.resolveRequest(params);
    if (!request) {
      return null;
    }

    const oversizedHover = this.provideOversizedLuaHover(request, params.position);
    if (oversizedHover) {
      return oversizedHover;
    }

    const lookup = this.analysisService.locatePosition(request, params.position, cancellationToken);
    if (!lookup) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    if (shouldSuppressPureModeFeatures(lookup)) {
      return null;
    }

    if (!lookup.recovery.tokenContextReliable && lookup.token?.category === 'plain-text') {
      return null;
    }

    const workspaceFreshness = this.getWorkspaceFreshness(request);
    const workspaceVariableQuery =
      this.variableFlowService && workspaceFreshness?.freshness !== 'stale'
        ? this.resolveWorkspaceVariableQuery(
            lookup,
            request.uri,
            positionToOffset(request.text, params.position),
          )
        : null;

    const hoverTarget =
      this.buildBuiltinHover(lookup) ??
      this.buildCalcExpressionHover(lookup) ??
      this.buildSlotAliasHover(lookup) ??
      this.buildEachHeaderIteratorHover(
        lookup,
        request.uri,
        workspaceVariableQuery,
        workspaceFreshness,
      ) ??
      this.buildVariableHover(lookup, request.uri, workspaceVariableQuery, workspaceFreshness) ??
      this.buildFunctionHover(lookup) ??
      this.buildWhenOperatorHover(lookup);
    if (!hoverTarget) {
      return null;
    }

    if (isRequestCancelled(cancellationToken)) {
      return null;
    }

    const range = lookup.fragmentAnalysis.mapper.toHostRangeFromOffsets(
      request.text,
      hoverTarget.localStartOffset,
      hoverTarget.localEndOffset,
    );

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: hoverTarget.markdown,
      },
      data: hoverTarget.data,
      range: range ?? undefined,
    };
  }

  private provideOversizedLuaHover(
    request: FragmentAnalysisRequest,
    position: Position,
  ): AgentFriendlyHover | null {
    return (
      this.provideOversizedLuaVariableArgumentHover(request, position) ??
      this.provideOversizedLuaBuiltinHover(request, position)
    );
  }

  private provideOversizedLuaVariableArgumentHover(
    request: FragmentAnalysisRequest,
    position: Position,
  ): AgentFriendlyHover | null {
    if (!shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
      return null;
    }

    const target = this.detectCurrentLineVariableArgumentTarget(request.text, position);
    if (!target) {
      return null;
    }

    const workspaceFreshness = this.getWorkspaceFreshness(request);
    const workspaceVariableQuery =
      this.variableFlowService && workspaceFreshness?.freshness !== 'stale'
        ? this.variableFlowService.queryVariable(target.name)
        : null;
    const lines = [
      `**Variable: ${target.name}**`,
      '',
      `- Kind: ${VARIABLE_KIND_LABELS.chat}`,
      `- Access: ${target.access}`,
    ];

    appendWorkspaceVariableSummary({
      lines,
      variableName: target.name,
      kind: 'chat',
      currentUri: request.uri,
      workspaceVariableQuery,
    });

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: lines.join('\n'),
      },
      data: this.createCategoryData(
        {
          category: 'variable',
          kind: 'chat-variable',
        },
        this.createScopeExplanation(
          'oversized-risulua-current-line',
          'Hover resolved this chat variable argument from a bounded current-line oversized .risulua fast path without full CBS analysis.',
        ),
        this.getStaleWorkspaceAvailability(workspaceFreshness, 'hover'),
        workspaceFreshness ?? undefined,
      ),
      range: {
        start: { line: position.line, character: target.startCharacter },
        end: { line: position.line, character: target.endCharacter },
      },
    };
  }

  private provideOversizedLuaBuiltinHover(
    request: FragmentAnalysisRequest,
    position: Position,
  ): AgentFriendlyHover | null {
    if (!shouldSkipOversizedLuaText(request.filePath, request.text.length)) {
      return null;
    }

    const target = this.detectCurrentLineBuiltinTarget(request.text, position);
    if (!target) {
      return null;
    }

    const builtin = this.registry.get(target.name);
    if (!builtin) {
      return null;
    }

    return {
      contents: {
        kind: MarkupKind.Markdown,
        value: formatHoverContent(builtin),
      },
      data: this.createCategoryData(
        {
          category: builtin.isBlock ? 'block-keyword' : 'builtin',
          kind: this.resolveBuiltinKind(builtin),
        },
        this.getBuiltinExplanation(
          builtin,
          `Hover resolved ${builtin.name} from a bounded current-line oversized .risulua fast path without full CBS analysis.`,
        ),
      ),
      range: {
        start: { line: position.line, character: target.startCharacter },
        end: { line: position.line, character: target.endCharacter },
      },
    };
  }

  private detectCurrentLineBuiltinTarget(
    text: string,
    position: Position,
  ): { name: string; startCharacter: number; endCharacter: number } | null {
    const offset = positionToOffset(text, position);
    if (offset < 0 || offset > text.length) {
      return null;
    }

    const lineStartOffset = Math.max(text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1, 0);
    const rawLineEndOffset = text.indexOf('\n', offset);
    const lineEndOffset = rawLineEndOffset === -1 ? text.length : rawLineEndOffset;
    const line = text.slice(lineStartOffset, lineEndOffset).replace(/\r$/u, '');
    if (position.character > line.length) {
      return null;
    }

    const beforeCursor = line.slice(0, position.character);
    const macroStartCharacter = beforeCursor.lastIndexOf('{{');
    if (macroStartCharacter === -1) {
      return null;
    }

    const closeCharacter = line.indexOf('}}', macroStartCharacter + 2);
    if (closeCharacter !== -1 && position.character > closeCharacter + 2) {
      return null;
    }

    const macroBodyEnd = closeCharacter === -1 ? line.length : closeCharacter;
    const macroBody = line.slice(macroStartCharacter + 2, macroBodyEnd);
    const match = /^(\s*)([#:]?[A-Za-z_][A-Za-z0-9_]*|\/[A-Za-z_][A-Za-z0-9_]*)/u.exec(macroBody);
    if (!match) {
      return null;
    }

    const leadingWhitespaceLength = match[1]?.length ?? 0;
    const name = match[2] ?? '';
    const startCharacter = macroStartCharacter + 2 + leadingWhitespaceLength;
    const endCharacter = startCharacter + name.length;
    if (position.character < startCharacter || position.character > endCharacter) {
      return null;
    }

    return { name, startCharacter, endCharacter };
  }

  private detectCurrentLineVariableArgumentTarget(
    text: string,
    position: Position,
  ): { name: string; access: string; startCharacter: number; endCharacter: number } | null {
    const line = this.getLineTextAtPosition(
      text,
      position,
      MAX_OVERSIZED_HOVER_LINE_SCAN_LENGTH,
    );
    if (line === null || position.character > line.length) {
      return null;
    }

    const prefixText = line.slice(0, position.character);
    const macroStartCharacter = prefixText.lastIndexOf('{{');
    if (macroStartCharacter === -1) {
      return null;
    }

    const closeBeforeMacro = prefixText.lastIndexOf('}}');
    if (closeBeforeMacro > macroStartCharacter) {
      return null;
    }

    const closeCharacter = line.indexOf('}}', macroStartCharacter + 2);
    if (closeCharacter !== -1 && position.character > closeCharacter + 2) {
      return null;
    }

    const macroBodyEndCharacter = closeCharacter === -1 ? line.length : closeCharacter;
    const macroBody = line.slice(macroStartCharacter + 2, macroBodyEndCharacter);
    const macroPrefix = line.slice(macroStartCharacter + 2, position.character);
    if (macroPrefix.includes('{{') || macroPrefix.startsWith('/')) {
      return null;
    }

    const lastArgumentSeparatorIndex = macroPrefix.lastIndexOf('::');
    if (lastArgumentSeparatorIndex === -1) {
      return null;
    }

    const macroName = macroPrefix.slice(0, macroPrefix.indexOf('::')).trim().toLowerCase();
    if (!/^[a-z_][\w]*$/iu.test(macroName)) {
      return null;
    }

    let argumentIndex = 0;
    for (let index = 0; index < lastArgumentSeparatorIndex; index += 1) {
      if (macroPrefix.slice(index, index + 2) !== '::') {
        continue;
      }

      argumentIndex += 1;
      index += 1;
    }

    if (argumentIndex !== 0) {
      return null;
    }

    const rule = VARIABLE_MACRO_RULES[macroName as keyof typeof VARIABLE_MACRO_RULES];
    if (!rule || rule.kind !== 'chat') {
      return null;
    }

    const segmentStartCharacter = macroStartCharacter + 2 + lastArgumentSeparatorIndex + 2;
    const nextArgumentSeparatorIndex = macroBody.indexOf('::', lastArgumentSeparatorIndex + 2);
    const segmentEndCharacter =
      nextArgumentSeparatorIndex === -1
        ? macroBodyEndCharacter
        : macroStartCharacter + 2 + nextArgumentSeparatorIndex;
    const rawSegment = line.slice(segmentStartCharacter, segmentEndCharacter);
    const leadingWhitespaceLength = rawSegment.length - rawSegment.trimStart().length;
    const trailingWhitespaceLength = rawSegment.length - rawSegment.trimEnd().length;
    const startCharacter = segmentStartCharacter + leadingWhitespaceLength;
    const endCharacter = segmentEndCharacter - trailingWhitespaceLength;

    if (position.character < startCharacter || position.character > endCharacter) {
      return null;
    }

    const name = line.slice(startCharacter, endCharacter);
    if (name.length === 0) {
      return null;
    }

    return {
      name,
      access: rule.access,
      startCharacter,
      endCharacter,
    };
  }

  private getLineTextAtPosition(
    text: string,
    position: Position,
    maxScannedCharacters: number,
  ): string | null {
    const offset = positionToOffset(text, position);
    if (offset < 0 || offset > text.length) {
      return null;
    }

    const lineStartOffset = Math.max(text.lastIndexOf('\n', Math.max(0, offset - 1)) + 1, 0);
    const rawLineEndOffset = text.indexOf('\n', offset);
    const lineEndOffset = rawLineEndOffset === -1 ? text.length : rawLineEndOffset;
    if (lineEndOffset - lineStartOffset > maxScannedCharacters) {
      return null;
    }

    const line = text.slice(lineStartOffset, lineEndOffset).replace(/\r$/u, '');
    return position.character <= line.length ? line : null;
  }

  /**
   * resolveWorkspaceVariableQuery 메서드.
   * Layer 1 occurrence가 없는 `.risulua` CBS 인자도 이름 기반 query로 보강함.
   *
   * @param lookup - 현재 cursor의 fragment lookup 결과
   * @param uri - 현재 host document URI
   * @param hostOffset - 현재 host document offset
   * @returns workspace variable query 결과 또는 null
   */
  private resolveWorkspaceVariableQuery(
    lookup: FragmentCursorLookupResult,
    uri: string,
    hostOffset: number,
  ): VariableFlowQueryResult | null {
    const positionQuery = this.variableFlowService?.queryAt(uri, hostOffset) ?? null;
    if (positionQuery) {
      return positionQuery;
    }

    const variablePosition = resolveVariablePosition(lookup);
    if (!variablePosition || variablePosition.kind !== 'chat') {
      return null;
    }

    return this.variableFlowService?.queryVariable(variablePosition.variableName) ?? null;
  }

  /**
   * buildBuiltinHover 메서드.
   * 빌트인 매크로나 키워드에 대한 호버 타겟을 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 빌트인 호버 정보 또는 null
   */
  private buildBuiltinHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    if (!tokenLookup) {
      return null;
    }

    if (tokenLookup.category === 'macro-name' || tokenLookup.category === 'else') {
      const builtin = this.registry.get(tokenLookup.token.value);
      const offsets = getTrimmedTokenOffsets(tokenLookup);
      if (!builtin || !offsets) {
        return null;
      }

      return {
        data: this.createCategoryData(
          {
            category:
              builtin.isBlock || tokenLookup.category === 'else' ? 'block-keyword' : 'builtin',
            kind:
              tokenLookup.category === 'else' ? 'else-keyword' : this.resolveBuiltinKind(builtin),
          },
          this.getBuiltinExplanation(
            builtin,
            tokenLookup.category === 'else'
              ? 'Hover resolved this token from the builtin registry as the special :else branch keyword.'
              : undefined,
          ),
        ),
        markdown: formatHoverContent(builtin),
        ...offsets,
      };
    }

    if (tokenLookup.category !== 'block-header') {
      return null;
    }

    const keywordTarget = getKeywordHoverTarget(lookup);
    if (!keywordTarget) {
      return null;
    }

    const builtin = this.registry.get(keywordTarget.keyword);
    if (!builtin) {
      return null;
    }

    return {
      data: this.createCategoryData(
        {
          category: builtin.isBlock ? 'block-keyword' : 'builtin',
          kind: this.resolveBuiltinKind(builtin),
        },
        this.getBuiltinExplanation(builtin),
      ),
      markdown: formatHoverContent(builtin),
      localStartOffset: keywordTarget.localStartOffset,
      localEndOffset: keywordTarget.localEndOffset,
    };
  }

  /**
   * buildSlotAliasHover 메서드.
   * `slot::` 루프 에일리어스 참조에 대한 호버 타겟을 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 루프 에일리어스 호버 정보 또는 null
   */
  private buildSlotAliasHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
    const nodeSpan = lookup.nodeSpan;
    if (!tokenLookup || tokenLookup.category !== 'argument') {
      return null;
    }

    const macroName =
      tokenMacroContext?.argumentIndex === 0
        ? tokenMacroContext.macroName
        : nodeSpan &&
            nodeSpan.category === 'argument' &&
            nodeSpan.argumentIndex === 0 &&
            nodeSpan.owner.type === 'MacroCall'
          ? nodeSpan.owner.name.toLowerCase()
          : null;
    const slotRule = macroName
      ? SLOT_MACRO_RULES[macroName as keyof typeof SLOT_MACRO_RULES]
      : null;
    const bindingName = tokenLookup.token.value.trim();
    const slotPrefix = lookup.fragment.content
      .slice(
        Math.max(0, tokenLookup.localStartOffset - 'slot::'.length),
        tokenLookup.localStartOffset,
      )
      .toLowerCase();
    const looksLikeSlotReference = slotPrefix === 'slot::';
    if ((!slotRule && !looksLikeSlotReference) || bindingName.length === 0) {
      return null;
    }

    const bindingMatch = resolveVisibleLoopBindingFromNodePath(
      lookup.nodePath,
      lookup.fragment.content,
      bindingName,
      lookup.fragmentLocalOffset,
    );
    if (!bindingMatch) {
      return {
        data: this.createCategoryData(
          {
            category: 'contextual-token',
            kind: 'loop-alias',
          },
          this.createScopeExplanation(
            'visible-loop-bindings',
            'Hover used scope analysis to interpret this slot:: token as a missing loop alias reference.',
          ),
        ),
        markdown: [
          `**Loop alias reference: ${bindingName}**`,
          '',
          `- Meaning: \`slot::${bindingName}\` tries to reference the active \`#each ... as ${bindingName}\` loop alias.`,
          '- Status: no visible `#each` loop alias with that name is active at this position.',
        ].join('\n'),
        localStartOffset: tokenLookup.localStartOffset,
        localEndOffset: tokenLookup.localEndOffset,
      };
    }

    const { binding, scopeDepth } = bindingMatch;
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const loopSymbol = symbolTable.getVariables(binding.bindingName, 'loop').find((candidate) => {
      if (!candidate.definitionRange) {
        return false;
      }

      return (
        candidate.definitionRange.start.line === binding.bindingRange.start.line &&
        candidate.definitionRange.start.character === binding.bindingRange.start.character &&
        candidate.definitionRange.end.line === binding.bindingRange.end.line &&
        candidate.definitionRange.end.character === binding.bindingRange.end.character
      );
    });
    const scopeLabel =
      scopeDepth === 0
        ? 'current `#each` block'
        : scopeDepth === 1
          ? 'outer `#each` block'
          : `outer \
\`#each\` block (${scopeDepth} levels up)`;
    const lines = [`**Loop alias reference: ${binding.bindingName}**`, ''];

    lines.push(
      `- Meaning: \`slot::${binding.bindingName}\` points to the currently visible \`#each\` loop alias, not the builtin \`slot\` syntax entry itself.`,
    );
    lines.push(`- Bound by: \`#each ${binding.iteratorExpression} as ${binding.bindingName}\``);
    lines.push(`- Scope: ${scopeLabel}`);
    lines.push(`- Local definition: ${CbsLspTextHelper.formatRangeStart(binding.bindingRange)}`);

    if (loopSymbol) {
      lines.push(`- Local references: ${loopSymbol.references.length}`);
    }

    return {
      data: this.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'loop-alias',
        },
        this.createScopeExplanation(
          'visible-loop-bindings',
          'Hover resolved this slot:: token through visible #each loop bindings from scope analysis.',
        ),
      ),
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  /**
   * buildVariableHover 메서드.
   * 변수(채팅, 전역, 임시) 참조에 대한 호버 타겟을 생성하며 워크스페이스 분석 결과를 포함함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @param currentUri - 현재 문서의 URI
   * @param workspaceVariableQuery - 워크스페이스 전역 변수 flow 쿼리 결과
   * @param workspaceFreshness - 워크스페이스 스냅샷 상태 정보
   * @returns 변수 호버 정보 또는 null
   */
  private buildVariableHover(
    lookup: FragmentCursorLookupResult,
    currentUri: string,
    workspaceVariableQuery: VariableFlowQueryResult | null,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  ): HoverTarget | null {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;
    const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
    if (!tokenLookup) {
      return null;
    }

    const macroName =
      tokenMacroContext?.argumentIndex === 0
        ? tokenMacroContext.macroName
        : nodeSpan &&
            tokenLookup.category === 'argument' &&
            nodeSpan.category === 'argument' &&
            nodeSpan.argumentIndex === 0 &&
            nodeSpan.owner.type === 'MacroCall'
          ? nodeSpan.owner.name.toLowerCase()
          : null;
    if (!macroName) {
      return null;
    }

    const rule = VARIABLE_MACRO_RULES[macroName as keyof typeof VARIABLE_MACRO_RULES];
    const variableName = tokenLookup.token.value.trim();
    if (!rule || variableName.length === 0) {
      return null;
    }

    return this.buildVariableHoverFromName(
      lookup,
      variableName,
      rule.kind,
      rule.access,
      currentUri,
      workspaceVariableQuery,
      workspaceFreshness,
      tokenLookup.localStartOffset,
      tokenLookup.localEndOffset,
      'Hover resolved this variable through analyzed symbol-table entries for the current macro argument.',
    );
  }

  /**
   * buildVariableHoverFromName 메서드.
   * 변수 이름과 범위를 받아 공통 변수 hover markdown과 metadata를 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @param variableName - hover 대상 변수 이름
   * @param fallbackKind - symbol table에 정의가 없을 때 사용할 변수 종류
   * @param access - 현재 문맥에서 변수 접근 방식 설명
   * @param currentUri - 현재 문서의 URI
   * @param workspaceVariableQuery - 워크스페이스 전역 변수 flow 쿼리 결과
   * @param workspaceFreshness - 워크스페이스 스냅샷 상태 정보
   * @param localStartOffset - hover 대상 시작 offset
   * @param localEndOffset - hover 대상 종료 offset
   * @param explanationDetail - hover metadata 설명 detail
   * @returns 변수 호버 정보
   */
  private buildVariableHoverFromName(
    lookup: FragmentCursorLookupResult,
    variableName: string,
    fallbackKind: VariableKind,
    access: string,
    currentUri: string,
    workspaceVariableQuery: VariableFlowQueryResult | null,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
    localStartOffset: number,
    localEndOffset: number,
    explanationDetail: string,
  ): HoverTarget {
    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const symbol = symbolTable.getVariable(variableName, fallbackKind);
    const kind = symbol?.kind ?? fallbackKind;
    const lines = [
      `**Variable: ${variableName}**`,
      '',
      `- Kind: ${VARIABLE_KIND_LABELS[kind]}`,
      `- Access: ${access}`,
    ];

    if (symbol?.definitionRange) {
      lines.push(
        `- Local definition: ${CbsLspTextHelper.formatRangeStart(symbol.definitionRange)}`,
      );
    }

    if (symbol) {
      lines.push(`- Local references: ${symbol.references.length}`);
    }

    appendWorkspaceVariableSummary({
      lines,
      variableName,
      kind,
      currentUri,
      workspaceVariableQuery,
    });

    return {
      data: this.createCategoryData(
        {
          category: 'variable',
          kind:
            kind === 'global'
              ? 'global-variable'
              : kind === 'temp'
                ? 'temp-variable'
                : 'chat-variable',
        },
        this.createScopeExplanation('variable-symbol-table', explanationDetail),
        kind === 'chat'
          ? this.getStaleWorkspaceAvailability(workspaceFreshness, 'hover')
          : undefined,
        kind === 'chat' ? (workspaceFreshness ?? undefined) : undefined,
      ),
      markdown: lines.join('\n'),
      localStartOffset,
      localEndOffset,
    };
  }

  /**
   * buildEachHeaderIteratorHover 메서드.
   * `#each variable alias` header의 iterator 위치를 chat variable hover로 해석함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @param currentUri - 현재 문서의 URI
   * @param workspaceVariableQuery - 워크스페이스 전역 변수 flow 쿼리 결과
   * @param workspaceFreshness - 워크스페이스 스냅샷 상태 정보
   * @returns iterator 변수 호버 정보 또는 null
   */
  private buildEachHeaderIteratorHover(
    lookup: FragmentCursorLookupResult,
    currentUri: string,
    workspaceVariableQuery: VariableFlowQueryResult | null,
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  ): HoverTarget | null {
    const target = getEachHeaderIteratorTarget(lookup);
    if (!target) {
      return null;
    }

    return this.buildVariableHoverFromName(
      lookup,
      target.name,
      'chat',
      'reads as the `#each` iterator source',
      currentUri,
      workspaceVariableQuery,
      workspaceFreshness,
      target.localStartOffset,
      target.localEndOffset,
      'Hover resolved this #each iterator expression as a chat variable source.',
    );
  }

  /**
   * buildCalcExpressionHover 메서드.
   * 산술 식(`{{calc::...}}`) 내부의 변수 및 환경 정보를 위한 호버 타겟을 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 산술 식 호버 정보 또는 null
   */
  private buildCalcExpressionHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const calcZone = getCalcExpressionZone(lookup);
    if (!calcZone) {
      return null;
    }

    const calcDocumentation = getCalcExpressionSublanguageDocumentation();

    const calcReference = findCalcReferenceAtOffset(calcZone, lookup.fragmentLocalOffset);
    if (calcReference) {
      const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
      const symbol = symbolTable.getVariable(calcReference.name, calcReference.kind);
      const kindLabel =
        calcReference.kind === 'global'
          ? VARIABLE_KIND_LABELS.global
          : symbol?.kind
            ? VARIABLE_KIND_LABELS[symbol.kind]
            : VARIABLE_KIND_LABELS.chat;
      const lines = [
        `**Calc variable: ${calcReference.raw}**`,
        '',
        `- Context: ${calcDocumentation.summary}`,
        `- Kind: ${kindLabel}`,
        `- Semantics: ${calcReference.kind === 'global' ? '`@name` reads a global variable' : '`$name` reads a chat variable'} and upstream coerces non-numeric values to \`0\`.`,
      ];

      if (symbol?.definitionRange) {
        lines.push(
          `- Local definition: ${CbsLspTextHelper.formatRangeStart(symbol.definitionRange)}`,
        );
      }

      if (symbol) {
        lines.push(`- Local references: ${symbol.references.length}`);
      }

      return {
        data: this.createCategoryData(
          {
            category: 'variable',
            kind: calcReference.kind === 'global' ? 'global-variable' : 'chat-variable',
          },
          this.createScopeExplanation(
            'calc-expression-symbol-table',
            'Hover resolved this calc reference through symbol-table lookup inside the shared expression sublanguage.',
          ),
        ),
        markdown: lines.join('\n'),
        localStartOffset: calcReference.startOffset,
        localEndOffset: calcReference.endOffset,
      };
    }

    return {
      data: this.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'calc-expression-zone',
        },
        this.createContextualExplanation(
          'calc-expression-context',
          'Hover inferred that the cursor is inside the shared CBS expression sublanguage zone.',
        ),
      ),
      markdown: [
        `**${CALC_EXPRESSION_SUBLANGUAGE_LABEL}**`,
        '',
        calcDocumentation.summary,
        '',
        `- ${calcDocumentation.variables}`,
        `- ${calcDocumentation.operators}`,
        `- ${calcDocumentation.coercion}`,
      ].join('\n'),
      localStartOffset: calcZone.expressionStartOffset,
      localEndOffset: calcZone.expressionEndOffset,
    };
  }

  /**
   * buildFunctionHover 메서드.
   * 로컬 함수 정의, 호출, 매개변수 참조를 포괄하는 호버 타겟을 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 함수 관련 호버 정보 또는 null
   */
  private buildFunctionHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    return (
      this.buildFunctionDeclarationHover(lookup) ??
      this.buildFunctionCallHover(lookup) ??
      this.buildArgumentReferenceHover(lookup)
    );
  }

  /**
   * buildFunctionDeclarationHover 메서드.
   * 로컬 함수(`#func`) 선언부의 헤더 영역에 대한 호버 정보를 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 함수 선언 호버 정보 또는 null
   */
  private buildFunctionDeclarationHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const nodeSpan = lookup.nodeSpan;
    if (
      !nodeSpan ||
      nodeSpan.category !== 'block-header' ||
      nodeSpan.owner.type !== 'Block' ||
      nodeSpan.owner.kind !== 'func'
    ) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const functionSymbol = symbolTable.getAllFunctions().find((symbol) => {
      if (!symbol.definitionRange) {
        return false;
      }

      const startOffset = positionToOffset(lookup.fragment.content, symbol.definitionRange.start);
      const endOffset = positionToOffset(lookup.fragment.content, symbol.definitionRange.end);
      return lookup.fragmentLocalOffset >= startOffset && lookup.fragmentLocalOffset <= endOffset;
    });
    const fallbackDeclaration = collectLocalFunctionDeclarations(
      lookup.fragmentAnalysis.document,
      lookup.fragment.content,
    ).find((candidate) => {
      const startOffset = positionToOffset(lookup.fragment.content, candidate.range.start);
      const endOffset = positionToOffset(lookup.fragment.content, candidate.range.end);
      return lookup.fragmentLocalOffset >= startOffset && lookup.fragmentLocalOffset <= endOffset;
    });
    const declaration =
      fallbackDeclaration ??
      (functionSymbol
        ? {
            name: functionSymbol.name,
            range: functionSymbol.definitionRange!,
            parameters: [...functionSymbol.parameters],
            parameterDeclarations: functionSymbol.parameters.map((parameter, index) => ({
              index,
              name: parameter,
              range: functionSymbol.definitionRange!,
              runtimeArgumentIndex: index + 1,
            })),
          }
        : null);
    if (!declaration) {
      return null;
    }

    return {
      data: this.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'local-function',
        },
        this.createContextualExplanation(
          'local-function-declaration',
          'Hover inferred a fragment-local #func declaration from the current block-header context.',
        ),
      ),
      markdown: [
        `**Local function declaration: ${formatInlineCode(declaration.name)}**`,
        '',
        `- Meaning: ${formatInlineCode(`#func ${declaration.name}`)} declares a fragment-local reusable macro body that ${formatInlineCode(`{{call::${declaration.name}::...}}`)} can invoke.`,
        `- Local definition: ${CbsLspTextHelper.formatRangeStart(declaration.range)}`,
        declaration.parameters.length > 0
          ? `- Parameters: ${declaration.parameters.map((parameter) => formatInlineCode(parameter)).join(', ')}`
          : '- Parameters: inferred at runtime',
        `- Parameter slots: ${formatHoverRuntimeArgumentSlotSummary(declaration)}`,
        `- Parameter definitions: ${formatParameterDefinitionSummary(declaration.parameterDeclarations)}`,
        `- Local calls: ${functionSymbol?.references.length ?? 0}`,
      ].join('\n'),
      localStartOffset: positionToOffset(lookup.fragment.content, declaration.range.start),
      localEndOffset: positionToOffset(lookup.fragment.content, declaration.range.end),
    };
  }

  /**
   * buildFunctionCallHover 메서드.
   * `{{call::...}}` 매크로에서 참조되는 로컬 함수에 대한 호버 정보를 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 함수 호출 참조 호버 정보 또는 null
   */
  private buildFunctionCallHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;
    if (
      !tokenLookup ||
      !nodeSpan ||
      tokenLookup.category !== 'argument' ||
      nodeSpan.owner.type !== 'MacroCall' ||
      nodeSpan.owner.name.toLowerCase() !== 'call' ||
      nodeSpan.argumentIndex !== 0
    ) {
      return null;
    }

    const functionName = tokenLookup.token.value.trim();
    if (functionName.length === 0) {
      return null;
    }

    const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
    const functionSymbol = symbolTable.getFunction(functionName);
    const fallbackDeclaration = resolveLocalFunctionDeclaration(
      lookup.fragmentAnalysis.document,
      lookup.fragment.content,
      functionName,
    );
    const parameters = functionSymbol?.parameters ?? fallbackDeclaration?.parameters ?? [];
    const definitionRange = functionSymbol?.definitionRange ?? fallbackDeclaration?.range;
    const lines = [`**Local function reference: ${formatInlineCode(functionName)}**`, ''];

    lines.push(
      '- Meaning: references a fragment-local `#func` declaration used by `{{call::...}}`.',
    );

    if (!functionSymbol && !fallbackDeclaration) {
      lines.push('- Status: unresolved local #func declaration');
    } else {
      if (parameters.length > 0) {
        lines.push(`- Parameters: ${parameters.map((parameter) => formatInlineCode(parameter)).join(', ')}`);
      }
      if (definitionRange) {
        lines.push(`- Local definition: ${CbsLspTextHelper.formatRangeStart(definitionRange)}`);
      }
      lines.push(`- Local calls: ${functionSymbol?.references.length ?? 0}`);
    }

    return {
      data: this.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'local-function',
        },
        this.createContextualExplanation(
          'local-function-reference',
          'Hover interpreted this token as a call:: local-function reference candidate.',
        ),
      ),
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  /**
   * buildArgumentReferenceHover 메서드.
   * `arg::n` 형태의 숫자형 매개변수 참조에 대한 호버 정보를 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 매개변수 참조 호버 정보 또는 null
   */
  private buildArgumentReferenceHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const tokenMacroContext = resolveTokenMacroArgumentContext(lookup);
    if (!tokenLookup || !tokenMacroContext) {
      return null;
    }

    if (tokenMacroContext.macroName !== 'arg' || tokenMacroContext.argumentIndex !== 0) {
      return null;
    }

    const rawText = tokenLookup.token.value.trim();
    if (!/^\d+$/u.test(rawText)) {
      return null;
    }

    const reference = {
      index: Number.parseInt(rawText, 10),
      rawText,
      range: tokenLookup.localRange,
    };

    const activeFunctionContext = resolveActiveLocalFunctionContext(lookup);
    const runtimeSlot = activeFunctionContext
      ? resolveRuntimeArgumentSlot(activeFunctionContext.declaration, reference.index)
      : null;
    const lines = [`**Numbered argument reference: arg::${reference.rawText}**`, ''];

    if (!activeFunctionContext) {
      lines.push(
        `- Meaning: references runtime \`arg::${reference.index}\` from a local \`#func\` / \`{{call::...}}\` context.`,
      );
      lines.push('- Status: outside a local `#func` / `call::` context.');
    } else if (runtimeSlot?.kind === 'function-name') {
      lines.push(
        '- Meaning: references the upstream function-name slot from the active local `#func` / `{{call::...}}` context.',
      );
      lines.push(`- Local function: ${formatInlineCode(activeFunctionContext.declaration.name)}`);
      lines.push(
        `- Local #func declaration: ${CbsLspTextHelper.formatRangeStart(activeFunctionContext.declaration.range)}`,
      );
      lines.push('- Parameter slot: 0');
      lines.push(
        `- Runtime meaning: upstream function-name slot ${formatInlineCode(activeFunctionContext.declaration.name)}`,
      );
    } else if (runtimeSlot?.kind === 'call-argument') {
      const activeFunctionName = activeFunctionContext.declaration.name;
      const parameterName = runtimeSlot.parameterName;
      if (!activeFunctionName || !parameterName) {
        return null;
      }

      const actualArgument = findRepresentativeCallArgument(
        lookup.fragmentAnalysis.document.nodes,
        activeFunctionName,
        runtimeSlot.index,
        lookup.fragment.content,
      );
      lines.push(
        `- Meaning: references runtime \`arg::${runtimeSlot.index}\`, which receives the declared parameter ${formatInlineCode(parameterName)} from the active local \`#func\` / \`{{call::...}}\` context.`,
      );
      lines.push(`- Local function: ${formatInlineCode(activeFunctionName)}`);
      lines.push(
        `- Local #func declaration: ${CbsLspTextHelper.formatRangeStart(activeFunctionContext.declaration.range)}`,
      );
      lines.push(`- Parameter slot: ${runtimeSlot.index}`);
      if (actualArgument) {
        lines.push(`- Actual call argument: ${formatInlineCode(actualArgument)}`);
      }
      lines.push(`- Parameter name: ${formatInlineCode(parameterName)}`);
      if (runtimeSlot.parameterDeclaration) {
        lines.push(
          `- Parameter definition: ${CbsLspTextHelper.formatRangeStart(runtimeSlot.parameterDeclaration.range)}`,
        );
      }
    } else {
      lines.push(
        `- Meaning: references runtime \`arg::${reference.index}\` from the active local \`#func\` / \`{{call::...}}\` context.`,
      );
      lines.push(`- Local function: ${formatInlineCode(activeFunctionContext.declaration.name)}`);
      lines.push(
        `- Local #func declaration: ${CbsLspTextHelper.formatRangeStart(activeFunctionContext.declaration.range)}`,
      );
      lines.push(`- Parameter slot: ${reference.index}`);
      lines.push(
        `- Status: current function only exposes ${activeFunctionContext.declaration.parameters.length + 1} runtime slot(s).`,
      );
    }

    return {
      data: this.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'argument-index',
        },
        this.createContextualExplanation(
          'active-local-function-context',
          'Hover inferred an arg:: numbered parameter reference from the active local #func / call:: context.',
        ),
      ),
      markdown: lines.join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  /**
   * buildWhenOperatorHover 메서드.
   * `#when` 블록의 연산자 키워드에 대한 호버 타겟을 생성함.
   *
   * @param lookup - 프래그먼트 커서 조회 결과
   * @returns 연산자 호버 정보 또는 null
   */
  private buildWhenOperatorHover(lookup: FragmentCursorLookupResult): HoverTarget | null {
    const tokenLookup = lookup.token;
    const nodeSpan = lookup.nodeSpan;
    if (!tokenLookup || !nodeSpan) {
      return null;
    }

    if (
      tokenLookup.category !== 'argument' ||
      nodeSpan.category !== 'block-header' ||
      nodeSpan.owner.type !== 'Block' ||
      nodeSpan.owner.kind !== 'when'
    ) {
      return null;
    }

    const operatorName = tokenLookup.token.value.trim().toLowerCase();
    const documentation = WHEN_OPERATOR_DOCS[operatorName as keyof typeof WHEN_OPERATOR_DOCS];
    if (!documentation) {
      return null;
    }

    return {
      data: this.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'when-operator',
        },
        this.createContextualExplanation(
          'when-operator-context',
          'Hover interpreted this token as a #when operator from the current block-header argument position.',
        ),
      ),
      markdown: [
        `**#when operator: ${tokenLookup.token.value.trim()}**`,
        '',
        documentation.summary,
        '',
        '```cbs',
        documentation.example,
        '```',
      ].join('\n'),
      localStartOffset: tokenLookup.localStartOffset,
      localEndOffset: tokenLookup.localEndOffset,
    };
  }

  /**
   * createCategoryData 함수.
   * hover payload에 붙일 공통 category envelope를 생성함.
   *
   * @param category - hover 결과를 machine-readable하게 분류할 stable category 값
   * @returns hover `data`에 그대로 넣을 envelope
   */
  private createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
    availability?: AgentMetadataAvailabilityContract,
    workspace?: AgentMetadataWorkspaceSnapshotContract,
  ): AgentMetadataEnvelope {
    return createAgentMetadataEnvelope(category, explanation, availability, workspace);
  }

  /**
   * getWorkspaceFreshness 메서드.
   * 현재 요청에 대한 워크스페이스 분석 결과의 최신 상태를 확인함.
   *
   * @param request - 프래그먼트 분석 요청 객체
   * @returns 워크스페이스 스냅샷 상태 계약 정보
   */
  private getWorkspaceFreshness(
    request: FragmentAnalysisRequest,
  ): AgentMetadataWorkspaceSnapshotContract | null {
    if (!this.variableFlowService || !this.workspaceSnapshot) {
      return null;
    }

    return this.variableFlowService.getWorkspaceFreshness({
      uri: request.uri,
      version: request.version,
    });
  }

  /**
   * getStaleWorkspaceAvailability 메서드.
   * 워크스페이스 분석 결과가 만료된 경우 가용성 경고 데이터를 생성함.
   *
   * @param workspaceFreshness - 현재 최신성 상태
   * @param feature - 대상 기능 유형
   * @returns 가용성 계약 정보 또는 undefined
   */
  private getStaleWorkspaceAvailability(
    workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
    feature: 'completion' | 'hover',
  ): AgentMetadataAvailabilityContract | undefined {
    if (workspaceFreshness?.freshness !== 'stale') {
      return undefined;
    }

    return createStaleWorkspaceAvailability(feature, workspaceFreshness.detail);
  }

  /**
   * createContextualExplanation 메서드.
   * 문맥 기반 추론에 대한 Agent Metadata 설명을 생성함.
   *
   * @param source - 정보 출처 식별자
   * @param detail - 구체적인 설명 내용
   * @returns 생성된 설명 계약 객체
   */
  private createContextualExplanation(
    source: string,
    detail: string,
  ): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation('contextual-inference', source, detail);
  }

  /**
   * createScopeExplanation 메서드.
   * 스코프 분석 결과에 대한 Agent Metadata 설명을 생성함.
   *
   * @param source - 정보 출처 식별자
   * @param detail - 구체적인 설명 내용
   * @returns 생성된 설명 계약 객체
   */
  private createScopeExplanation(source: string, detail: string): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation('scope-analysis', source, detail);
  }

  /**
   * getBuiltinExplanation 메서드.
   * 빌트인 레지스트리 조회 결과에 대한 Agent Metadata 설명을 생성함.
   *
   * @param builtin - 조회된 빌트인 함수 객체
   * @param detail - 선택적인 추가 상세 설명
   * @returns 생성된 설명 계약 객체
   */
  private getBuiltinExplanation(
    builtin: CBSBuiltinFunction,
    detail?: string,
  ): AgentMetadataExplanationContract {
    return createAgentMetadataExplanation(
      'registry-lookup',
      'builtin-registry',
      detail ?? this.resolveBuiltinDetail(builtin),
    );
  }

  /**
   * resolveBuiltinKind 메서드.
   * 빌트인 함수의 특성에 따라 호버 메타데이터용 종류(kind)를 결정함.
   *
   * @param builtin - 분석 대상 빌트인 함수
   * @returns Agent Metadata에 사용할 kind 값
   */
  private resolveBuiltinKind(builtin: CBSBuiltinFunction): AgentMetadataCategoryContract['kind'] {
    if (isContextualBuiltin(builtin)) {
      return 'contextual-builtin';
    }

    return isDocOnlyBuiltin(builtin) ? 'documentation-only-builtin' : 'callable-builtin';
  }

  /**
   * resolveBuiltinDetail 메서드.
   * 빌트인 함수 유형에 적합한 상세 설명 텍스트를 생성함.
   *
   * @param builtin - 상세 설명을 생성할 빌트인 함수
   * @returns 유형별로 구분된 상세 설명 문자열
   */
  private resolveBuiltinDetail(builtin: CBSBuiltinFunction): string {
    if (isContextualBuiltin(builtin)) {
      return `Hover resolved ${builtin.name} from the builtin registry as a contextual CBS syntax entry.`;
    }

    return isDocOnlyBuiltin(builtin)
      ? `Hover resolved ${builtin.name} from the builtin registry as a documentation-only CBS syntax entry.`
      : `Hover resolved ${builtin.name} from the builtin registry as a callable CBS builtin.`;
  }
}
