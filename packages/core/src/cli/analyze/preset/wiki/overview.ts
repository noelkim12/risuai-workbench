import type { PresetReportData } from '../types';
import type { RenderContext, WikiFile } from '../../shared/wiki/types';
import { serializeFrontmatter } from '../../shared/wiki/markdown';
import { overviewToCompanion, overviewToNotes } from '../../shared/wiki/paths';

/** Render overview.md for a preset artifact. */
export function renderPresetOverview(data: PresetReportData, ctx: RenderContext): WikiFile {
  const promptFileCount = data.collected.prompts.length;
  const promptTemplateCount = data.collected.promptTemplates.length;
  const regexCount = data.collected.regexCBS.length;
  const variableCount = data.unifiedGraph.size;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'overview',
    artifact: ctx.artifactKey,
    'artifact-type': 'preset',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# ${ctx.artifactKey}`,
    '',
    `**Artifact type:** preset · **Generated at:** ${ctx.generatedAt}`,
    '',
    '## Quick stats',
    '',
    `- ${promptFileCount} prompt files`,
    `- ${promptTemplateCount} prompt templates`,
    `- ${regexCount} regex scripts`,
    `- ${variableCount} variables`,
    '',
    '## Contents',
    '',
    '- **prompts** → [prompts.md](prompts.md)',
    '- **prompt-chain** → [prompt-chain.md](prompt-chain.md)',
  ];

  if (variableCount > 0) {
    lines.push('- **variables** → [variables.md](variables.md)');
  }
  if (regexCount > 0) {
    lines.push('- **regex** → [regex.md](regex.md)');
  }

  lines.push('', '## DLC / Companions', '');
  const companions = ctx.workspace.companions[ctx.artifactKey] ?? [];
  if (companions.length === 0) {
    lines.push('- None declared.');
  } else {
    for (const companion of companions) {
      const link = `[${companion}](${overviewToCompanion(companion)})`;
      const label = ctx.workspace.labels[companion];
      lines.push(label ? `- ${link} — _"${label}"_` : `- ${link}`);
    }
  }

  lines.push('', '## Notes', '');
  lines.push(
    `See [\`${overviewToNotes('design-intent.md')}\`](${overviewToNotes('design-intent.md')}) _(optional)_.`,
  );
  lines.push('');

  return { relativePath: 'overview.md', content: lines.join('\n') };
}
