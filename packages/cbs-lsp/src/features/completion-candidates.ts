/**
 * CBS completion의 fragment-local contextual 후보 생성 유틸 모음.
 * @file packages/cbs-lsp/src/features/completion-candidates.ts
 */
import { CompletionItem, CompletionItemKind } from 'vscode-languageserver/node';

import { collectVisibleLoopBindingsFromNodePath } from '../analyzer/scopeAnalyzer';
import {
  collectLocalFunctionDeclarations,
  resolveActiveLocalFunctionContext,
  type AgentMetadataAvailabilityContract,
  type AgentMetadataCategoryContract,
  type AgentMetadataExplanationContract,
  type AgentMetadataWorkspaceSnapshotContract,
  type FragmentCursorLookupResult,
} from '../core';
import { CbsLspTextHelper } from '../helpers/text-helper';
import type { VariableFlowService } from '../services';
import {
  buildWorkspaceChatVariableCompletions,
  buildWorkspaceToggleGlobalVariableCompletions,
  buildWorkspaceToggleNameCompletions,
  getStaleWorkspaceAvailability,
  type WorkspaceVariableCompletionBuilderCallbacks,
} from './workspace-variable-completion';

interface CalcOperatorCompletion {
  label: string;
  detail: string;
  documentation: string;
}

export interface ContextualCompletionBuilderCallbacks {
  createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
    availability?: AgentMetadataAvailabilityContract,
    workspace?: AgentMetadataWorkspaceSnapshotContract,
  ): CompletionItem['data'];
  createContextualExplanation(source: string, detail: string): AgentMetadataExplanationContract;
  createScopeExplanation(source: string, detail: string): AgentMetadataExplanationContract;
  workspaceVariableCallbacks: WorkspaceVariableCompletionBuilderCallbacks;
}

const WHEN_OPERATORS = [
  { name: 'is', description: 'Equality comparison' },
  { name: 'isnot', description: 'Inequality comparison' },
  { name: 'not', description: 'Negation' },
  { name: 'and', description: 'Logical AND' },
  { name: 'or', description: 'Logical OR' },
  { name: '>', description: 'Greater than' },
  { name: '>=', description: 'Greater than or equal' },
  { name: '<', description: 'Less than' },
  { name: '<=', description: 'Less than or equal' },
  { name: 'keep', description: 'Preserve whitespace' },
  { name: 'toggle', description: 'Check toggle state' },
  { name: 'var', description: 'Variable truthiness check' },
  { name: 'vis', description: 'Variable vs literal comparison' },
  { name: 'visnot', description: 'Variable vs literal inequality' },
  { name: 'tis', description: 'Toggle vs literal comparison' },
  { name: 'tisnot', description: 'Toggle vs literal inequality' },
  { name: 'legacy', description: 'Legacy whitespace behavior' },
];

const METADATA_KEYS = [
  { name: 'mobile', description: 'Mobile flag' },
  { name: 'local', description: 'Local flag' },
  { name: 'node', description: 'Node version' },
  { name: 'version', description: 'Version string' },
  { name: 'lang', description: 'Language code' },
  { name: 'user', description: 'User name' },
  { name: 'char', description: 'Character name' },
  { name: 'bot', description: 'Bot name (alias for char)' },
];

