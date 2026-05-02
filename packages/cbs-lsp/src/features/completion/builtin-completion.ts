/**
 * CBS builtin completion 후보와 static block snippet 생성 유틸 모음.
 * @file packages/cbs-lsp/src/features/completion/builtin-completion.ts
 */
import { CompletionItem, CompletionItemKind, InsertTextFormat } from 'vscode-languageserver/node';
import {
  isContextualBuiltin,
  isDocOnlyBuiltin,
  type CBSBuiltinFunction,
  type CBSBuiltinRegistry,
} from 'risu-workbench-core';

import {
  createAgentMetadataExplanation,
  type AgentMetadataCategoryContract,
  type AgentMetadataEnvelope,
  type AgentMetadataExplanationContract,
} from '../../core';
import { FULL_MACRO_FILTER_TEXT_PATTERN } from './completion-text-edit';

interface BlockSnippet {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
}

interface BuiltinDeprecatedMetadata {
  message: string;
  replacement?: string;
}

export type BuiltinCompletionItemDataEnvelope = Omit<AgentMetadataEnvelope, 'cbs'> & {
  cbs: AgentMetadataEnvelope['cbs'] & {};
};

export interface BuiltinCompletionBuilderCallbacks {
  createCategoryData(
    category: AgentMetadataCategoryContract,
    explanation?: AgentMetadataExplanationContract,
  ): BuiltinCompletionItemDataEnvelope;
  createContextualExplanation(source: string, detail: string): AgentMetadataExplanationContract;
}

const BLOCK_SNIPPETS: readonly BlockSnippet[] = [
  {
    label: 'when-block',
    insertText: '{{#when ${1:condition}}}\n\t${2:body}\n{{/when}}',
    detail: 'When block snippet',
    documentation: 'Conditional block that executes body when condition is true.',
  },
  {
    label: 'when-else-block',
    insertText: '{{#when ${1:condition}}}\n\t${2:body}\n{{:else}}\n\t${3:otherwise}\n{{/when}}',
    detail: 'When-else block snippet',
    documentation: 'Conditional block with else branch.',
  },
  {
    label: 'each-block',
    insertText: '{{#each ${1:array} as ${2:item}}}\n\t{{slot::${2:item}}}\n{{/each}}',
    detail: 'Each block snippet',
    documentation: 'Iterate over array with slot variable.',
  },
  {
    label: 'escape-block',
    insertText: '{{#escape}}\n\t${1:content}\n{{/escape}}',
    detail: 'Escape block snippet',
    documentation: 'Escape CBS processing in body.',
  },
  {
    label: 'puredisplay-block',
    insertText: '{{#puredisplay}}\n\t${1:content}\n{{/puredisplay}}',
    detail: 'Pure display block snippet',
    documentation: 'Display content without evaluation.',
  },
  {
    label: 'pure-block',
    insertText: '{{#pure}}\n\t${1:content}\n{{/pure}}',
    detail: 'Pure block snippet',
    documentation: 'Keep body text literal without evaluating nested CBS macros.',
  },
  {
    label: 'func-block',
    insertText: '{{#func ${1:name} ${2:param}}}\n\t${3:body}\n{{/func}}',
    detail: 'Local function block snippet',
    documentation: 'Declare a fragment-local reusable macro body for `{{call::...}}`.',
  },
];

const SNIPPET_PLACEHOLDER_ESCAPE_PATTERN = /[\\}$]/g;

const POLISHED_ARGUMENT_LABELS: Readonly<Record<string, string>> = {
  amount: 'amount',
  condition: 'condition',
  conditionSegments: 'condition',
  defaultValue: 'default',
  iteratorExpression: 'iterable',
  operator: 'operator',
  positionName: 'position',
  propertyName: 'property',
  target: 'target',
  value: 'value',
  variableName: 'variable',
};

/**
 * buildAllFunctionCompletions 함수.
 * Registry 전체 builtin completion 후보를 prefix 기준으로 생성함.
 *
 * @param registry - CBS builtin registry
 * @param prefix - 사용자가 입력한 root prefix
 * @param unresolvedOnly - heavy field 생략 여부
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns builtin completion 후보 목록
 */
export function buildAllFunctionCompletions(
  registry: CBSBuiltinRegistry,
  prefix: string,
  unresolvedOnly: boolean,
  callbacks: BuiltinCompletionBuilderCallbacks,
): CompletionItem[] {
  const filtered = filterByPrefix(registry.getAll(), prefix);
  return filtered.map((fn) => buildBuiltinCompletionItem(fn, unresolvedOnly, callbacks));
}

