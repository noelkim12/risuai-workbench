import type { PresetReportData } from '../types';
import type { RenderContext, WikiFile } from '../../shared/wiki/types';
import { buildTable, serializeFrontmatter } from '../../shared/wiki/markdown';
import { consolidatedToNotes } from '../../shared/wiki/paths';

/** Render regex.md for preset regex scripts. */
export function renderPresetRegex(data: PresetReportData, ctx: RenderContext): WikiFile | null {
  if (data.collected.regexCBS.length === 0) return null;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': 'preset',
    'content-type': 'regex',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'regex-count': data.collected.regexCBS.length,
  });

  const rows = data.collected.regexCBS.map((script) => [
    `\`${script.elementName}\``,
    Array.from(script.reads).map((value) => `\`${value}\``).join(', ') || '—',
    Array.from(script.writes).map((value) => `\`${value}\``).join(', ') || '—',
  ]);

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Regex scripts',
    '',
    `${data.collected.regexCBS.length} scripts.`,
    '',
    '## Registry',
    '',
    buildTable(['Script', 'Reads', 'Writes'], rows),
    '',
    '## Notes',
    '',
    `See [\`${consolidatedToNotes('regex.md')}\`](${consolidatedToNotes('regex.md')}) _(optional)_.`,
    '',
  ];

  return { relativePath: 'regex.md', content: lines.join('\n') };
}
