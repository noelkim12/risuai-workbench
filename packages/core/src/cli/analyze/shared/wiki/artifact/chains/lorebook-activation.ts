import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { serializeFrontmatter } from '../../markdown';
import { toWikiSlug } from '../../slug';
import { chainToEntity, chainToNotes } from '../../paths';
import type { LorebookActivationEdge } from '@/domain';

/** Local alias for the domain type */
type ActivationEdge = LorebookActivationEdge;

export interface BfsResult {
  entryPoint: string;
  steps: Array<{
    node: string;
    reason: string;
    matchedKeywords: string[];
  }>;
  hops: number;
  maxDepth: number;
  hasCycles: boolean;
  cycleCount: number;
}

/**
 * Breadth-first walk over the activation-chain edge list starting at entryPoint.
 * Tracks visited nodes; back-edges are counted as cycles and the walk terminates
 * at the repeated node without re-expanding it.
 * 
 * Uses a "discovered" set to avoid double-counting diamond patterns (shared
 * descendants) as cycles. Only nodes that are already *processed* (visited)
 * when we try to enqueue them count as back-edges.
 */
export function bfsLorebookActivation(args: {
  entryPoint: string;
  edges: ActivationEdge[];
}): BfsResult {
  const visited = new Set<string>();    // Nodes already processed (emitted as steps)
  const discovered = new Set<string>(); // Nodes already in queue (enqueued but not processed)
  const steps: BfsResult['steps'] = [];
  let cycleCount = 0;
  let maxDepth = 0;

  type QueueItem = { node: string; reason: string; matchedKeywords: string[]; depth: number };
  const queue: QueueItem[] = [
    { node: args.entryPoint, reason: 'entry point', matchedKeywords: [], depth: 0 },
  ];
  discovered.add(args.entryPoint);

  while (queue.length > 0) {
    const current = queue.shift()!;
    discovered.delete(current.node);
    
    if (visited.has(current.node)) {
      cycleCount += 1;
      continue;
    }
    visited.add(current.node);
    steps.push({
      node: current.node,
      reason: current.reason,
      matchedKeywords: current.matchedKeywords,
    });
    if (current.depth > maxDepth) maxDepth = current.depth;

    const outgoing = args.edges.filter((e) => e.sourceId === current.node);
    for (const edge of outgoing) {
      // Only count as cycle if target is already processed (visited)
      // If target is merely discovered (in queue), it's a diamond convergence, not a cycle
      if (visited.has(edge.targetId)) {
        cycleCount += 1;
        continue;
      }
      
      // Skip if already discovered (in queue) - avoid duplicate queue entries
      if (discovered.has(edge.targetId)) {
        continue;
      }
      
      discovered.add(edge.targetId);
      queue.push({
        node: edge.targetId,
        reason:
          edge.status === 'possible'
            ? 'possible activation'
            : edge.status === 'partial'
              ? 'partial activation'
              : 'blocked',
        matchedKeywords: edge.matchedKeywords,
        depth: current.depth + 1,
      });
    }
  }

  return {
    entryPoint: args.entryPoint,
    steps,
    hops: steps.length,
    maxDepth,
    hasCycles: cycleCount > 0,
    cycleCount,
  };
}

/** Render one chain file per distinct entry point in the activation chain. */
export function renderLorebookActivationChains(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile[] {
  const entryPoints = collectEntryPoints(data);
  if (entryPoints.length === 0) return [];

  const files: WikiFile[] = [];
  for (const entryPoint of entryPoints) {
    const result = bfsLorebookActivation({
      entryPoint,
      edges: data.lorebookActivationChain.edges as ActivationEdge[],
    });
    if (result.steps.length <= 1) continue;
    files.push(renderOneChain(result, ctx));
  }
  return files;
}

function collectEntryPoints(data: CharxReportData): string[] {
  const seen = new Set<string>();
  for (const entry of data.lorebookStructure.entries) {
    if (entry.mode === 'constant') seen.add(entry.name);
  }
  for (const edge of data.lorebookActivationChain.edges) {
    seen.add(edge.sourceId);
  }
  return Array.from(seen);
}

function renderOneChain(result: BfsResult, ctx: RenderContext): WikiFile {
  const slug = toWikiSlug(result.entryPoint);
  const touchesVariables: string[] = [];

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'chain',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'lorebook-activation',
    'entry-point': result.entryPoint,
    hops: result.hops,
    'max-depth': result.maxDepth,
    'has-cycles': result.hasCycles,
    'cycle-count': result.cycleCount,
    'touches-lua': false,
    'touches-variables': touchesVariables,
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    `# Chain: ${result.entryPoint} activation flow`,
    '',
    `**Entry point:** [\`${result.entryPoint}\`](${chainToEntity(slug)})`,
    `**Hops:** ${result.hops} · **Cycles:** ${result.cycleCount}${result.hasCycles ? ' (resolved)' : ''}`,
    '',
    '## Walk',
    '',
  ];

  result.steps.forEach((step, idx) => {
    const stepSlug = toWikiSlug(step.node);
    if (idx === 0) {
      lines.push(`### Step 1 — [${step.node}](${chainToEntity(stepSlug)}) activates`);
    } else {
      lines.push(
        `### Step ${idx + 1} → [${step.node}](${chainToEntity(stepSlug)}) (${step.reason})`,
      );
    }
    if (step.matchedKeywords.length > 0) {
      lines.push(`- matched keywords: ${step.matchedKeywords.map((k) => `\`${k}\``).join(', ')}`);
    }
    lines.push('');
  });

  if (result.hasCycles) {
    lines.push(
      `**Cycle note:** This chain has ${result.cycleCount} back-edge(s). Analyzer stopped walking at each repeated node.`,
      '',
    );
  }

  lines.push('## Notes', '');
  lines.push(
    `See [\`${chainToNotes(`chains/${slug}-flow.md`)}\`](${chainToNotes(`chains/${slug}-flow.md`)}) for design intent. _(Optional.)_`,
  );
  lines.push('');

  return { relativePath: `chains/lorebook-activation/${slug}.md`, content: lines.join('\n') };
}
