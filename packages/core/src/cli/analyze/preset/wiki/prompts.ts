import { estimateTokens } from '@/domain';
import type { PresetReportData, PromptSource } from '../types';
import type { RenderContext, WikiFile } from '../../shared/wiki/types';
import { buildTable, serializeFrontmatter } from '../../shared/wiki/markdown';
import { consolidatedToNotes } from '../../shared/wiki/paths';

/** Render prompts.md for preset prompt files and prompt templates. */
export function renderPresetPrompts(data: PresetReportData, ctx: RenderContext): WikiFile {
  const promptSources = [
    ...data.collected.prompts.map((prompt) => toRegistryRow('prompt', prompt)),
    ...data.collected.promptTemplates.map((template) => toRegistryRow('template', template)),
  ].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'consolidated',
    artifact: ctx.artifactKey,
    'artifact-type': 'preset',
    'content-type': 'prompts',
    'total-prompts': promptSources.length,
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const rows = promptSources.map((source) => [
    source.kind,
    source.name,
    source.type,
    String(source.tokens),
    source.reads,
    source.writes,
  ]);

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Prompts',
    '',
    `${promptSources.length} prompt sources.`,
    '',
    '## Registry',
    '',
    buildTable(['Source', 'Name', 'Type', 'Tokens', 'Reads', 'Writes'], rows),
    '',
    '## Notes',
    '',
    `See [\`${consolidatedToNotes('prompts.md')}\`](${consolidatedToNotes('prompts.md')}) _(optional)_.`,
    '',
  ];

  return { relativePath: 'prompts.md', content: lines.join('\n') };
}

function toRegistryRow(kind: 'prompt' | 'template', source: PromptSource) {
  return {
    kind,
    name: source.name,
    type: source.chainType,
    tokens: estimateTokens(source.text),
    reads: Array.from(source.reads).map((value) => `\`${value}\``).join(', ') || '—',
    writes: Array.from(source.writes).map((value) => `\`${value}\``).join(', ') || '—',
    order: source.order,
  };
}
