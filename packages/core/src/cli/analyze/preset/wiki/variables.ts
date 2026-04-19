import type { PresetReportData } from '../types';
import type { RenderContext, WikiFile } from '../../shared/wiki/types';
import { buildTable, serializeFrontmatter } from '../../shared/wiki/markdown';
import { consolidatedToNotes } from '../../shared/wiki/paths';

/** Render variables.md for preset unified variables. */
export function renderPresetVariables(data: PresetReportData, ctx: RenderContext): WikiFile | null {
  const totalVars = data.unifiedGraph.size;
  if (totalVars === 0) return null;

  const defaults = Object.fromEntries(
    [...data.unifiedGraph.entries()]
      .filter(([, entry]) => entry.defaultValue !== null)
      .map(([name, entry]) => [name, entry.defaultValue]),
  );
  const defaultVars = Object.keys(defaults).length;
  const dynamicVars = Math.max(0, totalVars - defaultVars);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': 'preset',
    'content-type': 'variables',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'total-vars': totalVars,
    'default-vars': defaultVars,
  });

  const rows: string[][] = [];
  for (const [name, entry] of data.unifiedGraph.entries()) {
    const allReaders: string[] = [];
    const allWriters: string[] = [];

    for (const [elementType, source] of Object.entries(entry.sources)) {
      for (const reader of source.readers) {
        allReaders.push(`${elementType}: ${reader}`);
      }
      for (const writer of source.writers) {
        allWriters.push(`${elementType}: ${writer}`);
      }
    }

    rows.push([
      `\`${name}\``,
      `\`${entry.defaultValue ?? ''}\``,
      allReaders.join(', ') || '-',
      allWriters.join(', ') || '-',
      `[${name}](chains/variable-flow/${name}.md)`,
    ]);
  }

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Variables',
    '',
    `${totalVars} total · ${defaultVars} with defaults · ${dynamicVars} dynamic.`,
    '',
    '## Registry',
    '',
    buildTable(['Name', 'Default', 'Readers', 'Writers', 'Chain'], rows),
    '',
    '## Defaults',
    '',
    '```json',
    JSON.stringify(defaults, null, 2),
    '```',
    '',
    '## Notes',
    '',
    `See [\`${consolidatedToNotes('variables.md')}\`](${consolidatedToNotes('variables.md')}) _(optional)_.`,
    '',
  ];

  return { relativePath: 'variables.md', content: lines.join('\n') };
}
