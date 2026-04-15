import type { CharxReportData } from '../../../charx/types';
import type { RenderContext, WikiFile } from '../types';
import { serializeFrontmatter } from '../markdown';
import { overviewToNotes, overviewToCompanion } from '../paths';

/** Render the overview.md manifest for one artifact. */
export function renderOverview(data: CharxReportData, ctx: RenderContext): WikiFile {
  const stats = data.lorebookStructure.stats;
  const variableCount = data.unifiedGraph.size;
  const defaultCount = Object.keys(data.defaultVariables).length;
  const luaFileCount = data.luaArtifacts.length;
  const luaFunctionCount = countLuaFunctions(data);
  const luaCoreHandlers = countLuaCoreHandlers(data);
  const regexCount = data.collected.regexCBS.length;
  const chainCount = data.lorebookActivationChain.summary.possibleEdges
    + data.lorebookActivationChain.summary.partialEdges;
  const chainEntryPointCount = countChainEntryPoints(data);

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'overview',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# ${ctx.artifactKey}`,
    '',
    `**Artifact type:** ${ctx.artifactType} · **Generated at:** ${ctx.generatedAt}`,
    '',
    '## Quick stats',
    '',
    `- ${stats.totalEntries} lorebook entries · ${stats.totalFolders} folders`,
    `- activation modes: constant ${stats.activationModes.constant} · keyword ${stats.activationModes.keyword} · keywordMulti ${stats.activationModes.keywordMulti} · referenceOnly ${stats.activationModes.referenceOnly}`,
    `- ${variableCount} variables (${defaultCount} default)`,
  ];

  if (luaFileCount > 0) {
    lines.push(
      `- ${luaFileCount} Lua files · ${luaFunctionCount} functions · ${luaCoreHandlers} core handlers`,
    );
  }
  if (regexCount > 0) {
    lines.push(`- ${regexCount} regex scripts`);
  }
  if (chainCount > 0) {
    lines.push(`- ${chainCount} activation chains from ${chainEntryPointCount} entry points`);
  }

  lines.push('', '## Contents', '');
  lines.push('- **variables** → [variables.md](variables.md)');
  if (stats.totalEntries > 0) {
    lines.push('- **lorebook** → [lorebook/_index.md](lorebook/_index.md)');
  }
  if (luaFileCount > 0) {
    lines.push('- **lua** → [lua.md](lua.md)');
  }
  if (regexCount > 0) {
    lines.push('- **regex** → [regex.md](regex.md)');
  }
  if (chainCount > 0) {
    lines.push('- **chains** → [chains/_index.md](chains/_index.md)');
  }

  lines.push('', '## DLC / Companions', '');
  const companions = ctx.workspace.companions[ctx.artifactKey] ?? [];
  if (companions.length === 0) {
    lines.push('- None declared. See `notes/POLICY.md` or `wiki/workspace.yaml` to declare companion modules.');
  } else {
    for (const companion of companions) {
      const link = `[${companion}](${overviewToCompanion(companion)})`;
      const label = ctx.workspace.labels[companion];
      lines.push(label ? `- ${link} — _"${label}"_` : `- ${link}`);
    }
  }

  lines.push('', '## Notes', '');
  lines.push(
    `See [\`${overviewToNotes('design-intent.md')}\`](${overviewToNotes('design-intent.md')}) for narrative and design intent. _(Create this file to add human/LLM commentary.)_`,
  );
  lines.push('');

  return { relativePath: 'overview.md', content: lines.join('\n') };
}

function countLuaFunctions(data: CharxReportData): number {
  let total = 0;
  for (const artifact of data.luaArtifacts) {
    total += artifact.collected.functions.filter(
      (fn) => fn.name && fn.name !== '<top-level>',
    ).length;
  }
  return total;
}

function countLuaCoreHandlers(data: CharxReportData): number {
  const CORE = new Set(['listenerEdit', 'onOutput', 'onInput', 'onButtonClick']);
  let total = 0;
  for (const artifact of data.luaArtifacts) {
    for (const fn of artifact.collected.functions) {
      if (fn.name && CORE.has(fn.name)) total += 1;
    }
  }
  return total;
}

function countChainEntryPoints(data: CharxReportData): number {
  const fromNodes = new Set(data.lorebookActivationChain.edges.map((e) => e.from));
  return fromNodes.size;
}
