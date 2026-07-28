import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { registerWikiActions } from '../src/actions/adapters/wiki-actions';
import { ActionRegistry } from '../src/actions/registry';
import type { ActionExecutionContext, WorkbenchAction } from '../src/actions/types';
import { handlePrepareAction, handleRunAction } from '../src/tools/facade';
import { handleRouteIntent } from '../src/tools/intent-route';
import { handleSearchWiki } from '../src/tools/wiki/search-wiki';

const context: ActionExecutionContext = {
  mutationMode: 'preview-only',
  patchStore: {
    findByIdeaId: () => null,
    getPatchPlan: () => null,
    savePatchPlan: () => {},
  },
  workspace: { ok: true, path: '/tmp/workspace', reason: null },
};

const SearchDataSchema = z.object({
  hits: z.array(z.object({
    matchedFields: z.array(z.enum(['title', 'identifier', 'body'])),
    path: z.string(),
    rankingReason: z.object({
      bodyTermMatches: z.number(),
      exactIdentifier: z.boolean(),
      exactTitle: z.boolean(),
      identifierTermMatches: z.number(),
      score: z.number(),
      titleTermMatches: z.number(),
    }),
    resourceUri: z.string(),
    scope: z.enum(['workspace', 'provider-docs']),
    snippet: z.string(),
    title: z.string(),
  })),
  query: z.string(),
  returned: z.number(),
  scope: z.enum(['workspace', 'provider-docs', 'all']),
  total: z.number(),
  truncated: z.boolean(),
});

describe('wiki exploration contract', () => {
  it('routes the reported read-only exploration request to wiki search without mutation actions', async () => {
    const result = await handleRouteIntent({
      request: 'Explore the existing generated wiki and explain this module project\'s concept, gameplay loop, and major features. Read-only; do not edit or refresh the wiki.',
      target: 'wiki',
    });

    const route = result.data?.route;
    expect(route?.intent).toBe('wiki.explore');
    expect(route?.mutationRequested).toBe(false);
    expect(route?.recommendedActions).toContain('wiki.search');
    expect(route?.recommendedActions).not.toContain('wiki.refresh');
    expect(route?.recommendedActions.every((actionId) => !actionId.startsWith('patch.'))).toBe(true);
  });

  it('resolves legacy tool names and aliases to the canonical action in prepare and run', async () => {
    const registry = new ActionRegistry();
    registerWikiActions(registry);
    const aliasedAction: WorkbenchAction = {
      aliases: ['wiki-find'],
      capability: 'wiki',
      execute: () => ({ ok: true }),
      id: 'wiki.find',
      inputSchema: z.object({}),
      legacyToolName: 'workbench.find_wiki',
      risk: 'read_only',
      summary: 'Find wiki pages.',
      title: 'Find wiki pages',
    };
    registry.register(aliasedAction);

    expect(registry.get('workbench.find_wiki')).toBe(aliasedAction);
    expect(registry.get('wiki-find')).toBe(aliasedAction);
    expect(handlePrepareAction({ actionId: 'workbench.search_wiki' }, registry)?.actionId).toBe('wiki.search');
    await expect(handleRunAction(
      { actionId: 'workbench.search_wiki', args: { query: 'project' }, dryRun: true },
      registry,
      context,
    )).resolves.toEqual({ actionId: 'wiki.search', dryRun: true, ok: true });
  });

  it('prepares wiki.search with its canonical scope contract and no caller-controlled limit', () => {
    const registry = new ActionRegistry();
    registerWikiActions(registry);

    const result = handlePrepareAction({ actionId: 'wiki.search' }, registry);

    expect(result).not.toBeNull();
    expect(result?.fields).not.toHaveProperty('limit');
    expect(result?.fields.scope).toMatchObject({
      enumValues: ['workspace', 'provider-docs', 'all'],
      required: false,
      type: 'enum',
    });
    expect(result?.runActionInput).toEqual({
      actionId: 'wiki.search',
      args: { query: 'project features', scope: 'workspace' },
    });
  });

  it('returns the top 30 ranked hits with machine-readable match evidence', async () => {
    const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'risu-wiki-search-'));
    const wikiRoot = path.join(workspaceRoot, 'wiki');
    mkdirSync(wikiRoot);
    try {
      writeFileSync(path.join(wikiRoot, '00-exact.md'), '# Encounter\n\nOverview only.\n');
      for (let index = 1; index < 35; index += 1) {
        writeFileSync(
          path.join(wikiRoot, `${String(index).padStart(2, '0')}-relation.md`),
          `# Page ${index}\n\nEncounter relation ${index}.\n`,
        );
      }

      const result = await handleSearchWiki(
        { query: 'Encounter', scope: 'workspace' },
        { ok: true, path: workspaceRoot, reason: null },
      );
      const data = SearchDataSchema.parse(result.data);

      expect(data).toMatchObject({ returned: 30, total: 35, truncated: true });
      expect(data.hits[0]).toMatchObject({
        matchedFields: ['title'],
        path: 'wiki/00-exact.md',
        rankingReason: {
          exactIdentifier: false,
          exactTitle: true,
          titleTermMatches: 1,
        },
      });
      expect(data.hits[1]?.matchedFields).toEqual(['body']);
      expect(data.hits[0]?.rankingReason.score).toBeGreaterThan(data.hits[1]?.rankingReason.score ?? 0);
    } finally {
      rmSync(workspaceRoot, { force: true, recursive: true });
    }
  });
});
