import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter, buildTable } from '../markdown';
import { consolidatedToNotes } from '../paths';

/** Render variables.md — consolidated registry of all CBS variables in the artifact. */
export function renderVariables(data: CharxReportData, ctx: RenderContext): WikiFile {
  const totalVars = data.unifiedGraph.size;
  const defaultVars = Object.keys(data.defaultVariables).length;
  const dynamicVars = Math.max(0, totalVars - defaultVars);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'variables',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'total-vars': totalVars,
    'default-vars': defaultVars,
  });

  const rows: string[][] = [];
  for (const [name, entry] of data.unifiedGraph.entries()) {
    const defaultValue = data.defaultVariables[name] ?? '';
    const readers = entry.readers
      .map((r) => `${r.elementName}`)
      .join(', ');
    const writers = entry.writers
      .map((w) => `${w.elementName}`)
      .join(', ');
    const chainLink = `[${name}](chains/variable-flow/${name}.md)`;
    rows.push([`\`${name}\``, `\`${defaultValue}\``, readers, writers, chainLink]);
  }

  const table = buildTable(['Name', 'Default', 'Readers', 'Writers', 'Chain'], rows);

  const defaultsJson = JSON.stringify(data.defaultVariables, null, 2);

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Variables',
    '',
    `${totalVars} total · ${defaultVars} with defaults · ${dynamicVars} dynamic.`,
    '',
    '## Registry',
    '',
    table,
    '',
    '## Defaults',
    '',
    '```json',
    defaultsJson,
    '```',
    '',
    '## Notes',
    '',
    `See [\`${consolidatedToNotes('variables.md')}\`](${consolidatedToNotes('variables.md')}) _(optional)_.`,
    '',
  ];

  return { relativePath: 'variables.md', content: lines.join('\n') };
}
