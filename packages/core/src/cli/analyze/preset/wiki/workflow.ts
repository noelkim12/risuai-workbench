import fs from 'node:fs';
import path from 'node:path';
import type { PresetReportData } from '../types';
import { buildRenderContext, defaultArtifactKey } from '../../shared/wiki/artifact/render-context';
import { generateFrontmatterMd } from '../../shared/wiki/schema/frontmatter';
import { generatePageClassesMd } from '../../shared/wiki/schema/page-classes';
import { getAllRecipes } from '../../shared/wiki/schema/recipes';
import { generateSchemaMd } from '../../shared/wiki/schema/schema';
import type { ArtifactKey, WikiFile } from '../../shared/wiki/types';
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
import { renderPresetOverview } from './overview';
import { renderPresetPromptChain } from './prompt-chain';
import { renderPresetPrompts } from './prompts';
import { renderPresetRegex } from './regex';
import { renderPresetVariables } from './variables';

export interface PresetWikiOptions {
  extractDir: string;
  wikiRoot?: string;
  artifactKey?: ArtifactKey;
}

/** Run the wiki renderer for a single preset artifact. */
export function runPresetWiki(data: PresetReportData, options: PresetWikiOptions): void {
  const resolvedExtractDir = path.resolve(options.extractDir);
  const workspaceRoot = path.dirname(resolvedExtractDir);
  const wikiRoot = options.wikiRoot
    ? path.resolve(options.wikiRoot)
    : path.join(workspaceRoot, 'wiki');

  fs.mkdirSync(wikiRoot, { recursive: true });
  const workspace = loadWorkspaceConfig(wikiRoot);
  const artifactKey =
    options.artifactKey ?? defaultArtifactKey(path.basename(resolvedExtractDir), 'preset');
  const ctx = buildRenderContext({
    artifactKey,
    artifactType: 'preset',
    wikiRoot,
    extractDir: resolvedExtractDir,
    workspace,
  });

  const artifactDir = path.join(wikiRoot, 'artifacts', artifactKey, '_generated');
  wipeArtifactDir(artifactDir);

  const files: WikiFile[] = [];
  const push = (file: WikiFile | null) => {
    if (file) files.push(file);
  };

  push(renderPresetOverview(data, ctx));
  push(renderPresetVariables(data, ctx));
  push(renderPresetRegex(data, ctx));
  push(renderPresetPrompts(data, ctx));
  push(renderPresetPromptChain(data, ctx));

  writeArtifactFiles(artifactDir, files);

  writeSchemaIfChanged(path.join(wikiRoot, 'SCHEMA.md'), generateSchemaMd());
  writeSchemaIfChanged(path.join(wikiRoot, '_schema', 'page-classes.md'), generatePageClassesMd());
  writeSchemaIfChanged(path.join(wikiRoot, '_schema', 'frontmatter.md'), generateFrontmatterMd());
  for (const recipe of getAllRecipes()) {
    writeSchemaIfChanged(path.join(wikiRoot, '_schema', 'recipes', recipe.filename), recipe.content);
  }

  const listings = scanExistingArtifacts(wikiRoot);
  rewriteIndexArtifactsSection(path.join(wikiRoot, '_index.md'), buildArtifactsSection(listings, workspace));

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
