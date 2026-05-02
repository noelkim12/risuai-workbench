/**
 * Lorebook activation-chain Layer 3 query surface.
 * @file packages/cbs-lsp/src/services/activation-chain-service.ts
 */

import type {
  GenericRecord,
  LorebookActivationChainResult,
  LorebookActivationEdge,
  LorebookActivationEdgeStatus,
  LorebookActivationEntry,
} from 'risu-workbench-core';
import { analyzeLorebookActivationChains } from 'risu-workbench-core';

import { createCbsAgentProtocolMarker, type CbsAgentProtocolMarker } from '../core';
import type { ElementRegistry, ElementRegistryFileRecord } from '../indexer';

type ActivationCycleVisitReason = 'possible activation' | 'partial activation';

/**
 * ActivationChainCycleStep 타입.
 * BFS 체인 요약에서 한 hop의 lorebook entry와 이유를 표현함.
 *
 * @param entryId - 현재 step이 가리키는 lorebook entry id
 * @param reason - 이 step이 큐에 들어온 이유
 * @param matchedKeywords - 이 hop에서 매칭된 lorebook keyword 목록
 */
export interface ActivationChainCycleStep {
  entryId: string;
  reason: 'entry point' | ActivationCycleVisitReason;
  matchedKeywords: readonly string[];
}

/**
 * ActivationChainCycleSummary 타입.
 * lorebook entry 하나를 시작점으로 BFS walk 했을 때의 순환 요약.
 *
 * @param entryId - BFS 시작 lorebook entry id
 * @param steps - walk 중 실제 방문한 step 목록
 * @param hops - 방문 step 수
 * @param maxDepth - 가장 깊은 hop depth
 * @param hasCycles - 순환 back-edge 존재 여부
 * @param cycleCount - 감지된 cycle/back-edge 개수
 */
export interface ActivationChainCycleSummary {
  entryId: string;
  steps: readonly ActivationChainCycleStep[];
  hops: number;
  maxDepth: number;
  hasCycles: boolean;
  cycleCount: number;
}

/**
 * ActivationChainEntryMatch 타입.
 * 현재 entry와 연결된 반대편 lorebook entry와 edge 메타를 함께 담음.
 *
 * @param entry - core activation entry metadata
 * @param edge - 두 lorebook 사이의 원본 activation edge
 * @param uri - 연결된 canonical lorebook file URI
 * @param relativePath - 연결된 workspace relative path
 */
export interface ActivationChainEntryMatch {
  entry: LorebookActivationEntry;
  edge: LorebookActivationEdge;
  uri: string | null;
  relativePath: string | null;
}

/**
 * ActivationChainQueryResult 타입.
 * lorebook entry 하나에 대한 cross-entry activation chain 조회 결과.
 *
 * @param entry - 현재 entry metadata
 * @param file - entry가 속한 canonical lorebook file
 * @param incoming - 나를 활성화할 수 있는 lorebook edge 목록
 * @param outgoing - 내가 활성화할 수 있는 lorebook edge 목록
 * @param possibleIncoming - incoming 중 possible status만 모은 목록
 * @param possibleOutgoing - outgoing 중 possible status만 모은 목록
 * @param partialIncoming - incoming 중 partial status만 모은 목록
 * @param partialOutgoing - outgoing 중 partial status만 모은 목록
 * @param blockedIncoming - incoming 중 blocked status만 모은 목록
 * @param blockedOutgoing - outgoing 중 blocked status만 모은 목록
 * @param cycle - 현재 entry를 시작점으로 한 BFS cycle summary
 */
export interface ActivationChainQueryResult extends CbsAgentProtocolMarker {
  entry: LorebookActivationEntry;
  file: ElementRegistryFileRecord;
  incoming: readonly ActivationChainEntryMatch[];
  outgoing: readonly ActivationChainEntryMatch[];
  possibleIncoming: readonly ActivationChainEntryMatch[];
  possibleOutgoing: readonly ActivationChainEntryMatch[];
  partialIncoming: readonly ActivationChainEntryMatch[];
  partialOutgoing: readonly ActivationChainEntryMatch[];
  blockedIncoming: readonly ActivationChainEntryMatch[];
  blockedOutgoing: readonly ActivationChainEntryMatch[];
  cycle: ActivationChainCycleSummary;
}

