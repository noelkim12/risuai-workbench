/**
 * UnifiedVariableGraph 위에 Layer 3 variable flow 질의를 제공하는 서비스.
 * @file packages/cbs-lsp/src/services/variable-flow-service.ts
 */

import { parseToggleDefinitions, type Range, type VarEvent, type VarFlowEntry, type VarFlowIssue, type VarFlowResult } from 'risu-workbench-core';

import {
  createAgentMetadataWorkspaceSnapshot,
  createCbsAgentProtocolMarker,
  type AgentMetadataWorkspaceSnapshotContract,
  type CbsAgentProtocolMarker,
} from '../core';
import {
  type ElementRegistry,
  UnifiedVariableGraph,
  type UnifiedVariableNode,
  type UnifiedVariableOccurrence,
} from '../indexer';
import { buildDerivedFlowResult } from '../indexer/unified-variable-derived-flow';
import { offsetToPosition } from '../utils/position';

export interface DefaultVariableDefinitionLocation {
  uri: string;
  relativePath: string;
  variableName: string;
  value: string;
  range: Range;
}

export interface ToggleDefinitionLocation {
  uri: string;
  relativePath: string;
  toggleName: string;
  globalVariableName: string;
  range: Range;
}

/**
 * collectDefaultVariableDefinitions 함수.
 * registry에 포함된 `.risuvar` 파일의 `key=value` 행을 definition target으로 정규화함.
 *
 * @param registry - workspace file snapshot을 제공하는 registry
 * @returns 변수명별 기본 변수 key 위치 목록
 */
function collectDefaultVariableDefinitions(
  registry: ElementRegistry,
): ReadonlyMap<string, readonly DefaultVariableDefinitionLocation[]> {
  const definitions = new Map<string, DefaultVariableDefinitionLocation[]>();

  for (const file of registry.getFilesByArtifact('variable')) {
    let lineStartOffset = 0;
    const lines = file.text.split(/\n/);
    for (const line of lines) {
      const trimmedStart = line.search(/\S/);
      const equalsIndex = line.indexOf('=');
      const isComment = trimmedStart !== -1 && line.slice(trimmedStart).startsWith('#');

      if (equalsIndex > 0 && !isComment) {
        const rawName = line.slice(0, equalsIndex).trim();
        if (rawName.length > 0) {
          const keyStartInLine = line.indexOf(rawName);
          const keyStartOffset = lineStartOffset + keyStartInLine;
          const keyEndOffset = keyStartOffset + rawName.length;
          const location: DefaultVariableDefinitionLocation = {
            uri: file.uri,
            relativePath: file.relativePath,
            variableName: rawName,
            value: line.slice(equalsIndex + 1),
            range: {
              start: offsetToPosition(file.text, keyStartOffset),
              end: offsetToPosition(file.text, keyEndOffset),
            },
          };
          const bucket = definitions.get(rawName) ?? [];
          bucket.push(location);
          definitions.set(rawName, bucket);
        }
      }

      lineStartOffset += line.length + 1;
    }
  }

  return new Map(
    [...definitions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([variableName, locations]) => [
        variableName,
        [...locations].sort(
          (left, right) =>
            left.uri.localeCompare(right.uri) ||
            left.range.start.line - right.range.start.line ||
            left.range.start.character - right.range.start.character,
        ),
      ]),
  );
}

/**
 * collectToggleDefinitions 함수.
 * registry에 포함된 `.risutoggle` 파일의 toggle key를 원본 이름과 `toggle_` globalvar 이름으로 정규화함.
 *
 * @param registry - workspace file snapshot을 제공하는 registry
 * @returns toggle 이름별 정의 위치 목록
 */