const CALC_OPERATORS: readonly CalcOperatorCompletion[] = [
  {
    label: '&&',
    detail: 'Logical AND',
    documentation:
      'Combines two truthy/falsey numeric operands. Upstream evaluates truthy results as `1` and falsey as `0`.',
  },
  {
    label: '||',
    detail: 'Logical OR',
    documentation: 'Returns a truthy numeric result when either side is truthy.',
  },
  {
    label: '!',
    detail: 'Logical NOT',
    documentation: 'Negates the following operand inside the calc sublanguage.',
  },
  {
    label: '==',
    detail: 'Equality operator',
    documentation: 'Compares two numeric operands for equality.',
  },
  {
    label: '=',
    detail: 'Equality operator',
    documentation:
      'Compares two numeric operands for equality. Upstream also accepts this single-character equality token directly.',
  },
  {
    label: '!=',
    detail: 'Inequality operator',
    documentation: 'Compares two numeric operands for inequality.',
  },
  {
    label: '<=',
    detail: 'Less-than-or-equal operator',
    documentation: 'Checks whether the left operand is less than or equal to the right operand.',
  },
  {
    label: '>=',
    detail: 'Greater-than-or-equal operator',
    documentation: 'Checks whether the left operand is greater than or equal to the right operand.',
  },
  { label: '+', detail: 'Addition operator', documentation: 'Adds two numeric operands.' },
  {
    label: '-',
    detail: 'Subtraction operator',
    documentation: 'Subtracts the right operand from the left operand. Unary minus is also supported.',
  },
  { label: '*', detail: 'Multiplication operator', documentation: 'Multiplies two numeric operands.' },
  { label: '/', detail: 'Division operator', documentation: 'Divides the left operand by the right operand.' },
  { label: '%', detail: 'Modulo operator', documentation: 'Returns the remainder after division.' },
  { label: '^', detail: 'Exponent operator', documentation: 'Raises the left operand to the power of the right operand.' },
  { label: 'null', detail: 'Null literal', documentation: 'Upstream normalizes `null` to `0` before evaluating the expression.' },
  { label: '(', detail: 'Open grouping', documentation: 'Starts a grouped sub-expression.' },
  { label: ')', detail: 'Close grouping', documentation: 'Ends a grouped sub-expression.' },
];

/**
 * buildCalcExpressionCompletions 함수.
 * calc sublanguage의 local/workspace variable과 operator 후보를 생성함.
 *
 * @param prefix - 현재 calc token prefix
 * @param referenceKind - `$`/`@`로 이미 좁혀진 variable 종류
 * @param lookup - fragment-local symbol table을 담은 lookup 결과
 * @param variableFlowService - workspace 변수 후보 조회 서비스
 * @param workspaceFreshness - workspace graph 후보 freshness metadata
 * @param callbacks - metadata와 workspace 후보 생성을 위한 콜백 묶음
 * @returns calc expression completion item 목록
 */
export function buildCalcExpressionCompletions(
  prefix: string,
  referenceKind: 'chat' | 'global' | null,
  lookup: FragmentCursorLookupResult,
  variableFlowService: VariableFlowService | null,
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
  const variables = symbolTable.getAllVariables();
  const normalizedPrefix = prefix.toLowerCase();

  const localVariableCompletions = variables
    .filter((variable) => {
      if (referenceKind === 'chat') {
        return variable.kind === 'chat' && variable.name.toLowerCase().startsWith(normalizedPrefix);
      }

      if (referenceKind === 'global') {
        return variable.kind === 'global' && variable.name.toLowerCase().startsWith(normalizedPrefix);
      }

      return variable.name.toLowerCase().startsWith(normalizedPrefix);
    })
    .map((variable) => {
      const marker = variable.kind === 'global' ? '@' : '$';
      return {
        label: `${marker}${variable.name}`,
        kind: CompletionItemKind.Variable,
        data: callbacks.createCategoryData(
          {
            category: 'variable',
            kind: variable.kind === 'global' ? 'global-variable' : 'chat-variable',
          },
          callbacks.createScopeExplanation(
            'calc-expression-symbol-table',
            variable.kind === 'global'
              ? 'Calc completion resolved this candidate from the analyzed global variable symbol table.'
              : 'Calc completion resolved this candidate from the analyzed chat variable symbol table.',
          ),
          variable.kind === 'global'
            ? undefined
            : getStaleWorkspaceAvailability(workspaceFreshness, 'completion'),
          variable.kind === 'global' ? undefined : (workspaceFreshness ?? undefined),
        ),
        detail:
          variable.kind === 'global'
            ? 'Calc expression global variable'
            : 'Calc expression chat variable',
        documentation: {
          kind: 'markdown',
          value:
            variable.kind === 'global'
              ? `Reads global variable **${variable.name}** inside a calc expression. ` +
                'Non-numeric values evaluate as `0`.'
              : `Reads chat variable **${variable.name}** inside a calc expression. ` +
                'Non-numeric values evaluate as `0`.',
        },
        insertText: referenceKind ? variable.name : `${marker}${variable.name}`,
      } satisfies CompletionItem;
    });

  const workspaceVariableCompletions =
    referenceKind === 'global' || !variableFlowService
      ? []
      : buildWorkspaceChatVariableCompletions(
          variableFlowService.getVariableCompletionSummaries(),
          {
            existingLabels: new Set(localVariableCompletions.map((completion) => completion.label)),
            insertBareName: referenceKind === 'chat',
            labelPrefix: '$',
            prefix,
            usage: 'calc-expression',
          },
          workspaceFreshness,
          callbacks.workspaceVariableCallbacks,
        );

  if (referenceKind) {
    return [...localVariableCompletions, ...workspaceVariableCompletions];
  }

  const operatorCompletions = CALC_OPERATORS.filter((operator) =>
    operator.label.toLowerCase().startsWith(normalizedPrefix),
  ).map(
    (operator) =>
      ({
        label: operator.label,
        kind: operator.label === 'null' ? CompletionItemKind.Constant : CompletionItemKind.Operator,
        data: callbacks.createCategoryData(
          {
            category: 'expression-operator',
            kind: 'calc-operator',
          },
          callbacks.createContextualExplanation(
            'calc-expression-operator-context',
            'Calc completion inferred an operator slot from the shared CBS expression sublanguage context.',
          ),
        ),
        detail: operator.detail,
        documentation: {
          kind: 'markdown',
          value: operator.documentation,
        },
        insertText: operator.label,
      }) satisfies CompletionItem,
  );

  return [...localVariableCompletions, ...workspaceVariableCompletions, ...operatorCompletions];
}

