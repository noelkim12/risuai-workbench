import type { ElementCBSData, LorebookRegexCorrelation, PromptChainResult } from '@/domain';
import type { LorebookStructureResult } from '@/domain/lorebook/structure';
import type { Locale } from './i18n';
import { t } from './i18n';
import { buildDiagramPanel } from './view-model';
import type { VisualizationPanel } from './visualization-types';

/** lorebook force-graph builder 입력 데이터 */
export interface LorebookGraphData {
  lorebookStructure: LorebookStructureResult | null;
  lorebookRegexCorrelation: LorebookRegexCorrelation;
  lorebookCBS: ElementCBSData[];
  regexCBS: ElementCBSData[];
}

/** lorebook 구조/변수 흐름 force-graph 패널 생성 */
export function buildLorebookGraphPanel(
  panelId: string,
  data: LorebookGraphData,
  locale: Locale,
  section = 'structure',
): VisualizationPanel | null {
  if (!data.lorebookStructure || data.lorebookStructure.entries.length < 2) return null;

  const nodes: Array<{ id: string; label: string; type: string; color: string }> = [];
  const edges: Array<{ source: string; target: string; type: string; label?: string }> = [];

  // Build nodes from lorebook entries
  for (const entry of data.lorebookStructure.entries) {
    let color = '#60a5fa'; // normal
    if (entry.constant) color = '#f87171'; // always-active
    else if (entry.selective) color = '#34d399'; // selective
    const type = entry.constant ? 'always-active' : entry.selective ? 'selective' : 'normal';
    nodes.push({ id: `lb:${entry.name}`, label: entry.name, type, color });
  }

  // Add regex script nodes
  for (const regex of data.regexCBS) {
    nodes.push({ id: `rx:${regex.elementName}`, label: regex.elementName, type: 'regex', color: '#a78bfa' });
  }

  // Edge type 1: keyword activation (entry A content → entry B activation key)
  for (const entryA of data.lorebookStructure.entries) {
    for (const entryB of data.lorebookStructure.entries) {
      if (entryA.name === entryB.name) continue;
      for (const keyword of entryB.keywords) {
        if (!keyword) continue;
        // Check if entryA's name or keywords could trigger entryB
        // We check keyword overlaps from the structure data
        const overlaps = data.lorebookStructure.keywords.overlaps;
        if (overlaps[keyword] && overlaps[keyword].includes(entryA.name) && overlaps[keyword].includes(entryB.name)) {
          edges.push({ source: `lb:${entryA.name}`, target: `lb:${entryB.name}`, type: 'keyword', label: keyword });
          break; // one edge per pair is enough
        }
      }
    }
  }

  // Edge type 2: variable flow (A writes var X, B reads var X)
  const lbCBSMap = new Map<string, { reads: Set<string>; writes: Set<string> }>();
  for (const lb of data.lorebookCBS) {
    lbCBSMap.set(lb.elementName, { reads: lb.reads, writes: lb.writes });
  }

  // LB→LB variable flow
  for (const a of data.lorebookCBS) {
    for (const b of data.lorebookCBS) {
      if (a.elementName === b.elementName) continue;
      for (const varName of a.writes) {
        if (b.reads.has(varName)) {
          edges.push({ source: `lb:${a.elementName}`, target: `lb:${b.elementName}`, type: 'variable', label: varName });
          break;
        }
      }
    }
  }

  // LB→Regex and Regex→LB variable flow
  for (const shared of data.lorebookRegexCorrelation.sharedVars) {
    for (const lb of shared.lorebookEntries) {
      for (const rx of shared.regexScripts) {
        if (shared.direction === 'lorebook->regex') {
          edges.push({ source: `lb:${lb}`, target: `rx:${rx}`, type: 'variable', label: shared.varName });
        } else if (shared.direction === 'regex->lorebook') {
          edges.push({ source: `rx:${rx}`, target: `lb:${lb}`, type: 'variable', label: shared.varName });
        } else {
          edges.push({ source: `lb:${lb}`, target: `rx:${rx}`, type: 'variable', label: shared.varName });
        }
      }
    }
  }

  // Dedupe edges
  const edgeSet = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source}→${e.target}:${e.type}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  const panel = buildDiagramPanel(
    panelId,
    t(locale, 'module.panel.lorebookGraph'),
    'force-graph',
    { nodes, edges: uniqueEdges },
    section,
    Math.max(420, Math.min(nodes.length * 40, 800)),
  );
  panel.description = t(locale, 'module.panel.lorebookGraphDesc');
  return panel;
}

/**
 * 프롬프트 체인 의존성을 D3 force-graph로 시각화하는 패널을 빌드한다.
 */
export function buildPromptChainGraphPanel(
  panelId: string,
  promptChain: PromptChainResult,
  regexCBS: Array<{ elementName: string }>,
  locale: Locale,
  section = 'chain',
): VisualizationPanel | null {
  if (promptChain.chain.length < 2) return null;

  const nodes: Array<{ id: string; label: string; type: string; color: string }> = [];
  const edges: Array<{ source: string; target: string; type: string; label?: string }> = [];

  const typeColors: Record<string, string> = {
    prompt: '#60a5fa',
    template: '#34d399',
    system: '#f59e0b',
  };
  for (const link of promptChain.chain) {
    const color = typeColors[link.type] || '#60a5fa';
    nodes.push({
      id: `chain:${link.index}:${link.name}`,
      label: `${link.name} (${link.estimatedTokens}t)`,
      type: link.type,
      color: link.unsatisfiedDeps.length > 0 ? '#f87171' : color,
    });
  }

  for (const regex of regexCBS) {
    nodes.push({ id: `rx:${regex.elementName}`, label: regex.elementName, type: 'regex', color: '#a78bfa' });
  }

  for (let i = 1; i < promptChain.chain.length; i++) {
    const prev = promptChain.chain[i - 1];
    const curr = promptChain.chain[i];
    edges.push({
      source: `chain:${prev.index}:${prev.name}`,
      target: `chain:${curr.index}:${curr.name}`,
      type: 'chain',
    });
  }

  const writerMap = new Map<string, string>();
  for (const link of promptChain.chain) {
    const nodeId = `chain:${link.index}:${link.name}`;

    for (const dep of link.satisfiedDeps) {
      const writerId = writerMap.get(dep);
      if (writerId && writerId !== nodeId) {
        edges.push({ source: writerId, target: nodeId, type: 'satisfied', label: dep });
      }
    }

    for (const dep of link.unsatisfiedDeps) {
      const rxWriter = regexCBS.find((rx) => rx.elementName.includes(dep));
      if (rxWriter) {
        edges.push({ source: `rx:${rxWriter.elementName}`, target: nodeId, type: 'unsatisfied', label: dep });
      }
    }

    for (const dep of link.satisfiedDeps) {
      writerMap.set(dep, nodeId);
    }
  }

  const edgeSet = new Set<string>();
  const uniqueEdges = edges.filter((edge) => {
    const key = `${edge.source}→${edge.target}:${edge.type}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  const panel = buildDiagramPanel(
    panelId,
    t(locale, 'preset.panel.chainDepGraph'),
    'force-graph',
    { nodes, edges: uniqueEdges },
    section,
    Math.max(420, Math.min(nodes.length * 50, 800)),
  );
  panel.description = t(locale, 'preset.panel.chainDepGraphDesc');
  return panel;
}