function collectToggleDefinitions(
  registry: ElementRegistry,
): ReadonlyMap<string, readonly ToggleDefinitionLocation[]> {
  const definitions = new Map<string, ToggleDefinitionLocation[]>();

  for (const file of registry.getFilesByArtifact('toggle')) {
    for (const definition of parseToggleDefinitions(file.text)) {
      const location: ToggleDefinitionLocation = {
        uri: file.uri,
        relativePath: file.relativePath,
        toggleName: definition.name,
        globalVariableName: definition.globalVariableName,
        range: {
          start: offsetToPosition(file.text, definition.startOffset),
          end: offsetToPosition(file.text, definition.endOffset),
        },
      };
      const bucket = definitions.get(definition.name) ?? [];
      bucket.push(location);
      definitions.set(definition.name, bucket);
    }
  }

  return new Map(
    [...definitions.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([toggleName, locations]) => [
        toggleName,
        [...locations].sort(
          (left, right) =>
            left.uri.localeCompare(right.uri) ||
            left.range.start.line - right.range.start.line ||
            left.range.start.character - right.range.start.character,
        ),
      ]),
  );
}

/**
 * VariableFlowIssueMatch 타입.
 * core variable-flow issue를 workspace occurrence와 다시 연결한 결과.
 *
 * @param issue - core에서 계산한 원본 issue
 * @param occurrences - issue event와 매칭되는 workspace occurrence 목록
 */
export interface VariableFlowIssueMatch {
  issue: VarFlowIssue;
  occurrences: readonly UnifiedVariableOccurrence[];
}

export interface WorkspaceSnapshotState {
  rootPath: string;
  snapshotVersion: number;
  documentVersions: ReadonlyMap<string, string | number>;
}

/**
 * VariableFlowQueryResult 타입.
 * 변수 하나에 대한 cross-file readers/writers/issues 질의 결과.
 *
 * @param variableName - 조회한 변수 이름
 * @param node - Layer 1 graph variable node
 * @param occurrences - reader/writer를 합친 stable occurrence 목록
 * @param readers - read occurrence 목록
 * @param writers - write occurrence 목록
 * @param flowEntry - core variable-flow 엔트리, 없으면 null
 * @param issues - occurrence와 매핑된 issue 목록
 * @param defaultValue - defaultVariables에서 온 기본값 또는 null
 * @param defaultDefinitions - `.risuvar` key 정의 위치 목록
 * @param matchedOccurrence - 위치 기반 질의일 때 cursor가 가리킨 occurrence
 */
export interface VariableFlowQueryResult extends CbsAgentProtocolMarker {
  variableName: string;
  node: UnifiedVariableNode;
  occurrences: readonly UnifiedVariableOccurrence[];
  readers: readonly UnifiedVariableOccurrence[];
  writers: readonly UnifiedVariableOccurrence[];
  flowEntry: VarFlowEntry | null;
  issues: readonly VariableFlowIssueMatch[];
  defaultValue: string | null;
  defaultDefinitions: readonly DefaultVariableDefinitionLocation[];
  matchedOccurrence: UnifiedVariableOccurrence | null;
}

/**
 * VariableCompletionSummary 타입.
 * completion 후보 생성에 필요한 최소 변수 flow 정보를 담음.
 */
export interface VariableCompletionSummary {
  name: string;
  readerCount: number;
  writerCount: number;
  defaultDefinitionCount: number;
  hasWritableSource: boolean;
}

export interface ToggleCompletionSummary {
  name: string;
  globalVariableName: string;
  definitionCount: number;
}

/**
 * VariableFlowServiceCreateOptions 타입.
 * service 구성에 필요한 graph, registry, default variable seed를 전달함.
 *
 * @param graph - Layer 1 UnifiedVariableGraph 인스턴스
 * @param registry - buildDerivedFlowResult가 읽을 ElementRegistry
 * @param defaultVariables - uninitialized-read 판정에 반영할 기본 변수 맵
 */
export interface VariableFlowServiceCreateOptions {
  graph: UnifiedVariableGraph;
  registry: ElementRegistry;
  defaultVariables?: Readonly<Record<string, string>>;
  workspaceSnapshot?: WorkspaceSnapshotState | null;
}

/**
 * VariableFlowServiceFromRegistryOptions 타입.
 * registry에서 service를 바로 만들 때 optional graph/default seed를 받음.
 *
 * @param graph - 이미 만들어진 graph가 있으면 재사용할 수 있음
 * @param defaultVariables - flow 계산에 사용할 기본 변수 맵
 */
export interface VariableFlowServiceFromRegistryOptions {
  graph?: UnifiedVariableGraph;
  defaultVariables?: Readonly<Record<string, string>>;
}