/**
 * buildBlockFunctionCompletions 함수.
 * Block builtin과 static block snippet completion 후보를 생성함.
 *
 * @param registry - CBS builtin registry
 * @param prefix - 사용자가 입력한 block prefix
 * @param unresolvedOnly - heavy field 생략 여부
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns block builtin/snippet completion 후보 목록
 */
export function buildBlockFunctionCompletions(
  registry: CBSBuiltinRegistry,
  prefix: string,
  unresolvedOnly: boolean,
  callbacks: BuiltinCompletionBuilderCallbacks,
): CompletionItem[] {
  const blockFunctions = registry.getAll().filter((fn) => fn.isBlock);
  const searchPrefix = prefix.startsWith('#') ? prefix.slice(1) : prefix;
  const lowerSearchPrefix = searchPrefix.toLowerCase();
  const filtered = blockFunctions.filter((fn) => {
    const nameWithoutHash = fn.name.startsWith('#') ? fn.name.slice(1) : fn.name;
    return (
      nameWithoutHash.toLowerCase().startsWith(lowerSearchPrefix) ||
      fn.aliases.some((alias) => alias.toLowerCase().startsWith(lowerSearchPrefix))
    );
  });

  const completions: CompletionItem[] = filtered.map((fn) =>
    buildBuiltinCompletionItem(fn, unresolvedOnly, callbacks),
  );

  for (const snippet of BLOCK_SNIPPETS) {
    if (!snippet.label.toLowerCase().startsWith(lowerSearchPrefix)) {
      continue;
    }

    const item: CompletionItem = {
      label: snippet.label,
      kind: CompletionItemKind.Snippet,
      data: callbacks.createCategoryData(
        {
          category: 'snippet',
          kind: 'block-snippet',
        },
        unresolvedOnly
          ? undefined
          : callbacks.createContextualExplanation(
              'block-snippet-library',
              'Block completion appended an editor snippet from the static CBS block snippet set.',
            ),
      ),
      insertText: snippet.insertText,
      insertTextFormat: InsertTextFormat.Snippet,
      filterText: createFullMacroFilterText(snippet.insertText),
    };

    completions.push(
      unresolvedOnly
        ? item
        : {
            ...item,
            detail: snippet.detail,
            documentation: {
              kind: 'markdown',
              value: snippet.documentation,
            },
          },
    );
  }

  return completions;
}

/**
 * buildElseCompletion 함수.
 * 현재 block 구조에서 쓸 수 있는 `:else` keyword 후보를 생성함.
 *
 * @param registry - CBS builtin registry
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns else completion 후보 목록
 */
export function buildElseCompletion(
  registry: CBSBuiltinRegistry,
  callbacks: BuiltinCompletionBuilderCallbacks,
): CompletionItem[] {
  const builtin = registry.get(':else');
  if (!builtin) {
    return [];
  }

  return [
    {
      label: ':else',
      kind: CompletionItemKind.Keyword,
      data: callbacks.createCategoryData(
        {
          category: 'block-keyword',
          kind: 'else-keyword',
        },
        callbacks.createContextualExplanation(
          'else-keyword-context',
          'Completion inferred a live :else branch position from the current CBS block structure.',
        ),
      ),
      detail: 'Else keyword',
      documentation: {
        kind: 'markdown',
        value: formatFunctionDocumentation(builtin),
      },
      insertText: ':else',
    },
  ];
}

/**
 * buildCloseTagCompletion 함수.
 * 현재 block 문맥에 맞는 close tag keyword 후보를 생성함.
 *
 * @param registry - CBS builtin registry
 * @param blockKind - 열린 block 이름 또는 빈 문자열
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns close-tag completion 후보 목록
 */
export function buildCloseTagCompletion(
  registry: CBSBuiltinRegistry,
  blockKind: string,
  callbacks: BuiltinCompletionBuilderCallbacks,
): CompletionItem[] {
  const normalizedKind = blockKind.startsWith('#') ? blockKind.slice(1) : blockKind;

  if (!normalizedKind) {
    const blocks = registry.getAll().filter((fn) => fn.isBlock);
    return blocks.map((fn) => {
      const nameWithoutHash = fn.name.startsWith('#') ? fn.name.slice(1) : fn.name;
      return {
        label: `/${nameWithoutHash}`,
        kind: CompletionItemKind.Keyword,
        data: callbacks.createCategoryData(
          {
            category: 'block-keyword',
            kind: 'block-close',
          },
          callbacks.createContextualExplanation(
            'block-close-context',
            'Completion inferred a block close candidate from the open block context at the cursor.',
          ),
        ),
        detail: `Close ${nameWithoutHash} block`,
        insertText: `/${nameWithoutHash}`,
      } satisfies CompletionItem;
    });
  }

  return [
    {
      label: `/${normalizedKind}`,
      kind: CompletionItemKind.Keyword,
      data: callbacks.createCategoryData(
        {
          category: 'block-keyword',
          kind: 'block-close',
        },
        callbacks.createContextualExplanation(
          'block-close-context',
          'Completion inferred the matching block close tag from the active open block kind.',
        ),
      ),
      detail: `Close ${normalizedKind} block`,
      insertText: `/${normalizedKind}`,
      preselect: true,
    },
  ];
}

