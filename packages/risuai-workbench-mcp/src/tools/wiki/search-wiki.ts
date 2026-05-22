/**
 * search_wiki tool handler.
 * Search docs/wiki/rules resources (MVP stub).
 * @file packages/risuai-workbench-mcp/src/tools/wiki/search-wiki.ts
 */

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';

export interface SearchWikiInput {
  query: string;
}

/**
 * handleSearchWiki 함수.
 * docs/wiki/rules resource를 검색함. MVP에서는 stub 응답을 반환함.
 *
 * @param input - 검색 쿼리 문자열
 * @returns diagnostic envelope에 감싸진 검색 결과
 */
export async function handleSearchWiki(
  input: SearchWikiInput,
): Promise<DiagnosticEnvelope> {
  if (!input.query || input.query.trim().length === 0) {
    return createDiagnosticEnvelope({
      diagnostics: [
        {
          category: 'search',
          id: 'EMPTY_QUERY',
          message: 'Search query must not be empty.',
          path: null,
          ruleId: 'search.empty-query',
          severity: 'warning',
        },
      ],
      status: 'domain_warning',
      tool: 'workbench.search_wiki',
    });
  }

  return createDiagnosticEnvelope({
    diagnostics: [
      {
        category: 'search',
        id: 'SEARCH_STUB',
        message: `Wiki search is not yet fully implemented. Query: "${input.query}"`,
        path: null,
        ruleId: 'search.stub',
        severity: 'info',
      },
    ],
    status: 'ok',
    tool: 'workbench.search_wiki',
  });
}
