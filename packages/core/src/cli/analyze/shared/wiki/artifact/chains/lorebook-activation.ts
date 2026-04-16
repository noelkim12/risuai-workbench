import type { CharxReportData } from '../../../../charx/types';
import type { RenderContext, WikiFile } from '../../types';
import { buildTable, serializeFrontmatter } from '../../markdown';
import { toLorebookEntrySlug } from '../../slug';
import {
  lorebookActivationChainToEntity,
  lorebookActivationChainToNotes,
  lorebookActivationIndexToChain,
  resolveLorebookActivationChainPath,
  resolveLorebookEntityPath,
} from '../../paths';
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
    files.push(renderOneChain(result, data, ctx));
  }
  return files;
}

export function renderLorebookActivationIndex(
  data: CharxReportData,
  ctx: RenderContext,
): WikiFile | null {
  const entryPoints = collectEntryPoints(data);
  if (entryPoints.length === 0) return null;

  const rows = entryPoints.map((entryPoint) => {
    const entry = resolveLorebookEntry(data, entryPoint);
    const displayName = entry?.name ?? entryPoint;
    const chainPath = resolveLorebookActivationChainPath(data.lorebookStructure.entries, entryPoint);
    const outboundCount = data.lorebookActivationChain.edges.filter((edge) => edge.sourceId === entryPoint).length;

    return {
      displayName,
      folder: entry?.folder ?? '(root)',
      chainPath,
      outboundCount,
    };
  });

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'index',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'lorebook-activation',
    'total-chains': rows.length,
    'generated-at': ctx.generatedAt,
    generator: `risu-workbench/analyze/wiki@${ctx.generatorVersion}`,
  });

  const tableRows = rows
    .sort((a, b) => a.chainPath.localeCompare(b.chainPath))
    .map((row) => [
      `[${row.displayName}](${lorebookActivationIndexToChain(row.chainPath)})`,
      `\`${row.folder}\``,
      String(row.outboundCount),
    ]);

  const lines: string[] = [
    frontmatter.trimEnd(),
    '',
    '# Lorebook activation',
    '',
    `${rows.length} entry-point chain pages generated from lorebook activation edges and constant-entry roots.`,
    '',
    buildTable(['Entry point', 'Folder', 'Outbound edges'], tableRows),
    '',
  ];

  return { relativePath: 'chains/lorebook-activation/_index.md', content: lines.join('\n') };
}

function collectEntryPoints(data: CharxReportData): string[] {
  const selectedByPath = new Map<string, { rawReference: string; outboundCount: number }>();

  const consider = (rawReference: string) => {
    const chainPath = resolveLorebookActivationChainPath(data.lorebookStructure.entries, rawReference);
    const outboundCount = data.lorebookActivationChain.edges.filter((edge) => edge.sourceId === rawReference).length;
    const existing = selectedByPath.get(chainPath);

    if (!existing || outboundCount > existing.outboundCount) {
      selectedByPath.set(chainPath, { rawReference, outboundCount });
    }
  };

  for (const entry of data.lorebookStructure.entries) {
    if (entry.activationMode === 'constant') consider(entry.id);
  }
  for (const edge of data.lorebookActivationChain.edges) {
    consider(edge.sourceId);
  }

  return Array.from(selectedByPath.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, value]) => value.rawReference);
}

function renderOneChain(result: BfsResult, data: CharxReportData, ctx: RenderContext): WikiFile {
  const entry = resolveLorebookEntry(data, result.entryPoint);
  const entryLabel = entry?.name ?? result.entryPoint;
  const slug = toLorebookEntrySlug(entryLabel);
  const relativePath = resolveLorebookActivationChainPath(data.lorebookStructure.entries, result.entryPoint);
  const directEdges = data.lorebookActivationChain.edges.filter((edge) => edge.sourceId === result.entryPoint);
  const touchesVariables: string[] = [];

  const frontmatter = serializeFrontmatter({
    source: 'generated',
    'page-class': 'chain',
    artifact: ctx.artifactKey,
    'artifact-type': ctx.artifactType,
    'chain-type': 'lorebook-activation',
    'entry-point': entryLabel,
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
    `# Chain: ${entryLabel} activation flow`,
    '',
    `**Entry point:** [\`${entryLabel}\`](${lorebookActivationChainToEntity(relativePath, resolveLorebookEntityPath(data.lorebookStructure.entries, result.entryPoint))})`,
    `**Hops:** ${result.hops} · **Cycles:** ${result.cycleCount}${result.hasCycles ? ' (resolved)' : ''}`,
    '',
    '## Walk',
    '',
    'This section lists only the lorebook entries referenced directly from the entry point.',
    '',
  ];

  if (directEdges.length === 0) {
    lines.push('- No direct lorebook-to-lorebook activation references found.', '');
  } else {
    directEdges.forEach((edge) => {
      const targetEntry = resolveLorebookEntry(data, edge.targetId);
      const targetLabel = targetEntry?.name ?? edge.targetId;
      const targetPath = lorebookActivationChainToEntity(
        relativePath,
        resolveLorebookEntityPath(data.lorebookStructure.entries, edge.targetId),
      );
      const reason =
        edge.status === 'possible'
          ? 'possible activation'
          : edge.status === 'partial'
            ? 'partial activation'
            : 'blocked';

      lines.push(`- [${targetLabel}](${targetPath}) — ${reason}`);
      if (edge.matchedKeywords.length > 0) {
        lines.push(`  - matched keywords: ${edge.matchedKeywords.map((k) => `\`${k}\``).join(', ')}`);
      }
      if (edge.matchedSecondaryKeywords.length > 0) {
        lines.push(
          `  - matched secondary keywords: ${edge.matchedSecondaryKeywords.map((k) => `\`${k}\``).join(', ')}`,
        );
      }
      if (edge.missingSecondaryKeywords.length > 0) {
        lines.push(
          `  - missing secondary keywords: ${edge.missingSecondaryKeywords.map((k) => `\`${k}\``).join(', ')}`,
        );
      }
      if (edge.blockedBy.length > 0) {
        lines.push(`  - blocked by: ${edge.blockedBy.map((reasonCode) => `\`${reasonCode}\``).join(', ')}`);
      }
      lines.push('');
    });
  }

  if (result.hasCycles) {
    lines.push(
      `**Cycle note:** This chain has ${result.cycleCount} back-edge(s). Analyzer stopped walking at each repeated node.`,
      '',
    );
  }

  lines.push('## Notes', '');
  const notesPath = lorebookActivationChainToNotes(relativePath, `chains/${slug}-flow.md`);
  lines.push(
    `See [\`${notesPath}\`](${notesPath}) for design intent. _(Optional.)_`,
  );
  lines.push('');

  return { relativePath, content: lines.join('\n') };
}

function resolveLorebookEntry(
  data: CharxReportData,
  rawReference: string,
): CharxReportData['lorebookStructure']['entries'][number] | undefined {
  const entryName = rawReference.includes('/')
    ? rawReference.slice(rawReference.lastIndexOf('/') + 1).trim()
    : rawReference;

  return data.lorebookStructure.entries.find(
    (entry) =>
      entry.id === rawReference ||
      entry.name === rawReference ||
      entry.name === entryName,
  );
}