/**
 * ActivationChainServiceCreateOptions 타입.
 * activation chain service가 필요로 하는 registry와 recursive scanning seed를 전달함.
 *
 * @param registry - lorebook file text와 URI lookup을 제공하는 Layer 1 registry
 * @param recursiveScanning - workspace 기본 recursive scanning 활성 여부
 */
export interface ActivationChainServiceCreateOptions {
  registry: ElementRegistry;
  recursiveScanning?: boolean;
}

/**
 * ActivationChainService 클래스.
 * canonical lorebook file을 core activation-chain 분석으로 묶어 provider가 재사용할
 * cross-entry query surface를 제공함.
 */
export class ActivationChainService {
  private readonly registry: ElementRegistry;

  private readonly result: LorebookActivationChainResult;

  private readonly entryById: ReadonlyMap<string, LorebookActivationEntry>;

  private readonly fileByEntryId: ReadonlyMap<string, ElementRegistryFileRecord>;

  private readonly incomingByEntryId: ReadonlyMap<string, readonly ActivationChainEntryMatch[]>;

  private readonly outgoingByEntryId: ReadonlyMap<string, readonly ActivationChainEntryMatch[]>;

  private readonly cycleByEntryId: ReadonlyMap<string, ActivationChainCycleSummary>;

  constructor(options: ActivationChainServiceCreateOptions) {
    this.registry = options.registry;
    const lorebookFiles = this.registry.getFilesByArtifact('lorebook');
    this.result = analyzeLorebookActivationChains(buildActivationEntries(lorebookFiles), {
      recursiveScanning: options.recursiveScanning ?? true,
    });
    this.entryById = new Map(this.result.entries.map((entry) => [entry.id, entry] as const));
    this.fileByEntryId = buildFileByEntryId(lorebookFiles, this.entryById);
    const indexes = buildActivationIndexes(this.result, this.entryById, this.fileByEntryId);
    this.incomingByEntryId = indexes.incomingByEntryId;
    this.outgoingByEntryId = indexes.outgoingByEntryId;
    this.cycleByEntryId = buildCycleIndex(this.result);
  }

  /**
   * fromRegistry 함수.
   * registry 하나로 activation-chain service를 즉시 생성함.
   *
   * @param registry - Layer 1 registry snapshot
   * @param options - optional recursive scanning seed
   * @returns 새 ActivationChainService 인스턴스
   */
  static fromRegistry(
    registry: ElementRegistry,
    options: Omit<ActivationChainServiceCreateOptions, 'registry'> = {},
  ): ActivationChainService {
    return new ActivationChainService({
      registry,
      recursiveScanning: options.recursiveScanning,
    });
  }

  /**
   * getResult 함수.
   * core가 계산한 activation-chain 전체 결과를 조회함.
   *
   * @returns cached core activation-chain result
   */
  getResult(): LorebookActivationChainResult {
    return this.result;
  }

  /**
   * getAllEntryIds 함수.
   * workspace lorebook entry id 목록을 stable order로 돌려줌.
   *
   * @returns 전체 lorebook entry id 목록
   */
  getAllEntryIds(): readonly string[] {
    return this.result.entries.map((entry) => entry.id);
  }

