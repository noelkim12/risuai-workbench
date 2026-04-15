import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';
import { toWikiSlug } from '../slug';
import {
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
    const slug = toWikiSlug(entry.name);
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

  // Handle both fixture shape (mode) and real type (activationMode)
  const activationMode = (entry as unknown as Record<string, string>).mode ?? entry.activationMode ?? 'keyword';
  const folder = entry.folder ?? '';
  const keywords = entry.keywords ?? [];
  const secondaryKeywords = (entry as unknown as Record<string, string[]>).secondaryKeywords ?? [];

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
    extractDirName,
    `lorebooks/${slug}.risulorebook`,
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

  // Handle both fixture shape (from/to) and real type (sourceId/targetId)
  const edges = data.lorebookActivationChain.edges;
  const outbound = edges.filter((e: unknown) => {
    const edge = e as Record<string, string>;
    return (edge.from ?? edge.sourceId) === entry.name;
  });
  if (outbound.length > 0) {
    lines.push('### Activates → (outbound activation chain)');
    for (const edge of outbound) {
      const edgeRecord = edge as Record<string, string | string[]>;
      const targetName = (edgeRecord.to ?? edgeRecord.targetId) as string;
      const targetSlug = toWikiSlug(targetName);
      const matchedKeywords = (edgeRecord.matchedKeywords ?? []) as string[];
      const keywordHint = matchedKeywords.length
        ? ` — matched keyword \`${matchedKeywords.join(', ')}\``
        : '';
      lines.push(`- [${targetName}](${entityToSiblingEntity(targetSlug)})${keywordHint}`);
    }
    lines.push('');
  }

  const inbound = edges.filter((e: unknown) => {
    const edge = e as Record<string, string>;
    return (edge.to ?? edge.targetId) === entry.name;
  });
  if (inbound.length > 0) {
    lines.push('### Activated by ← (inbound activation chain)');
    for (const edge of inbound) {
      const edgeRecord = edge as Record<string, string | string[]>;
      const sourceName = (edgeRecord.from ?? edgeRecord.sourceId) as string;
      const sourceSlug = toWikiSlug(sourceName);
      const matchedKeywords = (edgeRecord.matchedKeywords ?? []) as string[];
      const keywordHint = matchedKeywords.length
        ? ` — keyword \`${matchedKeywords.join(', ')}\``
        : '';
      lines.push(`- [${sourceName}](${entityToSiblingEntity(sourceSlug)})${keywordHint}`);
    }
    lines.push('');
  }

  if (readsVars.length > 0 || writesVars.length > 0) {
    lines.push('### CBS variables');
    if (readsVars.length > 0) {
      lines.push(
        `- **reads:** ${readsVars.map((v: string) => `\`${v}\``).join(', ')} — see [variables.md](${entityToConsolidated('variables')})`,
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
        `- [\`${call.caller}\`](${entityToConsolidated('lua')}#${call.caller.toLowerCase()}) — direct via \`getLoreBooks("${call.keyword}")\``,
      );
    }
    lines.push('');
  }

  // Handle both fixture shape (source) and real type (sourceEntry)
  const textMentions = data.textMentions.filter(
    (m: unknown) => {
      const mention = m as Record<string, string>;
      return (mention.source ?? mention.sourceEntry) === entry.name && mention.type !== 'lorebook-mention';
    },
  );
  if (textMentions.length > 0) {
    lines.push('### Mentioned in content (plain text)');
    for (const mention of textMentions) {
      const mentionRecord = mention as Record<string, string>;
      if (mentionRecord.type === 'variable-mention') {
        lines.push(`- variable \`${mentionRecord.target}\``);
      } else if (mentionRecord.type === 'lua-mention') {
        lines.push(`- Lua function \`${mentionRecord.target}\``);
      }
    }
    lines.push('');
  }

  lines.push('## Chains', '');
  lines.push(
    `- Activation: [chains/lorebook-activation/${slug}](${entityToChain('lorebook-activation', slug)})`,
  );
  for (const varName of readsVars) {
    lines.push(
      `- Variable flow: [chains/variable-flow/${varName}](${entityToChain('variable-flow', varName)})`,
    );
  }
  lines.push('');

  lines.push('## Notes', '');
  lines.push(
    `See [\`${entityToNotes(`lorebook/${slug}.md`)}\`](${entityToNotes(`lorebook/${slug}.md`)}) for narrative and design intent. _(Create this file to add human/LLM commentary.)_`,
  );
  lines.push('');

  return { relativePath: `lorebook/${slug}.md`, content: lines.join('\n') };
}

function collectReadsForEntry(entryName: string, data: CharxReportData): string[] {
  const result: string[] = [];
  for (const [varName, info] of data.unifiedGraph.entries()) {
    const entry = info as unknown as Record<string, unknown>;
    const sources = entry.sources as Record<string, { readers: string[]; writers: string[] }> | undefined;
    if (sources?.lorebook?.readers?.includes(entryName)) {
      result.push(varName);
    }
  }
  return result.sort();
}

function collectWritesForEntry(entryName: string, data: CharxReportData): string[] {
  const result: string[] = [];
  for (const [varName, info] of data.unifiedGraph.entries()) {
    const entry = info as unknown as Record<string, unknown>;
    const sources = entry.sources as Record<string, { readers: string[]; writers: string[] }> | undefined;
    if (sources?.lorebook?.writers?.includes(entryName)) {
      result.push(varName);
    }
  }
  return result.sort();
}

function collectLuaAccessForEntry(
  entryName: string,
  data: CharxReportData,
): Array<{ caller: string; keyword: string }> {
  const result: Array<{ caller: string; keyword: string }> = [];
  for (const artifact of data.luaArtifacts) {
    const calls = artifact.lorebookCorrelation?.loreApiCalls ?? [];
    for (const call of calls) {
      if (call.keyword === entryName || (call as unknown as Record<string, string>).resolvedEntry === entryName) {
        result.push({ caller: call.containingFunction, keyword: call.keyword ?? '' });
      }
    }
  }
  return result;
}
