import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter, buildTable } from '../markdown';
import { toWikiSlug } from '../slug';
import { lorebookIndexToNotes } from '../paths';

/**
 * Render lorebook/_index.md. Returns null when there are no entries.
 *
 * Content:
 *   - Activation mode count table
 *   - Folder-grouped entry listing (uncategorized at end)
 */
export function renderLorebookIndex(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  const stats = data.lorebookStructure.stats;
  if (stats.totalEntries === 0) return null;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'index',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'lorebook-index',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'total-entries': stats.totalEntries,
    'total-folders': stats.totalFolders,
  });

  const modeTable = buildTable(
    ['Mode', 'Count'],
    [
      ['constant', String(stats.activationModes.constant)],
      ['keyword', String(stats.activationModes.keyword)],
      ['keywordMulti', String(stats.activationModes.keywordMulti)],
      ['referenceOnly', String(stats.activationModes.referenceOnly)],
    ],
  );

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Lorebook Index',
    '',
    `${stats.totalEntries} entries · ${stats.totalFolders} folders.`,
    '',
    '## By activation mode',
    '',
    modeTable,
    '',
    '## By folder',
    '',
  ];

  const entriesByFolder = groupEntriesByFolder(data);
  const folderNames = Array.from(entriesByFolder.keys()).sort((a, b) => {
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
  });

  for (const folderName of folderNames) {
    const entries = entriesByFolder.get(folderName)!;
    const heading = folderName === '' ? '### Uncategorized' : `### ${folderName}`;
    lines.push(heading, '');
    for (const entry of entries) {
      const slug = toWikiSlug(entry.name);
      const mode = entry.mode;
      const keywordHint =
        entry.keywords && entry.keywords.length > 0
          ? ` — triggers on ${entry.keywords.map((k) => `\`${k}\``).join(', ')}`
          : '';
      lines.push(`- [${entry.name}](${slug}.md) — \`${mode}\`${keywordHint}`);
    }
    lines.push('');
  }

  lines.push('## Notes', '');
  lines.push(
    `See [\`${lorebookIndexToNotes('lorebook/_index.md')}\`](${lorebookIndexToNotes('lorebook/_index.md')}) _(optional)_.`,
  );
  lines.push('');

  return { relativePath: 'lorebook/_index.md', content: lines.join('\n') };
}

function groupEntriesByFolder(data: CharxReportData): Map<string, Array<{ name: string; mode: string; keywords?: string[] }>> {
  const groups = new Map<string, Array<{ name: string; mode: string; keywords?: string[] }>>();
  for (const entry of data.lorebookStructure.entries) {
    const folder = entry.folder ?? '';
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push({
      name: entry.name,
      mode: entry.activationMode,
      keywords: entry.keywords,
    });
  }
  return groups;
}
