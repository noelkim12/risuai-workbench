import type { PresetReportData } from '../types';
import type { RenderContext, WikiFile } from '../../shared/wiki/types';
import { serializeFrontmatter } from '../../shared/wiki/markdown';
import { consolidatedToNotes } from '../../shared/wiki/paths';

/** Render prompt-chain.md from analyzed preset prompt-chain results. */
export function renderPresetPromptChain(data: PresetReportData, ctx: RenderContext): WikiFile {
  const ordered = [...data.promptChain.chain].sort((left, right) => left.index - right.index);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'chain',
    artifact: ctx.artifactKey,
    'artifact-type': 'preset',
    'chain-type': 'prompt-flow',
    'entry-point': 'user-input',
    hops: ordered.length,
    'max-depth': ordered.length,
    'has-cycles': false,
    'cycle-count': 0,
    'touches-lua': false,
    'touches-variables': [...new Set([...data.promptChain.selfContainedVars, ...data.promptChain.externalDeps])],
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Chain: prompt-flow',
    '',
    `**Ordered prompts:** ${ordered.length}`,
    '',
    '## Walk',
    '',
  ];

  for (const link of ordered) {
    lines.push(`### Step ${link.index + 1} — \`${link.name}\``);
    lines.push(`- type: ${link.type}`);
    lines.push(`- tokens: ${link.estimatedTokens}`);
    if (link.satisfiedDeps.length > 0) {
      lines.push(`- satisfied: ${link.satisfiedDeps.map((value) => `\`${value}\``).join(', ')}`);
    }
    if (link.unsatisfiedDeps.length > 0) {
      lines.push(`- unsatisfied: ${link.unsatisfiedDeps.map((value) => `\`${value}\``).join(', ')}`);
    }
    lines.push('');
  }

  if (data.promptChain.externalDeps.length > 0) {
    lines.push('## External dependencies', '');
    for (const dependency of data.promptChain.externalDeps) {
      lines.push(`- \`${dependency}\``);
    }
    lines.push('');
  }

  if (data.promptChain.issues.length > 0) {
    lines.push('## Issues', '');
    for (const issue of data.promptChain.issues) {
      lines.push(`- [${issue.severity}] ${issue.type}: ${issue.message}`);
    }
    lines.push('');
  }

  lines.push('## Notes', '');
  lines.push(
    `See [\`${consolidatedToNotes('prompt-chain.md')}\`](${consolidatedToNotes('prompt-chain.md')}) _(optional)_.`,
  );
  lines.push('');

  return { relativePath: 'prompt-chain.md', content: lines.join('\n') };
}
