import fs from 'node:fs';
import path from 'node:path';
import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter, buildTable } from '../markdown';
import { consolidatedToNotes } from '../paths';

function listCanonicalRegexNames(extractDir: string): string[] {
  const regexDir = path.join(extractDir, 'regex');
  if (!fs.existsSync(regexDir)) return [];

  const names: string[] = [];
  for (const entry of fs.readdirSync(regexDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.risuregex')) continue;
    names.push(`[module]/${entry.name.slice(0, -'.risuregex'.length)}`);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

/**
 * Render regex.md. Returns null when the artifact has no regex scripts.
 *
 * Rendering uses regexCBS (which carries element name + reads/writes sets).
 */
export function renderRegex(data: CharxReportData, ctx: RenderContext): WikiFile | null {
  const scriptNames = new Set<string>(listCanonicalRegexNames(ctx.extractDir));
  for (const script of data.collected.regexCBS) scriptNames.add(script.elementName);
  if (scriptNames.size === 0) return null;

  const scriptsByName = new Map(data.collected.regexCBS.map((script) => [script.elementName, script] as const));

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'regex',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
    'regex-count': scriptNames.size,
  });

  const rows: string[][] = [...scriptNames].sort((a, b) => a.localeCompare(b)).map((scriptName) => {
    const script = scriptsByName.get(scriptName);
    const reads = script ? Array.from(script.reads).map((v) => `\`${v}\``).join(', ') : '';
    const writes = script ? Array.from(script.writes).map((v) => `\`${v}\``).join(', ') : '';
    return [`\`${scriptName}\``, reads || '—', writes || '—'];
  });

  const table = buildTable(['Script', 'Reads', 'Writes'], rows);

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Regex scripts',
    '',
    `${scriptNames.size} scripts.`,
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
