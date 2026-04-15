import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { serializeFrontmatter, buildTable } from '../../markdown';
import { chainToEntity } from '../../paths';
import { toWikiSlug } from '../../slug';

/**
 * Render a single chains/text-mentions/_index.md summarizing the textMentions
 * graph. Per-edge detail lives in each entity page's Relations section; this
 * file is counts-only.
 */
export function renderTextMentionsIndex(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile | null {
  if (data.textMentions.length === 0) return null;

  const bySource = new Map<string, number>();
  const byTargetKind = { variable: 0, 'lua-fn': 0, lorebook: 0 };

  for (const mention of data.textMentions) {
    // H1 drift: actual type uses sourceEntry (not source) and type (not targetKind)
    bySource.set(mention.sourceEntry, (bySource.get(mention.sourceEntry) ?? 0) + 1);

    // Map actual type values to targetKind categories
    const targetKind = mapTypeToTargetKind(mention.type);
    if (targetKind in byTargetKind) {
      byTargetKind[targetKind as keyof typeof byTargetKind] += 1;
    }
  }

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'index',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'text-mentions',
    'total-edges': data.textMentions.length,
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const sourceRows: string[][] = Array.from(bySource.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => {
      const slug = toWikiSlug(name);
      return [`[${name}](${chainToEntity(slug)})`, String(count)];
    });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Text mentions',
    '',
    `${data.textMentions.length} total edges. Individual edges are listed in each entity page's "Mentioned in content" section.`,
    '',
    '## By target kind',
    '',
    buildTable(
      ['Target kind', 'Count'],
      [
        ['variable', String(byTargetKind.variable)],
        ['lua-fn', String(byTargetKind['lua-fn'])],
        ['lorebook', String(byTargetKind.lorebook)],
      ],
    ),
    '',
    '## By source entity',
    '',
    buildTable(['Source', 'Mentions'], sourceRows),
    '',
  ];

  return { relativePath: 'chains/text-mentions/_index.md', content: lines.join('\n') };
}

/**
 * Map actual TextMentionEdge.type values to targetKind categories.
 * H1 drift: actual type uses 'variable-mention' | 'lua-mention' | 'lorebook-mention'
 */
function mapTypeToTargetKind(type: string): string {
  switch (type) {
    case 'variable-mention':
      return 'variable';
    case 'lua-mention':
      return 'lua-fn';
    case 'lorebook-mention':
      return 'lorebook';
    default:
      return 'unknown';
  }
}