  /**
   * queryEntry 함수.
   * lorebook entry 하나의 incoming/outgoing activation 관계와 cycle 요약을 돌려줌.
   *
   * @param entryId - 조회할 lorebook entry id
   * @returns 해당 entry의 activation chain query result 또는 null
   */
  queryEntry(entryId: string): ActivationChainQueryResult | null {
    const entry = this.entryById.get(entryId);
    const file = this.fileByEntryId.get(entryId);
    if (!entry || !file) {
      return null;
    }

    const incoming = this.incomingByEntryId.get(entryId) ?? [];
    const outgoing = this.outgoingByEntryId.get(entryId) ?? [];

    return {
      ...createCbsAgentProtocolMarker(),
      entry,
      file,
      incoming,
      outgoing,
      possibleIncoming: filterByStatus(incoming, 'possible'),
      possibleOutgoing: filterByStatus(outgoing, 'possible'),
      partialIncoming: filterByStatus(incoming, 'partial'),
      partialOutgoing: filterByStatus(outgoing, 'partial'),
      blockedIncoming: filterByStatus(incoming, 'blocked'),
      blockedOutgoing: filterByStatus(outgoing, 'blocked'),
      cycle: this.cycleByEntryId.get(entryId) ?? createEmptyCycleSummary(entryId),
    };
  }

  /**
   * queryByUri 함수.
   * lorebook file URI를 entry id로 해석해서 activation query를 돌려줌.
   *
   * @param uri - 조회할 lorebook file URI
   * @returns 해당 URI의 activation chain query result 또는 null
   */
  queryByUri(uri: string): ActivationChainQueryResult | null {
    const file = this.registry.getFileByUri(uri);
    if (!file || file.artifact !== 'lorebook') {
      return null;
    }

    const entryId = resolveEntryIdFromFile(file, this.entryById);
    return entryId ? this.queryEntry(entryId) : null;
  }

  /**
   * queryAt 함수.
   * lorebook 문서 내 어느 위치든 해당 file-level entry activation query로 연결함.
   *
   * @param uri - 조회할 문서 URI
   * @param hostOffset - host document 기준 byte offset
   * @returns 해당 위치의 activation chain query result 또는 null
   */
  queryAt(uri: string, hostOffset: number): ActivationChainQueryResult | null {
    const file = this.registry.getFileByUri(uri);
    if (!file || file.artifact !== 'lorebook') {
      return null;
    }
    if (hostOffset < 0 || hostOffset > file.text.length) {
      return null;
    }

    return this.queryByUri(uri);
  }

  /**
   * getRelatedUris 함수.
   * lorebook entry와 직접 연결된 activator/activated lorebook URI를 stable order로 조회함.
   *
   * @param entryId - 영향을 추적할 lorebook entry id
   * @returns 직접 연결된 lorebook URI 목록
   */
  getRelatedUris(entryId: string): readonly string[] {
    const query = this.queryEntry(entryId);
    if (!query) {
      return [];
    }

    const uris = new Set<string>([query.file.uri]);
    for (const match of [...query.incoming, ...query.outgoing]) {
      if (match.uri) {
        uris.add(match.uri);
      }
    }

    return [...uris].sort((left, right) => left.localeCompare(right));
  }

  /**
   * collectAffectedUris 함수.
   * 변경된 lorebook URI들에 대해 직접 activation 관계로 연결된 URI를 함께 수집함.
   *
   * @param uris - 변경된 문서 URI 목록
   * @returns dedupe/stable affected lorebook URI 목록
   */
  collectAffectedUris(uris: readonly string[]): readonly string[] {
    const affectedUris = new Set<string>();

    for (const uri of uris) {
      affectedUris.add(uri);
      const query = this.queryByUri(uri);
      if (!query) {
        continue;
      }

      for (const relatedUri of this.getRelatedUris(query.entry.id)) {
        affectedUris.add(relatedUri);
      }
    }

    return [...affectedUris].sort((left, right) => left.localeCompare(right));
  }
}

/**
 * buildActivationEntries 함수.
 * registry lorebook file record를 core activation-chain 입력 shape로 정규화함.
 *
 * @param files - workspace lorebook file record 목록
 * @returns core analyze 함수에 전달할 raw entry 목록
 */