/**
 * buildBuiltinCompletionItem 함수.
 * Registry builtin metadata를 LSP completion item으로 변환함.
 *
 * @param fn - completion 후보로 만들 builtin function
 * @param unresolvedOnly - heavy field 생략 여부
 * @param callbacks - provider metadata envelope 생성 콜백
 * @returns builtin completion item
 */
export function buildBuiltinCompletionItem(
  fn: CBSBuiltinFunction,
  unresolvedOnly: boolean,
  callbacks: BuiltinCompletionBuilderCallbacks,
): CompletionItem {
  const snippetInsertText = createBuiltinSnippetInsertText(fn);
  const deprecatedProperty: Pick<CompletionItem, 'deprecated'> = {
    deprecated: getBuiltinDeprecatedMetadata(fn) !== undefined,
  };
  const item: CompletionItem = {
    label: fn.name,
    kind: fn.isBlock ? CompletionItemKind.Class : CompletionItemKind.Function,
    filterText: createFullMacroFilterText(snippetInsertText),
    data: callbacks.createCategoryData(
      getBuiltinCategory(fn),
      unresolvedOnly ? undefined : getBuiltinExplanation(fn),
    ),
    insertText: snippetInsertText ?? fn.name,
    insertTextFormat: snippetInsertText ? InsertTextFormat.Snippet : undefined,
    ...deprecatedProperty,
  };

  if (unresolvedOnly) {
    return item;
  }

  return {
    ...item,
    detail: formatFunctionDetail(fn),
    documentation: {
      kind: 'markdown',
      value: formatFunctionDocumentation(fn),
    },
  };
}

/**
 * createBuiltinSnippetInsertText 함수.
 * CBS builtin을 suggest 선택만으로 완성되는 full macro snippet 문자열로 변환함.
 *
 * @param fn - snippet을 만들 builtin function metadata
 * @returns snippet insertText
 */
export function createBuiltinSnippetInsertText(fn: CBSBuiltinFunction): string {
  if (fn.arguments.length === 0) {
    return `{{${fn.name}}}`;
  }

  if (fn.name === '#each') {
    return '{{#each ${1:iterable} ${2:key}}}{{slot::${2:key}}}{{/each}}';
  }

  if (fn.name === '#when') {
    return '{{#when::${1:condition}}}';
  }

  if (fn.isBlock) {
    const name = fn.name.startsWith('#') ? fn.name.slice(1) : fn.name;
    const placeholders = fn.arguments.map((argument, index) =>
      createSnippetPlaceholder(argument.name, index),
    );
    const headerSuffix = placeholders.length > 0 ? ` ${placeholders.join(' ')}` : '';
    return `{{#${name}${headerSuffix}}}\n\t$${fn.arguments.length + 1}\n{{/${name}}}`;
  }

  const argumentSnippet = fn.arguments
    .map((argument, index) => `::${createSnippetPlaceholder(argument.name, index, fn)}`)
    .join('');
  return `{{${fn.name}${argumentSnippet}}}`;
}

/**
 * createFullMacroFilterText 함수.
 * full macro snippet의 client-side filtering에 필요한 최소 prefix 문자열만 추출함.
 *
 * @param insertText - `{{...}}`로 시작하는 snippet insertText
 * @returns VS Code filtering에 사용할 compact prefix
 */
export function createFullMacroFilterText(insertText: string): string {
  return FULL_MACRO_FILTER_TEXT_PATTERN.exec(insertText)?.[0] ?? insertText;
}

/**
 * formatFunctionDetail 함수.
 * Builtin completion detail 문자열을 registry metadata에서 생성함.
 *
 * @param fn - detail을 만들 builtin function
 * @returns completion detail 문자열
 */
export function formatFunctionDetail(fn: CBSBuiltinFunction): string {
  if (isContextualBuiltin(fn)) {
    return fn.isBlock ? 'Contextual block syntax' : 'Contextual syntax entry';
  }

  if (isDocOnlyBuiltin(fn)) {
    return fn.isBlock ? 'Documentation-only block syntax' : 'Documentation-only syntax entry';
  }

  return fn.isBlock ? 'Callable block builtin' : 'Callable builtin function';
}

