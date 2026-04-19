import fs from 'node:fs';
import path from 'node:path';
import type { LorebookStructureResult } from '@/domain';
import type { CharxReportData, CollectResult, HtmlResult } from '../../charx/types';
import { renderArtifactWiki } from '../../shared/wiki/artifact/workflow';
import { buildRenderContext, defaultArtifactKey } from '../../shared/wiki/artifact/render-context';
import { generateFrontmatterMd } from '../../shared/wiki/schema/frontmatter';
import { generatePageClassesMd } from '../../shared/wiki/schema/page-classes';
import { getAllRecipes } from '../../shared/wiki/schema/recipes';
import { generateSchemaMd } from '../../shared/wiki/schema/schema';
import type { ArtifactKey } from '../../shared/wiki/types';
import { formatLogEntry, currentDateString } from '../../shared/wiki/workspace/log';
import { buildArtifactsSection, type ArtifactListing } from '../../shared/wiki/workspace/index-md';
import { loadWorkspaceConfig } from '../../shared/wiki/workspace/workspace-yaml';
import {
  appendLogEntry,
  rewriteIndexArtifactsSection,
  wipeArtifactDir,
  writeArtifactFiles,
  writeSchemaIfChanged,
} from '../../shared/wiki/write-protect';
import type { ModuleReportData } from '../types';

const EMPTY_LOREBOOK_STRUCTURE: LorebookStructureResult = {
  folders: [],
  entries: [],
  stats: {
    totalEntries: 0,
    totalFolders: 0,
    activationModes: { constant: 0, keyword: 0, keywordMulti: 0, referenceOnly: 0 },
    enabledCount: 0,
    withCBS: 0,
  },
  keywords: { all: [], overlaps: {} },
};

export interface ModuleWikiOptions {
  extractDir: string;
  wikiRoot?: string;
  artifactKey?: ArtifactKey;
}

/** Run the wiki renderer for a single module artifact. */
export function runModuleWiki(data: ModuleReportData, options: ModuleWikiOptions): void {
  const resolvedExtractDir = path.resolve(options.extractDir);
  const workspaceRoot = path.dirname(resolvedExtractDir);
  const wikiRoot = options.wikiRoot
    ? path.resolve(options.wikiRoot)
    : path.join(workspaceRoot, 'wiki');

  fs.mkdirSync(wikiRoot, { recursive: true });
  const workspace = loadWorkspaceConfig(wikiRoot);

  const artifactKey =
    options.artifactKey ?? defaultArtifactKey(path.basename(resolvedExtractDir), 'module');
  const ctx = buildRenderContext({
    artifactKey,
    artifactType: 'module',
    wikiRoot,
    extractDir: resolvedExtractDir,
    workspace,
  });

  const artifactDir = path.join(wikiRoot, 'artifacts', artifactKey, '_generated');
  wipeArtifactDir(artifactDir);

  const files = renderArtifactWiki(toCharxWikiInput(data), ctx);
  writeArtifactFiles(artifactDir, files);

  writeSchemaIfChanged(path.join(wikiRoot, 'SCHEMA.md'), generateSchemaMd());
  writeSchemaIfChanged(path.join(wikiRoot, '_schema', 'page-classes.md'), generatePageClassesMd());
  writeSchemaIfChanged(path.join(wikiRoot, '_schema', 'frontmatter.md'), generateFrontmatterMd());
  for (const recipe of getAllRecipes()) {
    writeSchemaIfChanged(path.join(wikiRoot, '_schema', 'recipes', recipe.filename), recipe.content);
  }

  const listings = scanExistingArtifacts(wikiRoot);
  rewriteIndexArtifactsSection(
    path.join(wikiRoot, '_index.md'),
    buildArtifactsSection(listings, workspace),
  );

  appendLogEntry(
    path.join(wikiRoot, '_log.md'),
    formatLogEntry({
      date: currentDateString(),
      operation: 'analyze',
      scope: artifactKey,
      bullets: [`regenerated _generated/ (${files.length} files)`, 'SCHEMA.md: checked'],
    }),
  );
}

function toCharxWikiInput(data: ModuleReportData): CharxReportData {
  const htmlAnalysis: HtmlResult = {
    cbsData: data.collected.htmlCBS,
    assetRefs: [],
  };
  const collected: CollectResult = {
    lorebookCBS: data.collected.lorebookCBS,
    regexCBS: data.collected.regexCBS,
    variables: { variables: {}, cbsData: [] },
    html: htmlAnalysis,
    tsCBS: [],
    luaCBS: data.collected.luaCBS,
    luaArtifacts: data.collected.luaArtifacts,
  };

  return {
    charx: null,
    characterName: data.moduleName,
    unifiedGraph: data.unifiedGraph,
    lorebookRegexCorrelation: data.lorebookRegexCorrelation,
    lorebookStructure: data.lorebookStructure ?? EMPTY_LOREBOOK_STRUCTURE,
    lorebookActivationChain: data.lorebookActivationChain,
    defaultVariables: {},
    htmlAnalysis,
    tokenBudget: data.tokenBudget,
    variableFlow: data.variableFlow,
    deadCode: data.deadCode,
    textMentions: data.textMentions,
    collected,
    luaArtifacts: data.luaArtifacts,
  };
}

function scanExistingArtifacts(wikiRoot: string): ArtifactListing[] {
  const artifactsDir = path.join(wikiRoot, 'artifacts');
  if (!fs.existsSync(artifactsDir)) return [];

  const entries = fs.readdirSync(artifactsDir, { withFileTypes: true });
  const out: ArtifactListing[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const key = entry.name;
    const type = key.startsWith('module_')
      ? 'module'
      : key.startsWith('preset_')
        ? 'preset'
        : 'character';
    out.push({ key, type });
  }
  return out;
}