/**
 * VariableFlowService 클래스.
 * Layer 1 graph와 core variable-flow 결과를 합쳐 provider가 공통 호출할
 * cross-file variable query surface를 제공함.
 */
export class VariableFlowService {
  private readonly graph: UnifiedVariableGraph;

  private readonly registry: ElementRegistry;

  private readonly defaultVariables: Readonly<Record<string, string>>;

  private readonly flowResult: VarFlowResult;

  private readonly flowByVariable: ReadonlyMap<string, VarFlowEntry>;

  private readonly workspaceSnapshot: WorkspaceSnapshotState | null;

  private readonly defaultVariableDefinitions: ReadonlyMap<string, readonly DefaultVariableDefinitionLocation[]>;

  private readonly toggleDefinitions: ReadonlyMap<string, readonly ToggleDefinitionLocation[]>;

  private readonly variableCompletionSummaries: readonly VariableCompletionSummary[];

  private readonly toggleCompletionSummaries: readonly ToggleCompletionSummary[];

  constructor(options: VariableFlowServiceCreateOptions) {
    this.graph = options.graph;
    this.registry = options.registry;
    this.defaultVariables = options.defaultVariables ?? {};
    this.flowResult = buildDerivedFlowResult(this.graph, this.registry, {
      ...this.defaultVariables,
    });
    this.flowByVariable = new Map(
      this.flowResult.variables.map((entry) => [entry.varName, entry] as const),
    );
    this.workspaceSnapshot = options.workspaceSnapshot ?? null;
    this.defaultVariableDefinitions = collectDefaultVariableDefinitions(this.registry);
    this.toggleDefinitions = collectToggleDefinitions(this.registry);
    this.variableCompletionSummaries = this.buildVariableCompletionSummaries();
    this.toggleCompletionSummaries = this.buildToggleCompletionSummaries();
  }

  /**
   * fromRegistry 함수.
   * registry만으로 Layer 1 graph + Layer 3 service를 한 번에 준비함.
   *
   * @param registry - workspace index snapshot
   * @param options - optional graph/default variable seed
   * @returns 새 VariableFlowService 인스턴스
   */
  static fromRegistry(
    registry: ElementRegistry,
    options: VariableFlowServiceFromRegistryOptions = {},
  ): VariableFlowService {
    return new VariableFlowService({
      registry,
      graph: options.graph ?? UnifiedVariableGraph.fromRegistry(registry),
      defaultVariables: options.defaultVariables,
      workspaceSnapshot: null,
    });
  }

  /**
   * getWorkspaceSnapshot 함수.
   * 현재 service가 기반한 workspace snapshot metadata를 조회함.
   *
   * @returns snapshot freshness 판정에 쓸 workspace snapshot 또는 null
   */
  getWorkspaceSnapshot(): WorkspaceSnapshotState | null {
    return this.workspaceSnapshot;
  }

  /**
   * getWorkspaceFreshness 함수.
   * 현재 request version이 service가 들고 있는 workspace snapshot과 일치하는지 판정함.
   *
   * @param request - freshness를 확인할 현재 요청 URI/version
   * @returns provider metadata에 실을 workspace snapshot freshness marker 또는 null
   */
  getWorkspaceFreshness(request: {
    uri: string;
    version: string | number;
  }): AgentMetadataWorkspaceSnapshotContract | null {
    if (!this.workspaceSnapshot) {
      return null;
    }

    const trackedDocumentVersion = this.workspaceSnapshot.documentVersions.get(request.uri) ?? null;
    const freshness =
      trackedDocumentVersion === null || trackedDocumentVersion === request.version ? 'fresh' : 'stale';
    const detail =
      freshness === 'fresh'
        ? trackedDocumentVersion === null
          ? `Workspace snapshot v${this.workspaceSnapshot.snapshotVersion} has no open-document override for this URI, so workspace-aware results use the installed snapshot as-is.`
          : `Workspace snapshot v${this.workspaceSnapshot.snapshotVersion} matches the current document version ${request.version}, so cross-file workspace results are safe to merge.`
        : `Workspace snapshot v${this.workspaceSnapshot.snapshotVersion} still tracks document version ${trackedDocumentVersion} while the current request uses version ${request.version}, so cross-file workspace results must degrade to fragment-local output.`;

    return createAgentMetadataWorkspaceSnapshot({
      detail,
      freshness,
      requestVersion: request.version,
      rootPath: this.workspaceSnapshot.rootPath,
      snapshotVersion: this.workspaceSnapshot.snapshotVersion,
      trackedDocumentVersion,
    });
  }

