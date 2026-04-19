import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';
import { toLorebookEntrySlug } from '../slug';
import {
  buildLorebookEntityPath,
  buildLorebookExtractPath,
  buildLorebookNotesPath,
  resolveLorebookActivationChainPath,
  resolveLorebookEntityPath,
  entityToSiblingEntity,
  entityToConsolidated,
  entityToChain,
  entityToNotes,
  entityToExtractSource,
} from '../paths';
import path from 'node:path';

/**
 * Render one WikiFile per lorebook entry.
 * Each file contains Title, metadata, Source link, Relations, Chains, Notes sections.
 */
export function renderLorebookEntities(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile[] {
  const files: WikiFile[] = [];
  const entries = data.lorebookStructure.entries;
  if (entries.length === 0) return files;

  const extractDirName = path.basename(ctx.extractDir);

  for (const entry of entries) {
    const slug = toLorebookEntrySlug(entry.name);
    const file = renderOneEntity(entry, data, ctx, extractDirName, slug);
    files.push(file);
  }
  return files;
}

function renderOneEntity(
  entry: CharxReportData['lorebookStructure']['entries'][number],
  data: CharxReportData,
  ctx: RenderContext,
  extractDirName: string,
  slug: string,
): WikiFile {
  const readsVars = collectReadsForEntry(entry.name, data);
  const writesVars = collectWritesForEntry(entry.name, data);
  const activationEntriesById = new Map(
    data.lorebookActivationChain.entries.map((activationEntry) => [activationEntry.id, activationEntry]),
  );
  const lorebookEntriesById = new Map(
    data.lorebookStructure.entries.map((lorebookEntry) => [lorebookEntry.id, lorebookEntry]),
  );

  const activationMode = entry.activationMode;
  const folder = entry.folder ?? '';
  const keywords = entry.keywords ?? [];
  const secondaryKeywords = activationEntriesById.get(entry.id)?.secondaryKeywords ?? [];
  const entityRelativePath = buildLorebookEntityPath(entry.folder, slug);
  const notesRelativePath = buildLorebookNotesPath(entry.folder, slug);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'entity',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'entry-type': 'lorebook',
    'entry-slug': slug,
    folder: folder,
    'activation-mode': activationMode,
    keywords: keywords,
    'secondary-keywords': secondaryKeywords,
    'reads-vars': readsVars,
    'writes-vars': writesVars,
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const keywordList =
    keywords.map((k: string) => `\`${k}\``).join(', ') || '(none)';
  const sourcePath = entityToExtractSource(
    entityRelativePath,
    extractDirName,
    buildLorebookExtractPath(entry.folder, slug),
  );

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# ${entry.name}`,
    '',
    `**Folder:** \`${folder || '(root)'}\` · **Mode:** \`${activationMode}\` · **Triggers on:** ${keywordList}`,
    '',
    `**Source:** [\`${sourcePath}\`](${sourcePath})`,
    '',
    '## Relations',
    '',
  ];

  const edges = data.lorebookActivationChain.edges;
  const outbound = edges.filter((edge) => edge.sourceId === entry.id);
  if (outbound.length > 0) {
    lines.push('### Activates → (outbound activation chain)');
    for (const edge of outbound) {
      const targetEntry = lorebookEntriesById.get(edge.targetId);
      const targetName = targetEntry?.name ?? edge.targetId;
      const targetPath = resolveLorebookEntityPath(data.lorebookStructure.entries, edge.targetId);
      const matchedKeywords = edge.matchedKeywords;
      const keywordHint = matchedKeywords.length
        ? ` — matched keyword \`${matchedKeywords.join(', ')}\``
        : '';
      lines.push(
        `- [${targetName}](${entityToSiblingEntity(entityRelativePath, targetPath)})${keywordHint}`,
      );
    }
    lines.push('');
  }

  const inbound = edges.filter((edge) => edge.targetId === entry.id);
  if (inbound.length > 0) {
    lines.push('### Activated by ← (inbound activation chain)');
    for (const edge of inbound) {
      const sourceEntry = lorebookEntriesById.get(edge.sourceId);
      const sourceName = sourceEntry?.name ?? edge.sourceId;
      const sourcePath = resolveLorebookEntityPath(data.lorebookStructure.entries, edge.sourceId);
      const matchedKeywords = edge.matchedKeywords;
      const keywordHint = matchedKeywords.length
        ? ` — keyword \`${matchedKeywords.join(', ')}\``
        : '';
      lines.push(
        `- [${sourceName}](${entityToSiblingEntity(entityRelativePath, sourcePath)})${keywordHint}`,
      );
    }
    lines.push('');
  }

  if (readsVars.length > 0 || writesVars.length > 0) {
    lines.push('### CBS variables');
    if (readsVars.length > 0) {
      lines.push(
        `- **reads:** ${readsVars.map((v: string) => `\`${v}\``).join(', ')} — see [variables.md](${entityToConsolidated(entityRelativePath, 'variables')})`,
      );
    }
    if (writesVars.length > 0) {
      lines.push(`- **writes:** ${writesVars.map((v: string) => `\`${v}\``).join(', ')}`);
    }
    lines.push('');
  }

  const luaAccess = collectLuaAccessForEntry(entry.name, data);
  if (luaAccess.length > 0) {
    lines.push('### Lua access');
    for (const call of luaAccess) {
      lines.push(
        `- [\`${call.caller}\`](${entityToConsolidated(entityRelativePath, 'lua')}#${call.caller.toLowerCase()}) — direct via \`${call.apiName}("${call.keyword}")\``,
      );
    }
    lines.push('');
  }

  const textMentions = data.textMentions.filter(
    (mention) => mention.sourceEntry === entry.id && mention.type !== 'lorebook-mention',
  );
  if (textMentions.length > 0) {
    lines.push('### Mentioned in content (plain text)');
    for (const mention of textMentions) {
      if (mention.type === 'variable-mention') {
        lines.push(`- variable \`${mention.target}\``);
      } else if (mention.type === 'lua-mention') {
        lines.push(`- Lua function \`${mention.target}\``);
      }
    }
    lines.push('');
  }

  lines.push('## Chains', '');
  const activationChainPath = resolveLorebookActivationChainPath(data.lorebookStructure.entries, entry.id);
  lines.push(
    `- Activation: [${activationChainPath}](${entityToChain(entityRelativePath, 'lorebook-activation', activationChainPath)})`,
  );
  for (const varName of readsVars) {
    lines.push(
      `- Variable flow: [chains/variable-flow/${varName}](${entityToChain(entityRelativePath, 'variable-flow', varName)})`,
    );
  }
  lines.push('');

  lines.push('## Notes', '');
  lines.push(
    `See [\`${entityToNotes(entityRelativePath, notesRelativePath)}\`](${entityToNotes(entityRelativePath, notesRelativePath)}) for narrative and design intent. _(Create this file to add human/LLM commentary.)_`,
  );
  lines.push('');

  return { relativePath: entityRelativePath, content: lines.join('\n') };
}

function collectReadsForEntry(entryName: string, data: CharxReportData): string[] {
  const result: string[] = [];
  for (const [varName, info] of data.unifiedGraph.entries()) {
    const sources = info.sources;
    if (sources?.lorebook?.readers?.includes(entryName)) {
      result.push(varName);
    }
  }
  return result.sort();
}

function collectWritesForEntry(entryName: string, data: CharxReportData): string[] {
  const result: string[] = [];
  for (const [varName, info] of data.unifiedGraph.entries()) {
    const sources = info.sources;
    if (sources?.lorebook?.writers?.includes(entryName)) {
      result.push(varName);
    }
  }
  return result.sort();
}

function collectLuaAccessForEntry(
  entryName: string,
  data: CharxReportData,
): Array<{ caller: string; keyword: string; apiName: string }> {
  const result: Array<{ caller: string; keyword: string; apiName: string }> = [];
  for (const artifact of data.luaArtifacts) {
    const calls = artifact.lorebookCorrelation?.loreApiCalls ?? [];
    for (const call of calls) {
      if (call.keyword === entryName) {
        result.push({
          caller: call.containingFunction,
          keyword: call.keyword ?? '',
          apiName: call.apiName,
        });
      }
    }
  }
  return result;
}
