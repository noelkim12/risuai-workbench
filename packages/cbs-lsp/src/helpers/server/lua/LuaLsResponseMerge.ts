/**
 * LuaLS response merge helpers used by server feature handlers.
 * @file packages/cbs-lsp/src/helpers/server/lua/LuaLsResponseMerge.ts
 */

import {
  type CompletionItem,
  type CompletionList,
  type Definition,
  type Hover,
  type Location,
  type LocationLink,
  MarkupKind,
  type Range as LSPRange,
} from 'vscode-languageserver/node';

export type DefinitionResponse = Definition | LocationLink[];
type DefinitionEntry = Location | LocationLink;

/**
 * normalizeHoverContentsMarkdown 함수.
 * LSP hover contents를 markdown 병합용 문자열로 정규화함.
 *
 * @param contents - LSP Hover.contents payload
 * @returns markdown 문자열 또는 빈 문자열
 */
export function normalizeHoverContentsMarkdown(contents: Hover['contents']): string {
  if (typeof contents === 'string') {
    return contents;
  }

  if (Array.isArray(contents)) {
    return contents
      .map((entry) => normalizeHoverContentsMarkdown(entry))
      .filter(Boolean)
      .join('\n\n');
  }

  if (typeof contents === 'object' && contents !== null) {
    const record = contents as Record<string, unknown>;
    if (typeof record.value === 'string') {
      return record.value;
    }

    if (typeof record.language === 'string' && typeof record.value === 'string') {
      return `\`\`\`${record.language}\n${record.value}\n\`\`\``;
    }
  }

  return '';
}

/**
 * mergeCbsAndLuaHover 함수.
 * `.risulua`에서 LuaLS hover와 CBS hover가 둘 다 있을 때 markdown 섹션으로 합침.
 *
 * @param cbsHover - CBS provider가 계산한 hover 결과
 * @param luaHover - LuaLS proxy와 RisuAI overlay가 계산한 hover 결과
 * @returns 둘 중 하나 또는 병합된 hover 결과
 */
export function mergeCbsAndLuaHover(cbsHover: Hover | null, luaHover: Hover | null): Hover | null {
  if (!luaHover) {
    return cbsHover;
  }

  if (!cbsHover) {
    return luaHover;
  }

  const cbsMarkdown = normalizeHoverContentsMarkdown(cbsHover.contents);
  const luaMarkdown = normalizeHoverContentsMarkdown(luaHover.contents);

  return {
    ...luaHover,
    contents: {
      kind: MarkupKind.Markdown,
      value: [cbsMarkdown, luaMarkdown].filter(Boolean).join('\n\n---\n\n'),
    },
    range: cbsHover.range ?? luaHover.range,
  };
}

/**
 * collectCompletionResponseLabels 함수.
 * LuaLS completion response shape와 array shape 모두에서 label set을 추출함.
 *
 * @param response - LuaLS 또는 merged completion response
 * @returns completion label set
 */
export function collectCompletionResponseLabels(
  response: CompletionItem[] | CompletionList,
): ReadonlySet<string> {
  const items = Array.isArray(response) ? response : response.items;
  return new Set(items.map((item) => item.label));
}

/**
 * mergeDefinitions 함수.
 * CBS와 LuaLS definition 응답을 같은 LSP Definition 배열로 합치고 중복 target을 제거함.
 *
 * @param cbsDefinition - CBS provider definition 결과
 * @param luaDefinition - LuaLS proxy definition 결과
 * @returns 병합된 definition 결과
 */
export function mergeDefinitions(
  cbsDefinition: DefinitionResponse | null,
  luaDefinition: DefinitionResponse | null,
): DefinitionResponse | null {
  const entries = [cbsDefinition, luaDefinition]
    .flatMap<DefinitionEntry>((definition) => {
      if (!definition) {
        return [];
      }

      return Array.isArray(definition) ? definition : [definition];
    });

  if (entries.length === 0) {
    return null;
  }

  const seen = new Set<string>();
  const merged = entries.filter((entry) => {
    const uri = 'targetUri' in entry ? String(entry.targetUri) : entry.uri;
    const range = ('targetRange' in entry ? entry.targetRange : entry.range) as LSPRange;
    const key = `${uri}:${range.start.line}:${range.start.character}:${range.end.line}:${range.end.character}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return merged as DefinitionResponse;
}
