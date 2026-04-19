import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter, buildTable } from '../markdown';
import { consolidatedToNotes } from '../paths';

/**
 * Render regex.md. Returns null when the artifact has no regex scripts.
 *
 * Rendering uses regexCBS (which carries element name + reads/writes sets).
 */
export function renderRegex(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  if (data.collected.regexCBS.length === 0) return null;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'regex',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'regex-count': data.collected.regexCBS.length,
  });

  const rows: string[][] = data.collected.regexCBS.map((script) => {
    const reads = Array.from(script.reads).map((v) => `\`${v}\``).join(', ');
    const writes = Array.from(script.writes).map((v) => `\`${v}\``).join(', ');
    return [`\`${script.elementName}\``, reads || '—', writes || '—'];
  });

  const table = buildTable(['Script', 'Reads', 'Writes'], rows);

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Regex scripts',
    '',
    `${data.collected.regexCBS.length} scripts.`,
    '',
    '## Registry',
    '',
    table,
    '',
    '## Notes',
    '',
    `See [\`${consolidatedToNotes('regex.md')}\`](${consolidatedToNotes('regex.md')}) _(optional)_.`,
    '',
  ];

  return { relativePath: 'regex.md', content: lines.join('\n') };
}