  /**
   * getGraph 함수.
   * provider가 재사용할 Layer 1 graph를 그대로 돌려줌.
   *
   * @returns service가 보유한 UnifiedVariableGraph
   */
  getGraph(): UnifiedVariableGraph {
    return this.graph;
  }

  /**
   * getFlowResult 함수.
   * service가 계산한 전체 variable-flow 결과를 조회함.
   *
   * @returns cached variable-flow result
   */
  getFlowResult(): VarFlowResult {
    return this.flowResult;
  }

  /**
   * getAllVariableNames 함수.
   * graph에 존재하는 변수 이름을 stable ordering으로 조회함.
   *
   * @returns graph에 등록된 전체 변수 이름 목록
   */
  getAllVariableNames(): readonly string[] {
    return [
      ...new Set([
        ...this.graph.getAllVariableNames(),
        ...this.defaultVariableDefinitions.keys(),
      ]),
    ].sort((left, right) => left.localeCompare(right));
  }

  /**
   * getVariableCompletionSummaries 함수.
   * completion 후보 생성에 필요한 최소 변수 summary를 캐시에서 반환함.
   *
   * @returns stable ordering이 적용된 lightweight variable summary 목록
   */
  getVariableCompletionSummaries(): readonly VariableCompletionSummary[] {
    return this.variableCompletionSummaries;
  }

  /**
   * getToggleCompletionSummaries 함수.
   * `.risutoggle` 정의에서 CBS completion에 필요한 원본 toggle/globalvar 후보를 반환함.
   *
   * @returns stable ordering이 적용된 toggle completion summary 목록
   */
  getToggleCompletionSummaries(): readonly ToggleCompletionSummary[] {
    return this.toggleCompletionSummaries;
  }

  /**
   * getDefaultVariableDefinitions 함수.
   * `.risuvar` 기본 변수 파일에 선언된 key 위치를 definition target으로 조회함.
   *
   * @param variableName - 조회할 기본 변수 이름
   * @returns 기본 변수 파일 내 key range 목록
   */
  getDefaultVariableDefinitions(variableName: string): readonly DefaultVariableDefinitionLocation[] {
    return this.defaultVariableDefinitions.get(variableName) ?? [];
  }

  /**
   * getToggleDefinitions 함수.
   * `.risutoggle` 파일에 선언된 toggle key 위치를 조회함.
   *
   * @param toggleName - 조회할 원본 toggle 이름
   * @returns toggle 파일 내 key range 목록
   */
  getToggleDefinitions(toggleName: string): readonly ToggleDefinitionLocation[] {
    return this.toggleDefinitions.get(toggleName) ?? [];
  }

  /**
   * getToggleGlobalVariableDefinitions 함수.
   * `toggle_<name>` globalvar 후보에 대응하는 risutoggle 정의 위치를 조회함.
   *
   * @param globalVariableName - 조회할 파생 globalvar 이름
   * @returns toggle 파일 내 key range 목록
   */
  getToggleGlobalVariableDefinitions(globalVariableName: string): readonly ToggleDefinitionLocation[] {
    const toggleName = globalVariableName.startsWith('toggle_')
      ? globalVariableName.slice('toggle_'.length)
      : globalVariableName;
    return this.getToggleDefinitions(toggleName);
  }

  /**
   * buildVariableCompletionSummaries 함수.
   * workspace completion이 queryVariable N회 없이 후보를 만들 수 있게 최소 summary를 선계산함.
   *
   * @returns 변수명별 completion summary 목록
   */
  private buildVariableCompletionSummaries(): readonly VariableCompletionSummary[] {
    return this.getAllVariableNames().map((name) => {
      const node = this.graph.getVariable(name);
      const defaultDefinitionCount = this.defaultVariableDefinitions.get(name)?.length ?? 0;
      const writerCount = node?.writers.length ?? 0;

      return {
        name,
        readerCount: node?.readers.length ?? 0,
        writerCount,
        defaultDefinitionCount,
        hasWritableSource: writerCount > 0 || defaultDefinitionCount > 0,
      } satisfies VariableCompletionSummary;
    });
  }