function buildActivationEntries(files: readonly ElementRegistryFileRecord[]): GenericRecord[] {
  return files
    .map((file) => parseLorebookFileRecord(file))
    .sort((left, right) => {
      const leftOrder = typeof left.insertionOrder === 'number' ? left.insertionOrder : 0;
      const rightOrder = typeof right.insertionOrder === 'number' ? right.insertionOrder : 0;
      return (
        leftOrder - rightOrder ||
        String(left.name ?? left.comment ?? '').localeCompare(String(right.name ?? right.comment ?? ''))
      );
    });
}

/**
 * parseLorebookFileRecord 함수.
 * canonical `.risulorebook` text를 activation-chain analyze 입력으로 변환함.
 *
 * @param file - lorebook file record
 * @returns activation-chain용 raw lorebook entry record
 */
function parseLorebookFileRecord(file: ElementRegistryFileRecord): GenericRecord {
  const { frontmatter, sections } = splitLorebookFile(file.text);
  const keys = parseStringListSection(sections.KEYS ?? '');
  const secondaryKeys = parseStringListSection(sections.SECONDARY_KEYS ?? '');
  const name = readString(frontmatter, 'name') || readString(frontmatter, 'comment') || fileBaseName(file.relativePath);
  const comment = readString(frontmatter, 'comment') || name;
  const insertionOrder = readNumber(frontmatter, 'insertion_order', 0);

  return {
    name,
    comment,
    key: keys,
    keys,
    secondkey: secondaryKeys,
    secondkeys: secondaryKeys,
    selective: readBoolean(frontmatter, 'selective'),
    constant: readBoolean(frontmatter, 'constant'),
    alwaysActive: readBoolean(frontmatter, 'constant'),
    enabled: readBoolean(frontmatter, 'enabled', true),
    insertionOrder,
    insertorder: insertionOrder,
    caseSensitive: readBoolean(frontmatter, 'case_sensitive'),
    case_sensitive: readBoolean(frontmatter, 'case_sensitive'),
    useRegex: readBoolean(frontmatter, 'use_regex'),
    use_regex: readBoolean(frontmatter, 'use_regex'),
    content: sections.CONTENT ?? '',
    id: name,
  } satisfies GenericRecord;
}

/**
 * splitLorebookFile 함수.
 * canonical lorebook text를 frontmatter와 `@@@` section body로 분리함.
 *
 * @param text - 원본 lorebook 파일 텍스트
 * @returns frontmatter 레코드와 section text 맵
 */
function splitLorebookFile(text: string): {
  frontmatter: Readonly<Record<string, string>>;
  sections: Readonly<Record<string, string>>;
} {
  const lines = text.split(/\r?\n/u);
  let index = 0;
  const frontmatterLines: string[] = [];

  if (lines[index]?.trim() === '---') {
    index += 1;
    while (index < lines.length && lines[index].trim() !== '---') {
      frontmatterLines.push(lines[index]);
      index += 1;
    }
    if (index < lines.length && lines[index].trim() === '---') {
      index += 1;
    }
  }

  const sections: Record<string, string> = {};
  let currentSection: string | null = null;
  let currentLines: string[] = [];

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    const sectionMatch = line.match(/^@@@\s+(.+)$/u);
    if (sectionMatch) {
      if (currentSection) {
        sections[currentSection] = trimTrailingNewlines(currentLines.join('\n'));
      }
      currentSection = sectionMatch[1].trim();
      currentLines = [];
      continue;
    }

    if (currentSection) {
      currentLines.push(line);
    }
  }

  if (currentSection) {
    sections[currentSection] = trimTrailingNewlines(currentLines.join('\n'));
  }

  return {
    frontmatter: parseFrontmatterLines(frontmatterLines),
    sections,
  };
}

/**
 * parseFrontmatterLines 함수.
 * 단순 `key: value` canonical frontmatter를 문자열 레코드로 정규화함.
 *
 * @param lines - frontmatter line 목록
 * @returns frontmatter key/value 문자열 맵
 */
function parseFrontmatterLines(lines: readonly string[]): Readonly<Record<string, string>> {
  const record: Record<string, string> = {};

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) {
      continue;
    }

    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    record[key] = stripWrappingQuotes(value);
  }

  return record;
}

