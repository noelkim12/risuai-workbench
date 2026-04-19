import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { serializeFrontmatter } from '../../markdown';

/**
 * Render chains/_index.md — aggregated counts per chain category with
 * pointers to the per-category sub-indexes.
 */
export function renderChainsIndex(data: CharxReportData, ctx: RenderContext): WikiFile {
  const activationCount = data.lorebookActivationChain.summary.possibleEdges
    + data.lorebookActivationChain.summary.partialEdges;
  const entryPointCount = new Set(data.lorebookActivationChain.edges.map((e) => e.sourceId)).size;

  let luaAccessCount = 0;
  for (const artifact of data.luaArtifacts) {
    luaAccessCount += artifact.lorebookCorrelation?.loreApiCalls?.length ?? 0;
  }

  const variableCount = data.unifiedGraph.size;

  const coreHandlers = new Set<string>();
  const CORE = ['listenerEdit', 'onOutput', 'onInput', 'onButtonClick'];
  for (const artifact of data.luaArtifacts) {
    const callGraph = artifact.analyzePhase?.callGraph ?? {};
    for (const handler of CORE) {
      if (handler in callGraph) coreHandlers.add(handler);
    }
  }

  const textMentionCount = data.textMentions.length;

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'index',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'content-type': 'chains-index',
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Chains Index',
    '',
  ];

  if (activationCount > 0) {
    lines.push(
      '## Lorebook activation',
      `${activationCount} chains from ${entryPointCount} entry points. [category index](lorebook-activation/_index.md)`,
      '',
    );
  }
  if (luaAccessCount > 0) {
    lines.push(
      '## Lua → Lorebook access',
      `${luaAccessCount} direct accesses. [category index](lua-lorebook-access/_index.md)`,
      '',
    );
  }
  if (variableCount > 0) {
    lines.push(
      '## Variable flow',
      `${variableCount} tracked variables. [category index](variable-flow/_index.md)`,
      '',
    );
  }
  if (coreHandlers.size > 0) {
    lines.push(
      '## Lua callgraph',
      `${coreHandlers.size} root handlers. [category index](lua-callgraph/_index.md)`,
      '',
    );
  }
  if (textMentionCount > 0) {
    lines.push(
      '## Text mentions',
      `${textMentionCount} edges. [summary](text-mentions/_index.md)`,
      '',
    );
  }

  return { relativePath: 'chains/_index.md', content: lines.join('\n') };
}
