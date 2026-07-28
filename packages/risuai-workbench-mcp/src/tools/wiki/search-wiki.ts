/**
 * search_wiki tool handler.
 * Compact bounded docs search over docs/custom-extension.
 * @file packages/risuai-workbench-mcp/src/tools/wiki/search-wiki.ts
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { WorkspaceRootStatus } from '../../project/resolve-root';

export interface SearchWikiInput {
  readonly query: string;
  readonly scope?: WikiSearchScope;
}

export type WikiSearchScope = 'workspace' | 'provider-docs' | 'all';

export interface WikiPage {
  readonly path: string;
  readonly resourceUri: string;
  readonly scope: Exclude<WikiSearchScope, 'all'>;
  readonly text: string;
  readonly title: string;
}

export type WikiMatchField = 'title' | 'identifier' | 'body';

export interface WikiRankingReason {
  readonly bodyTermMatches: number;
  readonly exactIdentifier: boolean;
  readonly exactTitle: boolean;
  readonly identifierTermMatches: number;
  readonly score: number;
  readonly titleTermMatches: number;
}

const MAX_HITS = 30;
const MAX_SNIPPET = 180;

function repoRootFromHere(): string {
  return path.resolve(__dirname, '../../../../..');
}

function walkMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir).sort();
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) files.push(...walkMarkdown(fullPath));
    if (stat.isFile() && entry.endsWith('.md')) files.push(fullPath);
  }
  return files;
}

function compactSnippet(text: string, terms: readonly string[]): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const firstIndex = terms
    .map((term) => lower.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0] ?? 0;
  const start = Math.max(0, firstIndex - 50);
  const snippet = normalized.slice(start, start + MAX_SNIPPET);
  return snippet.length < normalized.length ? `${snippet.slice(0, MAX_SNIPPET - 1)}…` : snippet;
}

function titleOf(markdown: string, fallback: string): string {
  const heading = markdown.split('\n').find((line) => line.startsWith('# '));
  return heading ? heading.replace(/^#\s+/, '').trim() : fallback;
}

function countTermMatches(value: string, terms: readonly string[]): number {
  return terms.reduce((count, term) => count + Number(value.includes(term)), 0);
}

export function loadWorkspaceWikiPages(workspace: WorkspaceRootStatus): readonly WikiPage[] {
  if (!workspace.ok) return [];
  const wikiRoot = path.join(workspace.path, 'wiki');
  return walkMarkdown(wikiRoot).map((filePath) => {
    const text = readFileSync(filePath, 'utf8');
    const relativePath = path.relative(workspace.path, filePath).replace(/\\/g, '/');
    return {
      path: relativePath,
      resourceUri: `risuai-workbench://wiki/${relativePath.replace(/^wiki\//, '')}`,
      scope: 'workspace',
      text,
      title: titleOf(text, relativePath),
    };
  });
}

function loadProviderWikiPages(): readonly WikiPage[] {
  const root = repoRootFromHere();
  const docsRoot = path.join(root, 'docs/custom-extension');
  return walkMarkdown(docsRoot).map((filePath) => {
    const text = readFileSync(filePath, 'utf8');
    const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
    return {
      path: relativePath,
      resourceUri: `risuai-workbench://wiki/${relativePath.replace(/^docs\//, '')}`,
      scope: 'provider-docs',
      text,
      title: titleOf(text, relativePath),
    };
  });
}

export async function handleSearchWiki(
  input: SearchWikiInput,
  workspace?: WorkspaceRootStatus,
): Promise<DiagnosticEnvelope> {
  if (!input.query || input.query.trim().length === 0) {
    return createDiagnosticEnvelope({
      diagnostics: [{
        category: 'search',
        id: 'EMPTY_QUERY',
        message: 'Search query must not be empty.',
        path: null,
        ruleId: 'search.empty-query',
        severity: 'warning',
      }],
      status: 'domain_warning',
      tool: 'workbench.search_wiki',
    });
  }

  const normalizedQuery = input.query.trim().toLowerCase();
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  const scope = input.scope ?? (workspace?.ok ? 'workspace' : 'provider-docs');
  const pages = [
    ...(scope === 'provider-docs' || !workspace ? [] : loadWorkspaceWikiPages(workspace)),
    ...(scope === 'workspace' ? [] : loadProviderWikiPages()),
  ];
  const scored = pages
    .map((page) => {
      const title = page.title.toLowerCase();
      const identifier = path.basename(page.path, '.md').replace(/[_-]+/g, ' ').toLowerCase();
      const body = page.text.replace(/^# .*?(?:\r?\n|$)/, '').toLowerCase();
      const titleTermMatches = countTermMatches(title, terms);
      const identifierTermMatches = countTermMatches(identifier, terms);
      const bodyTermMatches = countTermMatches(body, terms);
      const exactTitle = title === normalizedQuery;
      const exactIdentifier = identifier === normalizedQuery;
      const score =
        Number(exactTitle) * 1_000 +
        Number(exactIdentifier) * 900 +
        titleTermMatches * 100 +
        identifierTermMatches * 10 +
        bodyTermMatches;
      const matchedFields: WikiMatchField[] = [
        ...(titleTermMatches > 0 ? ['title' as const] : []),
        ...(identifierTermMatches > 0 ? ['identifier' as const] : []),
        ...(bodyTermMatches > 0 ? ['body' as const] : []),
      ];
      const rankingReason: WikiRankingReason = {
        bodyTermMatches,
        exactIdentifier,
        exactTitle,
        identifierTermMatches,
        score,
        titleTermMatches,
      };
      return { matchedFields, page, rankingReason, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      const scoreDifference = right.score - left.score;
      if (scoreDifference !== 0) return scoreDifference;
      const scopeDifference = Number(left.page.scope === 'provider-docs') - Number(right.page.scope === 'provider-docs');
      return scopeDifference || left.page.path.localeCompare(right.page.path);
    });
  const hits = scored.slice(0, MAX_HITS).map((entry) => ({
    matchedFields: entry.matchedFields,
    path: entry.page.path,
    rankingReason: entry.rankingReason,
    resourceUri: entry.page.resourceUri,
    scope: entry.page.scope,
    snippet: compactSnippet(entry.page.text, terms),
    title: entry.page.title,
  }));

  return createDiagnosticEnvelope({
    data: {
      hits,
      query: input.query,
      returned: hits.length,
      scope,
      total: scored.length,
      truncated: scored.length > hits.length,
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.search_wiki',
  });
}