  /**
   * buildToggleCompletionSummaries 함수.
   * risutoggle 원본 이름과 `toggle_` globalvar 이름을 completion 후보용 summary로 변환함.
   *
   * @returns toggle completion summary 목록
   */
  private buildToggleCompletionSummaries(): readonly ToggleCompletionSummary[] {
    return [...this.toggleDefinitions.entries()].map(([name, definitions]) => ({
      name,
      globalVariableName: definitions[0]?.globalVariableName ?? `toggle_${name}`,
      definitionCount: definitions.length,
    }));
  }

  /**
   * queryVariable 함수.
   * 변수 이름 하나에 대한 cross-file readers/writers/issues 묶음을 조회함.
   *
   * @param variableName - 조회할 변수 이름
   * @returns 변수 질의 결과 또는 null
   */
  queryVariable(variableName: string): VariableFlowQueryResult | null {
    const node = this.graph.getVariable(variableName);
    const defaultDefinitions = this.defaultVariableDefinitions.get(variableName) ?? [];
    if (!node && defaultDefinitions.length === 0 && this.defaultVariables[variableName] === undefined) {
      return null;
    }

    const resolvedNode = node ?? this.createDefaultOnlyVariableNode(variableName, defaultDefinitions);
    const flowEntry = this.flowByVariable.get(variableName) ?? null;
    const issues = flowEntry ? this.buildIssueMatches(resolvedNode, flowEntry) : [];
    const defaultValue =
      flowEntry?.defaultValue ?? this.defaultVariables[variableName] ?? defaultDefinitions[0]?.value ?? null;

    return {
      ...createCbsAgentProtocolMarker(),
      variableName,
      node: resolvedNode,
      occurrences: node ? this.graph.getOccurrencesForVariable(variableName) : [],
      readers: resolvedNode.readers,
      writers: resolvedNode.writers,
      flowEntry,
      issues,
      defaultValue,
      defaultDefinitions,
      matchedOccurrence: null,
    };
  }

  /**
   * createDefaultOnlyVariableNode 함수.
   * `.risuvar` key만 있는 변수를 workspace query 결과로 표현함.
   *
   * @param variableName - 기본 변수 key 이름
   * @param defaultDefinitions - 해당 key가 선언된 `.risuvar` 위치 목록
   * @returns occurrence 없이 기본 변수 파일 소속만 담은 graph node shape
   */
  private createDefaultOnlyVariableNode(
    variableName: string,
    defaultDefinitions: readonly DefaultVariableDefinitionLocation[],
  ): UnifiedVariableNode {
    return {
      name: variableName,
      readers: [],
      writers: [],
      occurrenceCount: 0,
      artifacts: defaultDefinitions.length > 0 ? ['variable'] : [],
      uris: [...new Set(defaultDefinitions.map((definition) => definition.uri))].sort((left, right) =>
        left.localeCompare(right),
      ),
    };
  }

  /**
   * queryAt 함수.
   * host document 위치에서 variable occurrence를 찾고 cross-file 질의 결과를 돌려줌.
   *
   * @param uri - 조회할 문서 URI
   * @param hostOffset - host document 기준 byte offset
   * @returns 해당 위치의 변수 질의 결과 또는 null
   */
  queryAt(uri: string, hostOffset: number): VariableFlowQueryResult | null {
    const occurrenceResult = this.graph.findOccurrenceAt(uri, hostOffset);
    if (!occurrenceResult.occurrence || !occurrenceResult.variableNode) {
      return null;
    }

    const base = this.queryVariable(occurrenceResult.variableNode.name);
    if (!base) {
      return null;
    }

    return {
      ...base,
      matchedOccurrence: occurrenceResult.occurrence,
    };
  }

  /**
   * getReaders 함수.
   * 변수의 cross-file reader occurrence만 빠르게 조회함.
   *
   * @param variableName - 조회할 변수 이름
   * @returns reader occurrence 목록
   */
  getReaders(variableName: string): readonly UnifiedVariableOccurrence[] {
    return this.queryVariable(variableName)?.readers ?? [];
  }

