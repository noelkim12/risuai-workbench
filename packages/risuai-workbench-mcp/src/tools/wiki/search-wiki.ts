/**
 * search_wiki tool handler.
 * Compact bounded docs search over docs/custom-extension.
 * @file packages/risuai-workbench-mcp/src/tools/wiki/search-wiki.ts
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { createDiagnosticEnvelope, type DiagnosticEnvelope } from '../../contracts/diagnostics';

export interface SearchWikiInput {
  query: string;
  limit?: number;
}

const MAX_HITS = 5;
const MAX_SNIPPET = 180;

function repoRootFromHere(): string {
  return path.resolve(__dirname, '../../../../..');
}

function walkMarkdown(dir: string): string[] {
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

export async function handleSearchWiki(input: SearchWikiInput): Promise<DiagnosticEnvelope> {
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

  const root = repoRootFromHere();
  const docsRoot = path.join(root, 'docs/custom-extension');
  const terms = input.query.toLowerCase().split(/\s+/).filter(Boolean);
  const limit = Math.min(input.limit ?? MAX_HITS, MAX_HITS);
  const scored = walkMarkdown(docsRoot)
    .map((filePath) => {
      const text = readFileSync(filePath, 'utf8');
      const lower = text.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (lower.includes(term) ? 1 : 0), 0);
      const relativePath = path.relative(root, filePath).replace(/\\/g, '/');
      return { filePath, relativePath, score, text };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.relativePath.localeCompare(right.relativePath));
  const hits = scored.slice(0, limit).map((entry) => ({
    path: entry.relativePath,
    resourceUri: `risuai-workbench://wiki/${entry.relativePath.replace(/^docs\//, '')}`,
    snippet: compactSnippet(entry.text, terms),
    title: titleOf(entry.text, entry.relativePath),
  }));

  return createDiagnosticEnvelope({
    data: {
      hits,
      query: input.query,
      returned: hits.length,
      total: scored.length,
      truncated: scored.length > hits.length,
    },
    diagnostics: [],
    status: 'ok',
    tool: 'workbench.search_wiki',
  });
}