/**
 * buildVariableCompletions 함수.
 * fragment-local symbol table 변수와 workspace 보강 후보를 생성함.
 *
 * @param prefix - 현재 변수명 prefix
 * @param kind - 요청된 변수 namespace
 * @param lookup - fragment-local symbol table을 담은 lookup 결과
 * @param variableFlowService - workspace 변수 후보 조회 서비스
 * @param workspaceFreshness - workspace graph 후보 freshness metadata
 * @param callbacks - metadata와 workspace 후보 생성을 위한 콜백 묶음
 * @returns variable completion item 목록
 */
export function buildVariableCompletions(
  prefix: string,
  kind: 'chat' | 'temp' | 'global',
  lookup: FragmentCursorLookupResult,
  variableFlowService: VariableFlowService | null,
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
  const variables = symbolTable.getAllVariables();
  const matchingVars = variables.filter(
    (v) => v.kind === kind && v.name.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  const localCompletions = matchingVars.map(
    (v) =>
      ({
        label: v.name,
        kind: CompletionItemKind.Variable,
        data: callbacks.createCategoryData(
          {
            category: 'variable',
            kind:
              v.kind === 'global'
                ? 'global-variable'
                : v.kind === 'temp'
                  ? 'temp-variable'
                  : 'chat-variable',
          },
          callbacks.createScopeExplanation(
            kind === 'temp'
              ? 'temp-variable-symbol-table'
              : kind === 'global'
                ? 'global-variable-symbol-table'
                : 'chat-variable-symbol-table',
            kind === 'temp'
              ? 'Completion resolved this candidate from analyzed temp-variable definitions in the current fragment.'
              : kind === 'global'
                ? 'Completion resolved this candidate from analyzed global-variable references in the current fragment.'
                : 'Completion resolved this candidate from analyzed chat-variable definitions in the current fragment.',
          ),
          kind === 'chat' ? getStaleWorkspaceAvailability(workspaceFreshness, 'completion') : undefined,
          kind === 'chat' ? (workspaceFreshness ?? undefined) : undefined,
        ),
        detail: kind === 'chat' ? 'Chat variable' : kind === 'temp' ? 'Temp variable' : 'Global variable',
        documentation: {
          kind: 'markdown',
          value: `Variable **${v.name}** (${v.kind})\n\n- Definitions: ${v.definitionRanges.length}\n- References: ${v.references.length}`,
        },
        insertText: v.name,
      }) satisfies CompletionItem,
  );

  if (kind === 'global') {
    return [
      ...localCompletions,
      ...(variableFlowService
        ? buildWorkspaceToggleGlobalVariableCompletions(
            variableFlowService.getToggleCompletionSummaries(),
            prefix,
            new Set(localCompletions.map((completion) => completion.label)),
            callbacks.workspaceVariableCallbacks,
          )
        : []),
    ];
  }

  if (kind !== 'chat') {
    return localCompletions;
  }

  const workspaceCompletions = variableFlowService
    ? buildWorkspaceChatVariableCompletions(
        variableFlowService.getVariableCompletionSummaries(),
        {
          existingLabels: new Set(localCompletions.map((completion) => completion.label)),
          insertBareName: true,
          labelPrefix: '',
          prefix,
          usage: 'macro-argument',
        },
        workspaceFreshness,
        callbacks.workspaceVariableCallbacks,
      )
    : [];

  return [...localCompletions, ...workspaceCompletions];
}

/**
 * buildFunctionCompletions 함수.
 * local #func declaration 후보를 생성함.
 *
 * @param prefix - 현재 함수명 prefix
 * @param lookup - fragment-local symbol table을 담은 lookup 결과
 * @param callbacks - metadata 생성 콜백 묶음
 * @returns local function completion item 목록
 */
export function buildFunctionCompletions(
  prefix: string,
  lookup: FragmentCursorLookupResult,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const symbolTable = lookup.fragmentAnalysis.providerLookup.getSymbolTable();
  const symbolFunctions = symbolTable.getAllFunctions();
  const functionCandidates =
    symbolFunctions.length > 0
      ? symbolFunctions.map((symbol) => ({
          name: symbol.name,
          parameters: symbol.parameters,
          references: symbol.references.length,
        }))
      : collectLocalFunctionDeclarations(lookup.fragmentAnalysis.document, lookup.fragment.content).map(
          (declaration) => ({
            name: declaration.name,
            parameters: declaration.parameters,
            references: 0,
          }),
        );

  const functions = functionCandidates.filter((symbol) =>
    symbol.name.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  return functions.map((symbol) => ({
    label: symbol.name,
    kind: CompletionItemKind.Function,
    data: callbacks.createCategoryData(
      {
        category: 'contextual-token',
        kind: 'local-function',
      },
      callbacks.createContextualExplanation(
        'local-function-context',
        'Completion inferred a local #func target from the first call:: slot context.',
      ),
    ),
    detail: 'Local #func declaration for the first call:: slot',
    documentation: {
      kind: 'markdown',
      value: [
        `**Local function: ${symbol.name}**`,
        '',
        '- Meaning: insert this into the first `call::` slot to choose which fragment-local `#func` declaration to invoke.',
        symbol.parameters.length > 0
          ? `Parameters: ${symbol.parameters.map((parameter) => `\`${parameter}\``).join(', ')}`
          : 'Parameters: declared later or inferred at runtime',
        symbol.parameters.length > 0
          ? `Argument slots: ${symbol.parameters
              .map((parameter, index) => `\`arg::${index}\` → \`${parameter}\``)
              .join(', ')}`
          : 'Argument slots: no local parameter names are declared yet.',
        `Local calls: ${symbol.references}`,
      ].join('\n'),
    },
    insertText: symbol.name,
  }));
}

/**
 * buildArgumentIndexCompletions 함수.
 * active local function 문맥의 numbered argument index 후보를 생성함.
 *
 * @param prefix - 현재 index prefix
 * @param lookup - active function context 조회에 쓸 lookup 결과
 * @param callbacks - metadata 생성 콜백 묶음
 * @returns numbered argument completion item 목록
 */
export function buildArgumentIndexCompletions(
  prefix: string,
  lookup: FragmentCursorLookupResult,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const activeFunctionContext = resolveActiveLocalFunctionContext(lookup);
  const declaration = activeFunctionContext?.declaration;
  if (!declaration || declaration.parameters.length === 0) {
    return [];
  }

  const normalizedPrefix = prefix.trim();

  return declaration.parameters
    .map((parameter, index) => ({ parameter, index }))
    .filter(({ index }) => index.toString().startsWith(normalizedPrefix))
    .map(({ parameter, index }) => {
      const parameterDeclaration = declaration.parameterDeclarations[index];

      return {
        label: index.toString(),
        kind: CompletionItemKind.Constant,
        data: callbacks.createCategoryData(
          {
            category: 'contextual-token',
            kind: 'argument-index',
          },
          callbacks.createContextualExplanation(
            'active-local-function-context',
            'Completion inferred numbered arg:: slots from the active local #func / call:: context.',
          ),
        ),
        detail: `Numbered argument reference for \`${parameter}\` in the active local #func / {{call::...}} context`,
        documentation: {
          kind: 'markdown',
          value: [
            `**Numbered argument reference: arg::${index}**`,
            '',
            `- Local function: \`${declaration.name}\``,
            `- Parameter slot: ${index}`,
            `- Parameter name: \`${parameter}\``,
            parameterDeclaration
              ? `- Parameter definition: line ${parameterDeclaration.range.start.line + 1}, character ${parameterDeclaration.range.start.character + 1}`
              : '- Parameter definition: declared in the active local function header',
            `- Meaning: references the ${CbsLspTextHelper.formatOrdinal(index + 1)} call argument from the active local \`#func\` / \`{{call::...}}\` context.`,
          ].join('\n'),
        },
        insertText: index.toString(),
      } satisfies CompletionItem;
    });
}

/**
 * buildSlotAliasCompletions 함수.
 * visible #each loop alias 후보를 생성함.
 *
 * @param prefix - 현재 slot alias prefix
 * @param lookup - node path와 fragment 정보를 담은 lookup 결과
 * @param callbacks - metadata 생성 콜백 묶음
 * @returns slot alias completion item 목록
 */
export function buildSlotAliasCompletions(
  prefix: string,
  lookup: FragmentCursorLookupResult,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const visibleBindings = collectVisibleLoopBindingsFromNodePath(
    lookup.nodePath,
    lookup.fragment.content,
    lookup.fragmentLocalOffset,
  );
  const normalizedPrefix = prefix.trim().toLowerCase();

  return visibleBindings
    .filter((binding) => binding.bindingName.toLowerCase().startsWith(normalizedPrefix))
    .map((binding, index) => ({
      label: binding.bindingName,
      kind: CompletionItemKind.Variable,
      data: callbacks.createCategoryData(
        {
          category: 'contextual-token',
          kind: 'loop-alias',
        },
        callbacks.createScopeExplanation(
          'visible-loop-bindings',
          'Completion resolved a visible #each loop alias from scope analysis rather than general variables.',
        ),
      ),
      detail: index === 0 ? 'Current #each loop alias' : 'Outer #each loop alias',
      documentation: {
        kind: 'markdown',
        value: [
          `**Loop alias: ${binding.bindingName}**`,
          '',
          `- Source: \`#each ${binding.iteratorExpression} as ${binding.bindingName}\``,
          index === 0
            ? '- Scope: current `#each` block'
            : '- Scope: outer `#each` block still visible from the current cursor',
          '- Policy: `slot::` completion only offers loop aliases, never general variables.',
        ].join('\n'),
      },
      insertText: binding.bindingName,
      preselect: index === 0,
      sortText: `${index.toString().padStart(2, '0')}-${binding.bindingName}`,
    }));
}

/**
 * buildMetadataCompletions 함수.
 * static CBS metadata key catalog 후보를 생성함.
 *
 * @param prefix - 현재 metadata key prefix
 * @param callbacks - metadata 생성 콜백 묶음
 * @returns metadata key completion item 목록
 */
export function buildMetadataCompletions(
  prefix: string,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const filtered = METADATA_KEYS.filter((k) =>
    k.name.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  return filtered.map((k) => ({
    label: k.name,
    kind: CompletionItemKind.Property,
    data: callbacks.createCategoryData(
      {
        category: 'metadata-key',
        kind: 'metadata-property',
      },
      callbacks.createContextualExplanation(
        'metadata-key-catalog',
        'Completion matched a key from the static CBS metadata property catalog.',
      ),
    ),
    detail: 'Metadata key',
    documentation: {
      kind: 'markdown',
      value: `${k.description}`,
    },
    insertText: k.name,
  }));
}

/**
 * buildWhenSegmentCompletions 함수.
 * #when header segment에서 operator와 chat variable 후보를 함께 생성함.
 *
 * @param prefix - 현재 segment에서 이미 입력한 prefix
 * @param startOffset - 현재 completion segment 시작 offset
 * @param lookup - fragment-local symbol table과 분석 결과
 * @param variableFlowService - workspace 변수 후보 조회 서비스
 * @param workspaceFreshness - workspace graph 후보 사용 가능 상태
 * @param callbacks - metadata와 workspace 후보 생성을 위한 콜백 묶음
 * @returns #when segment에 표시할 completion item 목록
 */
export function buildWhenSegmentCompletions(
  prefix: string,
  startOffset: number,
  lookup: FragmentCursorLookupResult,
  variableFlowService: VariableFlowService | null,
  workspaceFreshness: AgentMetadataWorkspaceSnapshotContract | null,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const previousSegments = getWhenSegmentsBeforeOffset(lookup, startOffset);
  if (isToggleNameWhenSegment(previousSegments)) {
    return variableFlowService
      ? buildWorkspaceToggleNameCompletions(
          variableFlowService.getToggleCompletionSummaries(),
          prefix,
          callbacks.workspaceVariableCallbacks,
        )
      : [];
  }

  return [
    ...buildWhenOperatorCompletions(prefix, callbacks),
    ...buildVariableCompletions(
      prefix,
      'chat',
      lookup,
      variableFlowService,
      workspaceFreshness,
      callbacks,
    ),
  ];
}

/**
 * buildWhenOperatorCompletions 함수.
 * static #when operator catalog 후보를 생성함.
 *
 * @param prefix - 현재 operator prefix
 * @param callbacks - metadata 생성 콜백 묶음
 * @returns #when operator completion item 목록
 */
export function buildWhenOperatorCompletions(
  prefix: string,
  callbacks: ContextualCompletionBuilderCallbacks,
): CompletionItem[] {
  const filtered = WHEN_OPERATORS.filter((op) =>
    op.name.toLowerCase().startsWith(prefix.toLowerCase()),
  );

  return filtered.map((op) => ({
    label: op.name,
    kind: CompletionItemKind.Operator,
    data: callbacks.createCategoryData(
      {
        category: 'contextual-token',
        kind: 'when-operator',
      },
      callbacks.createContextualExplanation(
        'when-operator-context',
        'Completion inferred a #when operator position from the current block-header operator slot.',
      ),
    ),
    detail: 'When operator',
    documentation: {
      kind: 'markdown',
      value: `${op.description}\n\n\`\`\`cbs\n{{#when::left::${op.name}::right}}...{{/when}}\n\`\`\``,
    },
    insertText: op.name,
  }));
}

/**
 * isToggleNameWhenSegment 함수.
 * `{{#when::toggle::...}}`의 toggle 이름 argument 위치인지 판별함.
 *
 * @param previousSegments - 현재 segment 앞의 #when segment 목록
 * @returns 직전 segment가 unary `toggle` operator이면 true
 */
export function isToggleNameWhenSegment(previousSegments: readonly string[]): boolean {
  return previousSegments[previousSegments.length - 1]?.toLowerCase() === 'toggle';
}

/**
 * getWhenSegmentsBeforeOffset 함수.
 * 현재 #when segment 앞에 있는 top-level segment 목록을 단순 DSL 기준으로 추출함.
 *
 * @param lookup - fragment content와 cursor 정보를 담은 lookup 결과
 * @param startOffset - 현재 completion segment 시작 offset
 * @returns 현재 segment 앞의 #when segment 목록
 */
export function getWhenSegmentsBeforeOffset(
  lookup: FragmentCursorLookupResult,
  startOffset: number,
): readonly string[] {
  const content = lookup.fragment.content;
  const headerPrefix = content.slice(0, Math.max(0, startOffset));
  const whenStart = headerPrefix.lastIndexOf('{{#when');
  if (whenStart === -1) {
    return [];
  }

  return headerPrefix
    .slice(whenStart + '{{#when'.length)
    .split('::')
    .filter((segment, index) => index > 0 || segment.trim().length > 0)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}