/**
 * formatFunctionDocumentation 함수.
 * Builtin documentation markdown를 registry metadata에서 생성함.
 *
 * @param fn - documentation을 만들 builtin function
 * @returns completion documentation markdown 문자열
 */
export function formatFunctionDocumentation(fn: CBSBuiltinFunction): string {
  const lines: string[] = [];
  const deprecated = getBuiltinDeprecatedMetadata(fn);

  if (deprecated) {
    lines.push(`**Deprecated:** ${deprecated.message}`);
    if (deprecated.replacement) {
      lines.push(`Use \`${deprecated.replacement}\` instead.`);
    }
    lines.push('');
  }

  if (isContextualBuiltin(fn)) {
    lines.push(
      '**Contextual syntax entry:** visible in editor docs and completion, but only meaningful in specific syntactic contexts.',
    );
  } else if (isDocOnlyBuiltin(fn)) {
    lines.push(
      '**Documentation-only syntax entry:** visible in editor docs and completion, but not a general runtime callback builtin.',
    );
  } else {
    lines.push('**Callable builtin:** available as a runtime CBS builtin.');
  }
  lines.push('');

  lines.push(fn.description);

  if (fn.arguments.length > 0) {
    lines.push('');
    lines.push('**Arguments:**');
    for (const arg of fn.arguments) {
      const required = arg.required ? '(required)' : '(optional)';
      const variadic = arg.variadic ? '...' : '';
      lines.push(`- \`${arg.name}${variadic}\` ${required}: ${arg.description}`);
    }
  }

  if (fn.aliases.length > 0) {
    lines.push('');
    lines.push(`**Aliases:** ${fn.aliases.map((alias) => `\`${alias}\``).join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * getBuiltinCategory 함수.
 * registry builtin을 block keyword vs callable builtin 기준의 stable category로 변환함.
 *
 * @param fn - completion/hover에 노출할 registry builtin 항목
 * @returns agent-friendly category contract
 */
export function getBuiltinCategory(fn: CBSBuiltinFunction): AgentMetadataCategoryContract {
  return {
    category: fn.isBlock ? 'block-keyword' : 'builtin',
    kind: isContextualBuiltin(fn)
      ? 'contextual-builtin'
      : isDocOnlyBuiltin(fn)
        ? 'documentation-only-builtin'
        : 'callable-builtin',
  };
}

/**
 * getBuiltinExplanation 함수.
 * Builtin 후보가 registry에서 온 이유를 agent metadata explanation으로 표현함.
 *
 * @param fn - explanation을 만들 builtin function
 * @returns registry lookup explanation metadata
 */
export function getBuiltinExplanation(fn: CBSBuiltinFunction): AgentMetadataExplanationContract {
  let detail: string;
  if (isContextualBuiltin(fn)) {
    detail = 'Completion surfaced this item from the builtin registry as a contextual CBS syntax entry.';
  } else if (isDocOnlyBuiltin(fn)) {
    detail =
      'Completion surfaced this item from the builtin registry as a documentation-only CBS syntax entry.';
  } else {
    detail = 'Completion surfaced this item from the builtin registry as a callable CBS builtin.';
  }

  return createAgentMetadataExplanation('registry-lookup', 'builtin-registry', detail);
}

function filterByPrefix(functions: CBSBuiltinFunction[], prefix: string): CBSBuiltinFunction[] {
  if (!prefix) {
    return functions;
  }

  const lowerPrefix = prefix.toLowerCase();
  return functions.filter(
    (fn) =>
      fn.name.toLowerCase().startsWith(lowerPrefix) ||
      fn.aliases.some((alias) => alias.toLowerCase().startsWith(lowerPrefix)),
  );
}

function createSnippetPlaceholder(
  argumentName: string,
  index: number,
  fn?: CBSBuiltinFunction,
): string {
  const label = polishArgumentLabel(argumentName, index, fn);
  return `\${${index + 1}:${escapeSnippetPlaceholderLabel(label)}}`;
}

function polishArgumentLabel(argumentName: string, index: number, fn?: CBSBuiltinFunction): string {
  if (/^arg\d+$/i.test(argumentName)) {
    if (fn?.category === 'comparison') {
      return String.fromCharCode('a'.charCodeAt(0) + index);
    }

    return `value${index + 1}`;
  }

  return POLISHED_ARGUMENT_LABELS[argumentName] ?? argumentName;
}

function escapeSnippetPlaceholderLabel(label: string): string {
  return label.replace(SNIPPET_PLACEHOLDER_ESCAPE_PATTERN, '\\$&');
}

function getBuiltinDeprecatedMetadata(
  fn: CBSBuiltinFunction,
): BuiltinDeprecatedMetadata | undefined {
  return (fn as { deprecated?: BuiltinDeprecatedMetadata })['deprecated'];
}