/**
 * parseStringListSection 함수.
 * lorebook key section을 줄 단위/쉼표 단위 문자열 배열로 정규화함.
 *
 * @param content - `@@@ KEYS` 또는 `@@@ SECONDARY_KEYS` body
 * @returns 빈 항목을 제거한 stable key 목록
 */
function parseStringListSection(content: string): string[] {
  return content
    .split(/\r?\n/u)
    .flatMap((line) => line.split(','))
    .map((entry) => stripWrappingQuotes(entry.trim()))
    .filter((entry) => entry.length > 0);
}

/**
 * buildFileByEntryId 함수.
 * entry id와 원본 lorebook file record를 매핑함.
 *
 * @param files - workspace lorebook file record 목록
 * @param entryById - core activation entry 맵
 * @returns entry id -> file record 맵
 */
function buildFileByEntryId(
  files: readonly ElementRegistryFileRecord[],
  entryById: ReadonlyMap<string, LorebookActivationEntry>,
): ReadonlyMap<string, ElementRegistryFileRecord> {
  const fileByEntryId = new Map<string, ElementRegistryFileRecord>();

  for (const file of files) {
    const entryId = resolveEntryIdFromFile(file, entryById);
    if (entryId) {
      fileByEntryId.set(entryId, file);
    }
  }

  return fileByEntryId;
}

/**
 * resolveEntryIdFromFile 함수.
 * lorebook file 텍스트에서 현재 workspace activation entry id를 복원함.
 *
 * @param file - entry id를 찾을 lorebook file record
 * @param entryById - service가 보유한 entry id 맵
 * @returns 해당 file의 entry id 또는 null
 */
function resolveEntryIdFromFile(
  file: ElementRegistryFileRecord,
  entryById: ReadonlyMap<string, LorebookActivationEntry>,
): string | null {
  const { frontmatter } = splitLorebookFile(file.text);
  const candidate = readString(frontmatter, 'name') || readString(frontmatter, 'comment');
  return candidate && entryById.has(candidate) ? candidate : null;
}

/**
 * buildActivationIndexes 함수.
 * entry id별 incoming/outgoing edge 매치를 stable array로 구성함.
 *
 * @param result - core activation-chain result
 * @param entryById - entry lookup map
 * @param fileByEntryId - entry id -> lorebook file map
 * @returns incoming/outgoing index 묶음
 */
function buildActivationIndexes(
  result: LorebookActivationChainResult,
  entryById: ReadonlyMap<string, LorebookActivationEntry>,
  fileByEntryId: ReadonlyMap<string, ElementRegistryFileRecord>,
): {
  incomingByEntryId: ReadonlyMap<string, readonly ActivationChainEntryMatch[]>;
  outgoingByEntryId: ReadonlyMap<string, readonly ActivationChainEntryMatch[]>;
} {
  const incomingByEntryId = new Map<string, ActivationChainEntryMatch[]>();
  const outgoingByEntryId = new Map<string, ActivationChainEntryMatch[]>();

  for (const entry of result.entries) {
    incomingByEntryId.set(entry.id, []);
    outgoingByEntryId.set(entry.id, []);
  }

  for (const edge of result.edges) {
    const sourceEntry = entryById.get(edge.sourceId);
    const targetEntry = entryById.get(edge.targetId);
    if (!sourceEntry || !targetEntry) {
      continue;
    }

    const targetFile = fileByEntryId.get(targetEntry.id) ?? null;
    const sourceFile = fileByEntryId.get(sourceEntry.id) ?? null;

    outgoingByEntryId.get(edge.sourceId)?.push({
      entry: targetEntry,
      edge,
      uri: targetFile?.uri ?? null,
      relativePath: targetFile?.relativePath ?? null,
    });
    incomingByEntryId.get(edge.targetId)?.push({
      entry: sourceEntry,
      edge,
      uri: sourceFile?.uri ?? null,
      relativePath: sourceFile?.relativePath ?? null,
    });
  }

  for (const [entryId, matches] of incomingByEntryId) {
    incomingByEntryId.set(entryId, [...sortEntryMatches(matches)]);
  }
  for (const [entryId, matches] of outgoingByEntryId) {
    outgoingByEntryId.set(entryId, [...sortEntryMatches(matches)]);
  }

  return { incomingByEntryId, outgoingByEntryId };
}

