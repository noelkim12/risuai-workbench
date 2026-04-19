import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { serializeFrontmatter } from '../../markdown';
import { chainToNotes, chainToConsolidated } from '../../paths';
import { toWikiSlug } from '../../slug';

const CORE_HANDLERS = ['listenerEdit', 'onOutput', 'onInput', 'onButtonClick'];

/**
 * For each core Lua handler present in the artifact, render a chain file
 * that BFS-walks the intra-file call graph. Cycles are resolved the same
 * way as lorebook-activation.
 */
export function renderLuaCallgraphChains(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile[] {
  const files: WikiFile[] = [];
  for (const artifact of data.luaArtifacts) {
    // H1 drift: actual type is Map<string, Set<string>>, not Record<string, string[]>
    const callGraph = artifact.analyzePhase?.callGraph;
    if (!callGraph) continue;

    for (const handler of CORE_HANDLERS) {
      if (!callGraph.has(handler)) continue;
      files.push(renderOneHandler(handler, callGraph, ctx));
    }
  }
  return files;
}

function renderOneHandler(
  handler: string,
  callGraph: Map<string, Set<string>>,
  ctx: RenderContext,
): WikiFile {
  const slug = toWikiSlug(handler);
  const visited = new Set<string>();
  const discovered = new Set<string>();
  const steps: Array<{ node: string; depth: number }> = [];
  let cycleCount = 0;
  let maxDepth = 0;

  const queue: Array<{ node: string; depth: number }> = [{ node: handler, depth: 0 }];
  discovered.add(handler);

  while (queue.length > 0) {
    const current = queue.shift()!;
    discovered.delete(current.node);

    if (visited.has(current.node)) {
      cycleCount += 1;
      continue;
    }
    visited.add(current.node);
    steps.push(current);
    if (current.depth > maxDepth) maxDepth = current.depth;

    const callees = callGraph.get(current.node);
    if (!callees) continue;

    for (const callee of callees) {
      // Only count as cycle if target is already processed (visited)
      if (visited.has(callee)) {
        cycleCount += 1;
        continue;
      }

      // Skip if already discovered (in queue) - avoid duplicate queue entries
      if (discovered.has(callee)) {
        continue;
      }

      discovered.add(callee);
      queue.push({ node: callee, depth: current.depth + 1 });
    }
  }

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'chain',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'lua-callgraph',
    'entry-point': handler,
    hops: steps.length,
    'max-depth': maxDepth,
    'has-cycles': cycleCount > 0,
    'cycle-count': cycleCount,
    'touches-lua': true,
    'touches-variables': [],
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# Chain: Lua callgraph from \`${handler}\``,
    '',
    `**Root handler:** [\`${handler}\`](${chainToConsolidated('lua.md')}#${handler.toLowerCase()})`,
    `**Utilities reached:** ${Math.max(0, steps.length - 1)} · **Max depth:** ${maxDepth}`,
    '',
    '## Call tree',
    '',
  ];

  for (const step of steps) {
    const indent = '  '.repeat(step.depth);
    lines.push(`${indent}- \`${step.node}\``);
  }

  if (cycleCount > 0) {
    lines.push(
      '',
      `**Cycle note:** BFS detected ${cycleCount} back-edge(s) in the intra-file call graph.`,
    );
  }

  lines.push('', '## Notes', '');
  lines.push(
    `See [\`${chainToNotes(`chains/${slug}-calls.md`)}\`](${chainToNotes(`chains/${slug}-calls.md`)}) _(optional)_.`,
  );
  lines.push('');

  return { relativePath: `chains/lua-callgraph/${slug}.md`, content: lines.join('\n') };
}
