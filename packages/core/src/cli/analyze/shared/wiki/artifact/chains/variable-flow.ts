import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { serializeFrontmatter } from '../../markdown';
import { chainToConsolidated, chainToEntity, chainToNotes } from '../../paths';
import { toWikiSlug } from '../../slug';

interface Endpoint {
  elementType: string;
  elementName: string;
}

/**
 * Produce one chain file per tracked CBS variable. Each file enumerates
 * readers and writers from the unified graph. Not a BFS — variable-flow
 * is a one-hop enumeration from the variable to its consumers.
 */
export function renderVariableFlowChains(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile[] {
  const files: WikiFile[] = [];
  for (const [varName, info] of data.unifiedGraph.entries()) {
    files.push(renderOneVariableFlow(varName, info, data, ctx));
  }
  return files;
}

function renderOneVariableFlow(
  varName: string,
  info: CharxReportData['unifiedGraph'] extends Map<string, infer V> ? V : never,
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile {
  const slug = toWikiSlug(varName);

  // Build readers and writers from sources (handling H1 type drift)
  const writers: Endpoint[] = [];
  const readers: Endpoint[] = [];

  for (const [elementType, source] of Object.entries(info.sources)) {
    for (const writerName of source.writers) {
      writers.push({ elementType, elementName: writerName });
    }
    for (const readerName of source.readers) {
      readers.push({ elementType, elementName: readerName });
    }
  }

  const touchesLua = [...readers, ...writers].some((el) => el.elementType === 'lua');

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'chain',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'variable-flow',
    'entry-point': varName,
    hops: readers.length + writers.length,
    'max-depth': 1,
    'has-cycles': false,
    'cycle-count': 0,
    'touches-lua': touchesLua,
    'touches-variables': [varName],
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# Chain: variable flow for \`${varName}\``,
    '',
    `**Default value:** \`${data.defaultVariables[varName] ?? '(none)'}\``,
    `**Readers:** ${readers.length} · **Writers:** ${writers.length}`,
    '',
    '## Written by',
    '',
  ];

  if (writers.length === 0) {
    lines.push('- (no writers detected — variable may be read-only or have only a default value)');
  } else {
    for (const writer of writers) {
      lines.push(`- ${formatEndpoint(writer)}`);
    }
  }

  lines.push('', '## Read by', '');
  if (readers.length === 0) {
    lines.push('- (no readers detected — variable may be write-only, a dead write)');
  } else {
    for (const reader of readers) {
      lines.push(`- ${formatEndpoint(reader)}`);
    }
  }

  lines.push('', '## Notes', '');
  lines.push(
    `See [\`${chainToNotes(`chains/${slug}-flow.md`)}\`](${chainToNotes(`chains/${slug}-flow.md`)}) _(optional)_.`,
  );
  lines.push('');

  return { relativePath: `chains/variable-flow/${slug}.md`, content: lines.join('\n') };

  function formatEndpoint(el: Endpoint): string {
    if (el.elementType === 'lorebook') {
      const entitySlug = toWikiSlug(el.elementName);
      return `lorebook [${el.elementName}](${chainToEntity(entitySlug)})`;
    }
    if (el.elementType === 'regex') {
      return `regex [\`${el.elementName}\`](${chainToConsolidated('regex.md')}#${el.elementName.toLowerCase()})`;
    }
    if (el.elementType === 'lua') {
      return `Lua [\`${el.elementName}\`](${chainToConsolidated('lua.md')}#${el.elementName.toLowerCase()})`;
    }
    return `${el.elementType} \`${el.elementName}\``;
  }
}