/**
 * sortEntryMatches 함수.
 * edge status와 대상 entry id 기준으로 deterministic ordering을 고정함.
 *
 * @param matches - 정렬할 activation entry match 목록
 * @returns stable sorted match 목록
 */
function sortEntryMatches(matches: readonly ActivationChainEntryMatch[]): readonly ActivationChainEntryMatch[] {
  return [...matches].sort((left, right) => {
    return (
      compareEdgeStatus(left.edge.status, right.edge.status) ||
      left.entry.id.localeCompare(right.entry.id) ||
      (left.relativePath ?? '').localeCompare(right.relativePath ?? '')
    );
  });
}

/**
 * compareEdgeStatus 함수.
 * 가능한 활성화 관계를 앞에 두기 위해 status 우선순위를 비교함.
 *
 * @param left - 왼쪽 edge status
 * @param right - 오른쪽 edge status
 * @returns 정렬 우선순위 차이값
 */
function compareEdgeStatus(left: LorebookActivationEdgeStatus, right: LorebookActivationEdgeStatus): number {
  return activationStatusWeight(left) - activationStatusWeight(right);
}

/**
 * activationStatusWeight 함수.
 * status별 정렬 우선순위를 숫자로 변환함.
 *
 * @param status - 변환할 activation edge status
 * @returns 작은 값일수록 앞에 오는 정렬 가중치
 */
function activationStatusWeight(status: LorebookActivationEdgeStatus): number {
  if (status === 'possible') {
    return 0;
  }
  if (status === 'partial') {
    return 1;
  }
  return 2;
}

/**
 * filterByStatus 함수.
 * edge status 하나에 해당하는 match만 분리함.
 *
 * @param matches - 분류할 activation entry match 목록
 * @param status - 남길 edge status
 * @returns 지정 status만 남긴 match 목록
 */
function filterByStatus(
  matches: readonly ActivationChainEntryMatch[],
  status: LorebookActivationEdgeStatus,
): readonly ActivationChainEntryMatch[] {
  return matches.filter((match) => match.edge.status === status);
}

/**
 * buildCycleIndex 함수.
 * 각 lorebook entry를 시작점으로 BFS walk 하여 cycle summary index를 계산함.
 *
 * @param result - core activation-chain result
 * @returns entry id -> cycle summary 맵
 */
function buildCycleIndex(
  result: LorebookActivationChainResult,
): ReadonlyMap<string, ActivationChainCycleSummary> {
  const traversableEdges = result.edges.filter(
    (edge) => edge.status === 'possible' || edge.status === 'partial',
  );

  return new Map(
    result.entries.map((entry) => [entry.id, walkActivationChain(entry.id, traversableEdges)] as const),
  );
}

/**
 * walkActivationChain 함수.
 * lorebook activation chain을 BFS로 순회해 cycle 여부와 hop 정보를 계산함.
 *
 * @param entryId - BFS 시작 lorebook entry id
 * @param edges - 순회 가능한 activation edge 목록
 * @returns 해당 entry의 cycle summary
 */