  /**
   * getWriters 함수.
   * 변수의 cross-file writer occurrence만 빠르게 조회함.
   *
   * @param variableName - 조회할 변수 이름
   * @returns writer occurrence 목록
   */
  getWriters(variableName: string): readonly UnifiedVariableOccurrence[] {
    return this.queryVariable(variableName)?.writers ?? [];
  }

  /**
   * getIssues 함수.
   * 변수의 flow issue를 occurrence 매핑과 함께 조회함.
   *
   * @param variableName - 조회할 변수 이름
   * @returns issue match 목록
   */
  getIssues(variableName: string): readonly VariableFlowIssueMatch[] {
    return this.queryVariable(variableName)?.issues ?? [];
  }

  /**
   * getRelatedUris 함수.
   * 변수 하나와 연결된 workspace URI 집합을 stable ordering으로 조회함.
   *
   * @param variableName - 영향을 추적할 변수 이름
   * @returns 해당 변수의 reader/writer가 존재하는 URI 목록
   */
  getRelatedUris(variableName: string): readonly string[] {
    return this.queryVariable(variableName)?.node.uris ?? [];
  }

  /**
   * collectAffectedUris 함수.
   * 주어진 문서 URI들에 등장하는 변수와 연결된 관련 문서 URI 전체를 모음.
   *
   * @param uris - 변경 전후 비교의 기준이 되는 문서 URI 목록
   * @returns 관련 문서를 포함한 dedupe/stable URI 목록
   */
  collectAffectedUris(uris: readonly string[]): readonly string[] {
    const affectedUris = new Set<string>();

    for (const uri of uris) {
      affectedUris.add(uri);

      for (const occurrence of this.graph.getOccurrencesByUri(uri)) {
        for (const relatedUri of this.getRelatedUris(occurrence.variableName)) {
          affectedUris.add(relatedUri);
        }
      }
    }

    return [...affectedUris].sort((left, right) => left.localeCompare(right));
  }

  /**
   * buildIssueMatches 함수.
   * core issue event를 Layer 1 occurrence와 다시 연결해 provider가 바로 쓸 수 있게 만듦.
   *
   * @param node - 대상 variable node
   * @param flowEntry - 대상 variable flow entry
   * @returns occurrence가 연결된 issue 목록
   */
  private buildIssueMatches(
    node: UnifiedVariableNode,
    flowEntry: VarFlowEntry,
  ): readonly VariableFlowIssueMatch[] {
    return flowEntry.issues.map((issue) => ({
      issue,
      occurrences: matchIssueOccurrences(node, issue),
    }));
  }
}

/**
 * matchIssueOccurrences 함수.
 * issue event와 elementName/action이 맞는 occurrence를 stable order로 되찾음.
 *
 * @param node - 대상 variable node
 * @param issue - occurrence로 매핑할 issue
 * @returns dedupe된 occurrence 목록
 */
function matchIssueOccurrences(
  node: UnifiedVariableNode,
  issue: VarFlowIssue,
): readonly UnifiedVariableOccurrence[] {
  const seen = new Set<string>();
  const matches: UnifiedVariableOccurrence[] = [];

  for (const event of issue.events) {
    for (const occurrence of matchOccurrencesForEvent(node, event)) {
      if (seen.has(occurrence.occurrenceId)) {
        continue;
      }
      seen.add(occurrence.occurrenceId);
      matches.push(occurrence);
    }
  }

  return matches.sort((left, right) => left.occurrenceId.localeCompare(right.occurrenceId));
}

/**
 * matchOccurrencesForEvent 함수.
 * VarEvent 하나와 같은 element/action을 가진 occurrence를 찾음.
 *
 * @param node - 대상 variable node
 * @param event - 매핑할 flow event
 * @returns event와 대응하는 occurrence 목록
 */
function matchOccurrencesForEvent(
  node: UnifiedVariableNode,
  event: VarEvent,
): readonly UnifiedVariableOccurrence[] {
  const candidates = event.action === 'read' ? node.readers : node.writers;
  return candidates.filter((occurrence) => occurrence.elementName === event.elementName);
}
