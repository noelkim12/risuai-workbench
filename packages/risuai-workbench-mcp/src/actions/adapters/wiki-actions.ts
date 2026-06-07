/**
 * Phase 4 wiki action adapters.
 * Thin wrappers over existing handlers; no handler logic rewritten.
 * @file packages/risuai-workbench-mcp/src/actions/adapters/wiki-actions.ts
 */

import { ActionRegistry } from '../registry';
import type { WorkbenchAction } from '../types';
import type { DiagnosticEnvelope } from '../../contracts/diagnostics';
import type { MutationResultEnvelope } from '../../contracts/mutation-result';

import {
  SearchWikiInputSchema,
  EnsureWikiRootInputSchema,
  RefreshWikiInputSchema,
} from '../schemas/wiki-schemas';

import type { SearchWikiInput } from '../../tools/wiki/search-wiki';
import type { EnsureWikiRootInput } from '../../tools/wiki/ensure-wiki-root';
import type { RefreshWikiInput } from '../../tools/wiki/refresh-wiki';

import {
  handleSearchWiki,
  handleEnsureWikiRoot,
  handleRefreshWiki,
} from '../../tools/wiki';

/**
 * registerWikiActions 함수.
 * Populates the ActionRegistry with wiki actions.
 * Search is read-only; ensure_root and refresh are mutation-style and
 * preserve existing mutation safety gates via context.mutationMode.
 *
 * @param registry - the ActionRegistry to populate
 */
export function registerWikiActions(registry: ActionRegistry): void {
  registry.register({
    id: 'wiki.search',
    legacyToolName: 'workbench.search_wiki',
    title: 'Search wiki',
    summary: 'Search docs, wiki, and rule resources.',
    capability: 'wiki',
    risk: 'read_only',
    inputSchema: SearchWikiInputSchema,
    execute: (input) => handleSearchWiki(input),
  } as WorkbenchAction<SearchWikiInput, DiagnosticEnvelope>);

  registry.register({
    id: 'wiki.ensure_root',
    legacyToolName: 'workbench.ensure_wiki_root',
    title: 'Ensure wiki root',
    summary: 'Create the minimal generated wiki root files when they are missing.',
    capability: 'wiki',
    risk: 'commit_mutation',
    inputSchema: EnsureWikiRootInputSchema,
    execute: (input, context) => handleEnsureWikiRoot(input, context.workspace, context.mutationMode),
  } as WorkbenchAction<EnsureWikiRootInput, DiagnosticEnvelope | MutationResultEnvelope>);

  registry.register({
    id: 'wiki.refresh',
    legacyToolName: 'workbench.refresh_wiki',
    title: 'Refresh wiki',
    summary: 'Refresh proposal-approved generated wiki files only.',
    capability: 'wiki',
    risk: 'commit_mutation',
    inputSchema: RefreshWikiInputSchema,
    execute: (input, context) => handleRefreshWiki(input, context.workspace, context.mutationMode),
  } as WorkbenchAction<RefreshWikiInput, DiagnosticEnvelope | MutationResultEnvelope>);
}