function walkActivationChain(
  entryId: string,
  edges: readonly LorebookActivationEdge[],
): ActivationChainCycleSummary {
  const visited = new Set<string>();
  const discovered = new Set<string>();
  const steps: ActivationChainCycleStep[] = [];
  let cycleCount = 0;
  let maxDepth = 0;

  const queue: Array<{
    node: string;
    reason: ActivationChainCycleStep['reason'];
    matchedKeywords: readonly string[];
    depth: number;
  }> = [{ node: entryId, reason: 'entry point', matchedKeywords: [], depth: 0 }];
  discovered.add(entryId);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    discovered.delete(current.node);

    if (visited.has(current.node)) {
      cycleCount += 1;
      continue;
    }

    visited.add(current.node);
    steps.push({
      entryId: current.node,
      reason: current.reason,
      matchedKeywords: [...current.matchedKeywords],
    });
    if (current.depth > maxDepth) {
      maxDepth = current.depth;
    }

    for (const edge of edges.filter((candidate) => candidate.sourceId === current.node)) {
      if (visited.has(edge.targetId)) {
        cycleCount += 1;
        continue;
      }
      if (discovered.has(edge.targetId)) {
        continue;
      }

      discovered.add(edge.targetId);
      queue.push({
        node: edge.targetId,
        reason: edge.status === 'possible' ? 'possible activation' : 'partial activation',
        matchedKeywords: edge.matchedKeywords,
        depth: current.depth + 1,
      });
    }
  }

  return {
    entryId,
    steps,
    hops: steps.length,
    maxDepth,
    hasCycles: cycleCount > 0,
    cycleCount,
  };
}

/**
 * createEmptyCycleSummary 함수.
 * entry lookup 실패 시 반환할 빈 cycle summary를 만듦.
 *
 * @param entryId - 빈 summary에 기록할 entry id
 * @returns cycle이 없는 기본 summary
 */
function createEmptyCycleSummary(entryId: string): ActivationChainCycleSummary {
  return {
    entryId,
    steps: [],
    hops: 0,
    maxDepth: 0,
    hasCycles: false,
    cycleCount: 0,
  };
}

/**
 * readString 함수.
 * frontmatter 문자열 값을 안전하게 읽음.
 *
 * @param record - frontmatter key/value 맵
 * @param key - 읽을 key 이름
 * @returns trim된 문자열 또는 빈 문자열
 */
function readString(record: Readonly<Record<string, string>>, key: string): string {
  return record[key]?.trim() ?? '';
}

/**
 * readBoolean 함수.
 * frontmatter boolean 문자열을 해석함.
 *
 * @param record - frontmatter key/value 맵
 * @param key - 읽을 boolean key 이름
 * @param fallback - 값이 없을 때 기본값
 * @returns 정규화된 boolean 값
 */
function readBoolean(
  record: Readonly<Record<string, string>>,
  key: string,
  fallback = false,
): boolean {
  const value = record[key]?.trim().toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return fallback;
}

/**
 * readNumber 함수.
 * frontmatter 숫자 문자열을 정수로 해석함.
 *
 * @param record - frontmatter key/value 맵
 * @param key - 읽을 numeric key 이름
 * @param fallback - 파싱 실패 시 기본값
 * @returns 정규화된 number 값
 */
function readNumber(
  record: Readonly<Record<string, string>>,
  key: string,
  fallback: number,
): number {
  const raw = record[key]?.trim();
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * stripWrappingQuotes 함수.
 * 단순 quoted frontmatter/string list 값을 unquote 함.
 *
 * @param value - 정규화할 문자열 값
 * @returns wrapping quote가 제거된 문자열
 */
function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

/**
 * trimTrailingNewlines 함수.
 * section body 끝의 빈 줄만 제거해 deterministic body를 유지함.
 *
 * @param value - 정리할 section body 문자열
 * @returns trailing newline이 제거된 문자열
 */
function trimTrailingNewlines(value: string): string {
  return value.replace(/(?:\r?\n)+$/u, '');
}

/**
 * fileBaseName 함수.
 * lorebook file path에서 확장자 없는 파일명을 추출함.
 *
 * @param relativePath - workspace relative path
 * @returns 확장자 없는 파일명
 */
function fileBaseName(relativePath: string): string {
  const segments = relativePath.split('/');
  const fileName = segments[segments.length - 1] ?? relativePath;
  return fileName.replace(/\.risulorebook$/u, '');
}
