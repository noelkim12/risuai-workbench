/**
 * CBS diagnostic-driven code action provider.
 * @file packages/cbs-lsp/src/features/codeActions.ts
 */

import type { Diagnostic, Range as LspRange } from 'vscode-languageserver';
import {
  CodeActionKind,
  type CodeAction,
  type CodeActionParams,
  type WorkspaceEdit,
} from 'vscode-languageserver/node';
import { type BlockNode, type Range } from 'risu-workbench-core';

import { CbsLspTextHelper } from '../helpers/text-helper';
import {
  ACTIVE_FEATURE_AVAILABILITY,
  createHostFragmentKey,
  fragmentAnalysisService,
  remapFragmentLocalPatchesToHost,
  type AgentMetadataAvailabilityContract,
  type FragmentAnalysisRequest,
  type FragmentAnalysisService,
  type FragmentDocumentAnalysis,
  type HostFragmentPatchEdit,
  validateHostFragmentPatchEdits,
} from '../core';
import {
  DiagnosticCode,
  extractBlockHeaderInfo,
  type DiagnosticMachineData,
  type DiagnosticQuickFix,
} from '../analyzer/diagnostics';
import { positionToOffset } from '../utils/position';

export type CodeActionRequestResolver = (uri: string) => FragmentAnalysisRequest | null;

export interface CodeActionProviderOptions {
  analysisService?: FragmentAnalysisService;
  resolveRequest?: CodeActionRequestResolver;
}

/**
 * Minimal unresolved code action data payload.
 * diagnostic code, action 식별자, 요청 URI를 담아 resolve 시 edit를 재구성하고
 * request context를 검증할 수 있게 함.
 */
export interface UnresolvedCodeActionData {
  cbs: {
    schema: 'cbs-lsp-agent-contract';
    schemaVersion: '1.0.0';
    diagnosticCode: string | number | undefined;
    actionType: 'replacement' | 'close-tag' | 'guidance' | 'unknown';
    replacement: string | null;
    uri: string;
  };
}

/**
 * Lightweight unresolved code action shape.
 * edit payload는 생략되며 resolve 호출로 복원됨.
 */
export type UnresolvedCodeAction = Omit<CodeAction, 'edit' | 'data'> & {
  data: UnresolvedCodeActionData;
};

const WHEN_OPERATOR_CANDIDATES = Object.freeze([
  'and',
  'is',
  'isnot',
  'keep',
  'legacy',
  'not',
  'or',
  'tis',
  'tisnot',
  'toggle',
  'var',
  'vis',
  'visnot',
  '>',
  '>=',
  '<',
  '<=',
]);

const EXPLANATORY_NOOP_EDIT: WorkspaceEdit = { changes: {} };

export const CODE_ACTION_PROVIDER_AVAILABILITY = ACTIVE_FEATURE_AVAILABILITY.codeAction;

interface ReplacementActionDescriptor {
  title: string;
  replacement: string;
  isPreferred?: boolean;
}

/**
 * CodeActionProvider 클래스.
 * diagnostics metadata와 shared host patch validator를 재사용해 quick fix와 안내 action을 구성함.
 */
export class CodeActionProvider {
  private readonly analysisService: FragmentAnalysisService;

  private readonly resolveRequest: CodeActionRequestResolver;

  readonly availability: AgentMetadataAvailabilityContract = CODE_ACTION_PROVIDER_AVAILABILITY;

  constructor(options: CodeActionProviderOptions = {}) {
    this.analysisService = options.analysisService ?? fragmentAnalysisService;
    this.resolveRequest = options.resolveRequest ?? (() => null);
  }

  /**
   * provide 함수.
   * diagnostics와 fragment analysis를 결합해 editor-facing CodeAction 목록을 반환함.
   *
   * @param params - LSP code action request
   * @returns 현재 range와 kind 필터에 맞는 code action 목록
   */
  provide(params: CodeActionParams): CodeAction[] {
    if (!this.shouldComputeQuickFixes(params.context.only)) {
      return [];
    }

    const request = this.resolveRequest(params.textDocument.uri);
    if (!request) {
      return [];
    }

    const analysis = this.analysisService.analyzeDocument(request);
    if (!analysis || analysis.fragmentAnalyses.length === 0) {
      return [];
    }

    const actions: CodeAction[] = [];
    for (const diagnostic of params.context.diagnostics) {
      if (!rangesOverlap(params.range, diagnostic.range)) {
        continue;
      }

      const fragmentAnalysis = this.findOwningFragmentAnalysis(request, analysis.fragmentAnalyses, diagnostic.range);
      if (!fragmentAnalysis) {
        continue;
      }

      actions.push(
        ...this.createMetadataDrivenActions(request, diagnostic, fragmentAnalysis),
        ...this.createStructuralActions(request, diagnostic, fragmentAnalysis),
        ...this.createGuidanceActions(diagnostic),
      );
    }

    return dedupeCodeActions(actions);
  }

  /**
   * provideUnresolved 함수.
   * lightweight unresolved code action 목록을 반환함.
   * edit payload 같은 heavy field는 생략되며 resolve 호출로 복원됨.
   *
   * @param params - LSP code action request
   * @returns unresolved code action 목록
   */
  provideUnresolved(params: CodeActionParams): UnresolvedCodeAction[] {
    const resolved = this.provide(params);
    return resolved.map((action) => stripCodeActionToUnresolved(action, params.textDocument.uri));
  }

  /**
   * resolve 함수.
   * unresolved code action의 deferred edit payload를 복원해 fully resolved action을 반환함.
   * title + kind + isPreferred + diagnosticCode + request URI를 복합 키로 사용해
   * 모호한 matching을 방지함.
   *
   * @param action - unresolved code action
   * @param params - LSP code action request (동일 문서 상태)
   * @returns resolved code action
   */
  resolve(action: UnresolvedCodeAction, params: CodeActionParams): CodeAction | null {
    if (action.data.cbs.uri !== params.textDocument.uri) {
      return null;
    }

    const resolvedList = this.provide(params);
    const match = resolvedList.find(
      (resolved) =>
        resolved.title === action.title &&
        resolved.kind === action.kind &&
        resolved.isPreferred === action.isPreferred &&
        resolved.diagnostics?.[0]?.code === action.data.cbs.diagnosticCode,
    );
    if (match) {
      return match;
    }

    const unresolvedDiagnostic = action.diagnostics?.[0];
    if (!unresolvedDiagnostic) {
      return null;
    }

    const request = this.resolveRequest(action.data.cbs.uri);
    if (!request) {
      return null;
    }

    const analysis = this.analysisService.analyzeDocument(request);
    if (!analysis || analysis.fragmentAnalyses.length === 0) {
      return null;
    }

    const fragmentAnalysis = this.findOwningFragmentAnalysis(request, analysis.fragmentAnalyses, unresolvedDiagnostic.range);
    if (!fragmentAnalysis) {
      return null;
    }

    const localRange = fragmentAnalysis.mapper.toLocalRange(request.text, unresolvedDiagnostic.range as Range);
    if (!localRange) {
      return null;
    }

    switch (action.data.cbs.actionType) {
      case 'replacement': {
        const replacement = action.data.cbs.replacement ?? parseQuotedMessageValue(action.title);
        if (!replacement) {
          return null;
        }

        return this.createReplacementAction(
          request,
          unresolvedDiagnostic,
          fragmentAnalysis,
          localRange,
          {
            title: action.title,
            replacement,
            isPreferred: action.isPreferred,
          },
        );
      }
      case 'close-tag':
        return this.createMissingCloseTagAction(request, unresolvedDiagnostic, fragmentAnalysis, localRange);
      case 'guidance':
        return createNoopGuidanceAction(action.title, unresolvedDiagnostic);
      default:
        return null;
    }
  }

  /**
   * shouldComputeQuickFixes 함수.
   * client가 quickfix 이외 kind만 요청한 경우 계산을 생략함.
   *
   * @param only - 요청된 code action kind filter
   * @returns quick fix를 계산해야 하면 true
   */
  private shouldComputeQuickFixes(only: readonly string[] | undefined): boolean {
    if (!only || only.length === 0) {
      return true;
    }

    return only.some((kind) => kind === CodeActionKind.QuickFix || CodeActionKind.QuickFix.startsWith(`${kind}.`));
  }

  /**
   * findOwningFragmentAnalysis 함수.
   * diagnostic host range를 완전히 감싸는 fragment analysis를 찾음.
   *
   * @param request - host document request
   * @param fragmentAnalyses - 현재 문서의 fragment 분석 목록
   * @param diagnosticRange - host document 기준 diagnostic range
   * @returns owning fragment analysis 또는 null
   */
  private findOwningFragmentAnalysis(
    request: FragmentAnalysisRequest,
    fragmentAnalyses: readonly FragmentDocumentAnalysis[],
    diagnosticRange: LspRange,
  ): FragmentDocumentAnalysis | null {
    const startOffset = positionToOffset(request.text, diagnosticRange.start);
    const endOffset = positionToOffset(request.text, diagnosticRange.end);

    return (
      fragmentAnalyses.find((fragmentAnalysis) => {
        return (
          fragmentAnalysis.mapper.containsHostOffset(startOffset) &&
          fragmentAnalysis.mapper.containsHostOffset(endOffset)
        );
      }) ?? null
    );
  }

  /**
   * createMetadataDrivenActions 함수.
   * diagnostic.data.fixes에 들어 있는 replacement/suggestion metadata를 quick fix로 승격함.
   *
   * @param request - host document request
   * @param diagnostic - editor가 전달한 diagnostic
   * @param fragmentAnalysis - owning fragment analysis
   * @returns 자동 치환형 quick fix 목록
   */
  private createMetadataDrivenActions(
    request: FragmentAnalysisRequest,
    diagnostic: Diagnostic,
    fragmentAnalysis: FragmentDocumentAnalysis,
  ): CodeAction[] {
    if (fragmentAnalysis.recovery.hasSyntaxRecovery) {
      return [];
    }

    const machineData = getDiagnosticMachineData(diagnostic.data);
    if (!machineData?.fixes || machineData.fixes.length === 0) {
      return [];
    }

    const localRange = fragmentAnalysis.mapper.toLocalRange(request.text, diagnostic.range as Range);
    if (!localRange) {
      return [];
    }

    const actions: CodeAction[] = [];
    for (const fix of machineData.fixes) {
      for (const descriptor of this.expandReplacementDescriptors(fix)) {
        const action = this.createReplacementAction(
          request,
          diagnostic,
          fragmentAnalysis,
          localRange,
          descriptor,
        );
        if (action) {
          actions.push(action);
        }
      }
    }

    return actions;
  }

  /**
   * expandReplacementDescriptors 함수.
   * direct replacement와 multi-suggestion metadata를 실제 replacement action 후보로 펼침.
   *
   * @param fix - diagnostic quick fix metadata
   * @returns replacement action descriptor 목록
   */
  private expandReplacementDescriptors(fix: DiagnosticQuickFix): readonly ReplacementActionDescriptor[] {
    if (fix.editKind !== 'replace') {
      return [];
    }

    if (fix.replacement !== undefined) {
      return [{
        title: fix.title,
        replacement: fix.replacement,
        isPreferred: true,
      }];
    }

    return (fix.suggestions ?? []).map((suggestion: { value: string }, index: number) => ({
      title: `Replace with ${JSON.stringify(suggestion.value)}`,
      replacement: suggestion.value,
      isPreferred: index === 0,
    }));
  }

  /**
   * createReplacementAction 함수.
   * fragment-local replacement를 host edit로 승격하고 validation까지 통과한 경우에만 CodeAction을 반환함.
   *
   * @param request - host document request
   * @param diagnostic - source diagnostic
   * @param fragmentAnalysis - owning fragment analysis
   * @param localRange - fragment-local replacement range
   * @param descriptor - replacement action descriptor
   * @returns 안전하게 승격된 quick fix 또는 null
   */
  private createReplacementAction(
    request: FragmentAnalysisRequest,
    diagnostic: Diagnostic,
    fragmentAnalysis: FragmentDocumentAnalysis,
    localRange: Range,
    descriptor: ReplacementActionDescriptor,
  ): CodeAction | null {
    const currentText = CbsLspTextHelper.extractRangeText(fragmentAnalysis.fragment.content, localRange);
    if (currentText === descriptor.replacement) {
      return null;
    }

    const replacementEdits = this.createReplacementPatchEdits(
      fragmentAnalysis,
      localRange,
      descriptor.replacement,
    );
    if (replacementEdits.length === 0) {
      return null;
    }

    const remapped = remapFragmentLocalPatchesToHost(request, fragmentAnalysis, [
      ...replacementEdits,
    ]);
    if (!remapped.ok) {
      return null;
    }

    const validated = this.validateHostEdits(request, fragmentAnalysis, remapped.edits);
    if (!validated.ok || validated.edits.length === 0) {
      return null;
    }

    return {
      title: descriptor.title,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: createWorkspaceEdit(validated.edits),
      isPreferred: descriptor.isPreferred,
    };
  }

  /**
   * createStructuralActions 함수.
   * diagnostics metadata만으로 표현되지 않는 block/operator quick fix를 생성함.
   *
   * @param request - host document request
   * @param diagnostic - source diagnostic
   * @param fragmentAnalysis - owning fragment analysis
   * @returns block/operator 기반 quick fix 목록
   */
  private createStructuralActions(
    request: FragmentAnalysisRequest,
    diagnostic: Diagnostic,
    fragmentAnalysis: FragmentDocumentAnalysis,
  ): CodeAction[] {
    const localRange = fragmentAnalysis.mapper.toLocalRange(request.text, diagnostic.range as Range);
    if (!localRange) {
      return [];
    }

    if (diagnostic.code === DiagnosticCode.UnclosedBlock) {
      const action = this.createMissingCloseTagAction(request, diagnostic, fragmentAnalysis, localRange);
      return action ? [action] : [];
    }

    if (
      diagnostic.code === DiagnosticCode.UnknownFunction &&
      typeof diagnostic.message === 'string' &&
      diagnostic.message.startsWith('Invalid #when operator ')
    ) {
      return this.createWhenOperatorActions(request, diagnostic, fragmentAnalysis, localRange);
    }

    return [];
  }

  /**
   * createMissingCloseTagAction 함수.
   * unclosed block 진단에 대해 닫는 tag 삽입 quick fix를 생성함.
   *
   * @param request - host document request
   * @param diagnostic - source diagnostic
   * @param fragmentAnalysis - owning fragment analysis
   * @returns close-tag insertion quick fix 또는 null
   */
  private createMissingCloseTagAction(
    request: FragmentAnalysisRequest,
    diagnostic: Diagnostic,
    fragmentAnalysis: FragmentDocumentAnalysis,
    diagnosticLocalRange: Range,
  ): CodeAction | null {
    const block = findUnclosedBlockAtDiagnostic(fragmentAnalysis, diagnosticLocalRange);
    if (!block) {
      return null;
    }

    const remapped = remapFragmentLocalPatchesToHost(request, fragmentAnalysis, [
      {
        range: { start: block.range.end, end: block.range.end },
        newText: `{{/${block.kind}}}`,
      },
    ]);
    if (!remapped.ok) {
      return null;
    }

    const validated = this.validateHostEdits(request, fragmentAnalysis, remapped.edits);
    if (!validated.ok || validated.edits.length === 0) {
      return null;
    }

    return {
      title: `Insert missing {{/${block.kind}}}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      edit: createWorkspaceEdit(validated.edits),
      isPreferred: true,
    };
  }

  /**
   * createWhenOperatorActions 함수.
   * invalid #when operator 진단에 대해 교체 quick fix 후보를 생성함.
   *
   * @param request - host document request
   * @param diagnostic - source diagnostic
   * @param fragmentAnalysis - owning fragment analysis
   * @returns operator replacement quick fix 목록
   */
  private createWhenOperatorActions(
    request: FragmentAnalysisRequest,
    diagnostic: Diagnostic,
    fragmentAnalysis: FragmentDocumentAnalysis,
    diagnosticLocalRange: Range,
  ): CodeAction[] {
    const invalidOperator = parseQuotedMessageValue(diagnostic.message);
    if (!invalidOperator) {
      return [];
    }

    const block = findWhenBlockAtDiagnostic(fragmentAnalysis, diagnosticLocalRange);
    if (!block) {
      return [];
    }

    const operatorRange = findWhenOperatorRange(block, fragmentAnalysis.fragment.content, invalidOperator);
    if (!operatorRange) {
      return [];
    }

    const candidates = rankWhenOperatorCandidates(invalidOperator).slice(0, 5);
    return candidates.flatMap((candidate, index) => {
      const action = this.createReplacementAction(
        request,
        diagnostic,
        fragmentAnalysis,
        operatorRange,
        {
          title: `Replace operator with ${JSON.stringify(candidate)}`,
          replacement: candidate,
          isPreferred: index === 0,
        },
      );
      return action ? [action] : [];
    });
  }

  /**
   * createGuidanceActions 함수.
   * 파괴적 edit 대신 설명만 필요한 slot/arg misuse 진단에 no-op guidance action을 제공함.
   *
   * @param diagnostic - source diagnostic
   * @returns 설명형 action 목록
   */
  private createGuidanceActions(diagnostic: Diagnostic): CodeAction[] {
    if (
      diagnostic.code === DiagnosticCode.UndefinedVariable &&
      typeof diagnostic.message === 'string' &&
      diagnostic.message.includes('loop binding')
    ) {
      return [
        createNoopGuidanceAction(
          'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
          diagnostic,
        ),
      ];
    }

    if (
      diagnostic.code === DiagnosticCode.MissingRequiredArgument &&
      typeof diagnostic.message === 'string' &&
      diagnostic.message.includes('requires an `as <item>` loop binding')
    ) {
      return [
        createNoopGuidanceAction(
          'Explain: {{slot::name}} only works inside {{#each ... as name}} blocks',
          diagnostic,
        ),
      ];
    }

    if (
      diagnostic.code === DiagnosticCode.WrongArgumentCount &&
      typeof diagnostic.message === 'string' &&
      diagnostic.message.startsWith('CBS argument reference ')
    ) {
      return [
        createNoopGuidanceAction(
          'Explain: {{arg::N}} only works inside a local {{#func}} body reached by {{call::...}}',
          diagnostic,
        ),
      ];
    }

    return [];
  }

  /**
   * validateHostEdits 함수.
   * code action host edit를 owning fragment window로 제한해 shared validator를 통과시킴.
   *
   * @param request - host document request
   * @param fragmentAnalysis - owning fragment analysis
   * @param edits - remapped host edits
   * @returns validation result
   */
  private validateHostEdits(
    request: FragmentAnalysisRequest,
    fragmentAnalysis: FragmentDocumentAnalysis,
    edits: readonly HostFragmentPatchEdit[],
  ) {
    return validateHostFragmentPatchEdits(
      this.analysisService,
      edits.map((edit) => ({
        uri: edit.uri,
        range: edit.range,
        newText: edit.newText,
      })),
      {
        resolveRequestForUri: this.resolveRequest,
        allowedFragmentKeysByUri: new Map([
          [request.uri, new Set([createHostFragmentKey(fragmentAnalysis)])],
        ]),
      },
    );
  }

  /**
   * createReplacementPatchEdits 함수.
   * block name replacement면 close tag까지 함께 맞추고, 일반 token이면 단일 replacement edit를 만듦.
   *
   * @param fragmentAnalysis - owning fragment analysis
   * @param localRange - primary replacement range
   * @param replacement - target replacement text
   * @returns fragment-local patch edit 목록
   */
  private createReplacementPatchEdits(
    fragmentAnalysis: FragmentDocumentAnalysis,
    localRange: Range,
    replacement: string,
  ): Array<{ range: Range; newText: string }> {
    const block = findBlockByNameRange(fragmentAnalysis, localRange);
    if (!block || !replacement.startsWith('#')) {
      return [
        {
          range: localRange,
          newText: replacement,
        },
      ];
    }

    const edits = [
      {
        range: localRange,
        newText: replacement,
      },
    ];
    const closeNameRange = findExplicitCloseNameRange(block, fragmentAnalysis.fragment.content);
    if (closeNameRange) {
      edits.push({
        range: closeNameRange,
        newText: `/${replacement.slice(1)}`,
      });
    }

    return edits;
  }
}

/**
 * stripCodeActionToUnresolved 함수.
 * fully resolved code action에서 edit를 제거하고 lightweight unresolved action을 만듦.
 * request URI를 data에 추가해 resolve matching을 강화함.
 *
 * @param action - 원본 resolved code action
 * @param uri - 요청 문서 URI
 * @returns edit가 제거된 unresolved code action
 */
export function stripCodeActionToUnresolved(
  action: CodeAction,
  uri: string,
): UnresolvedCodeAction {
  const firstDiagnostic = action.diagnostics?.[0];
  const actionType: UnresolvedCodeActionData['cbs']['actionType'] =
    action.edit && Object.keys(action.edit.changes ?? {}).length === 0
        ? 'guidance'
      : action.title.startsWith('Insert missing')
        ? 'close-tag'
        : action.title.startsWith('Replace')
          ? 'replacement'
          : 'unknown';
  const replacement =
    actionType === 'replacement'
      ? Object.values(action.edit?.changes ?? {})[0]?.[0]?.newText ?? null
      : null;

  return {
    title: action.title,
    kind: action.kind,
    diagnostics: action.diagnostics?.map((diagnostic) => ({
      range: diagnostic.range,
      severity: diagnostic.severity,
      code: diagnostic.code,
      message: diagnostic.message,
      source: diagnostic.source,
      relatedInformation: diagnostic.relatedInformation,
    })),
    isPreferred: action.isPreferred,
    data: {
      cbs: {
        schema: 'cbs-lsp-agent-contract',
        schemaVersion: '1.0.0',
        diagnosticCode: firstDiagnostic?.code,
        actionType,
        replacement,
        uri,
      },
    },
  };
}

/**
 * getDiagnosticMachineData 함수.
 * LSP diagnostic.data에서 code-action용 machine data를 안전하게 추출함.
 *
 * @param value - diagnostic.data payload
 * @returns diagnostic machine data 또는 null
 */
function getDiagnosticMachineData(value: unknown): DiagnosticMachineData | null {
  if (!value || typeof value !== 'object' || !('rule' in value)) {
    return null;
  }

  return value as DiagnosticMachineData;
}

/**
 * createWorkspaceEdit 함수.
 * host patch edit 목록을 LSP WorkspaceEdit 형태로 정리함.
 *
 * @param edits - validated host edits
 * @returns single-or-multi document workspace edit
 */
function createWorkspaceEdit(edits: readonly HostFragmentPatchEdit[]): WorkspaceEdit {
  const changes: NonNullable<WorkspaceEdit['changes']> = {};

  for (const edit of edits) {
    if (!changes[edit.uri]) {
      changes[edit.uri] = [];
    }

    changes[edit.uri]!.push({
      range: edit.range,
      newText: edit.newText,
    });
  }

  return { changes };
}

/**
 * createNoopGuidanceAction 함수.
 * protocol-valid no-op edit를 가진 설명형 guidance action을 생성함.
 *
 * @param title - action title
 * @param diagnostic - linked diagnostic
 * @returns no-op guidance code action
 */
function createNoopGuidanceAction(title: string, diagnostic: Diagnostic): CodeAction {
  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic],
    edit: EXPLANATORY_NOOP_EDIT,
  };
}

/**
 * dedupeCodeActions 함수.
 * title/diagnostic/edit 기준으로 중복 action을 제거함.
 *
 * @param actions - 원본 action 목록
 * @returns stable dedupe된 action 목록
 */
function dedupeCodeActions(actions: readonly CodeAction[]): CodeAction[] {
  const seen = new Set<string>();
  const deduped: CodeAction[] = [];

  for (const action of actions) {
    const key = JSON.stringify({
      title: action.title,
      kind: action.kind ?? '',
      diagnostics: action.diagnostics?.map((diagnostic) => ({
        code: diagnostic.code ?? null,
        range: diagnostic.range,
      })) ?? [],
      edit: action.edit ?? null,
    });
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push(action);
  }

  return deduped;
}

/**
 * rangesOverlap 함수.
 * two host ranges가 겹치거나 맞닿는지 판정함.
 *
 * @param left - 첫 번째 range
 * @param right - 두 번째 range
 * @returns overlap 여부
 */
function rangesOverlap(left: LspRange, right: LspRange): boolean {
  return comparePositions(left.end, right.start) >= 0 && comparePositions(right.end, left.start) >= 0;
}

/**
 * comparePositions 함수.
 * line/character 기준으로 두 position의 정렬 순서를 비교함.
 *
 * @param left - 왼쪽 position
 * @param right - 오른쪽 position
 * @returns 정렬 비교값
 */
function comparePositions(left: LspRange['start'], right: LspRange['start']): number {
  return left.line - right.line || left.character - right.character;
}

/**
 * parseQuotedMessageValue 함수.
 * diagnostic message에서 첫 quoted value를 추출함.
 *
 * @param message - diagnostic message
 * @returns quoted value 또는 null
 */
function parseQuotedMessageValue(message: string): string | null {
  const match = message.match(/"([^"]+)"/u);
  return match?.[1] ?? null;
}

/**
 * findUnclosedBlockAtDiagnostic 함수.
 * diagnostic range에 대응하는 unclosed block node를 찾음.
 *
 * @param fragmentAnalysis - current fragment analysis
 * @param diagnosticRange - diagnostic local/host mapped range
 * @returns closeRange가 없는 block 또는 null
 */
function findUnclosedBlockAtDiagnostic(
  fragmentAnalysis: FragmentDocumentAnalysis,
  diagnosticRange: Range,
): BlockNode | null {
  return (
    collectBlocks(fragmentAnalysis.document.nodes).find(
      (node) => node.closeRange === undefined && rangesEqual(node.openRange, diagnosticRange),
    ) ?? null
  );
}

/**
 * findWhenBlockAtDiagnostic 함수.
 * invalid #when operator diagnostic에 대응하는 when block을 찾음.
 *
 * @param fragmentAnalysis - current fragment analysis
 * @param diagnosticRange - diagnostic range
 * @returns matching when block 또는 null
 */
function findWhenBlockAtDiagnostic(
  fragmentAnalysis: FragmentDocumentAnalysis,
  diagnosticRange: Range,
): BlockNode | null {
  return (
    collectBlocks(fragmentAnalysis.document.nodes).find(
      (node) => node.kind === 'when' && rangesEqual(node.openRange, diagnosticRange),
    ) ?? null
  );
}

/**
 * findBlockByNameRange 함수.
 * block name token range와 정확히 일치하는 block node를 찾음.
 *
 * @param fragmentAnalysis - current fragment analysis
 * @param nameRange - block name local range
 * @returns matching block 또는 null
 */
function findBlockByNameRange(
  fragmentAnalysis: FragmentDocumentAnalysis,
  nameRange: Range,
): BlockNode | null {
  return (
    collectBlocks(fragmentAnalysis.document.nodes).find((node) => {
      const blockNameRange = createBlockNameRange(node, fragmentAnalysis.fragment.content);
      return blockNameRange ? rangesEqual(blockNameRange, nameRange) : false;
    }) ?? null
  );
}

/**
 * collectBlocks 함수.
 * nested CBS nodes 전체에서 block node를 평탄화해 수집함.
 *
 * @param nodes - traversal 대상 nodes
 * @returns block node 목록
 */
function collectBlocks(nodes: readonly import('risu-workbench-core').CBSNode[]): BlockNode[] {
  const blocks: BlockNode[] = [];

  for (const node of nodes) {
    if (node.type !== 'Block') {
      continue;
    }

    blocks.push(node);
    blocks.push(...collectBlocks(node.body));
    if (node.elseBody) {
      blocks.push(...collectBlocks(node.elseBody));
    }
    for (const segment of node.condition) {
      if (segment.type === 'Block') {
        blocks.push(...collectBlocks([segment]));
      }
    }
  }

  return blocks;
}

/**
 * createBlockNameRange 함수.
 * block open header에서 `#when` 같은 이름 부분의 local range를 계산함.
 *
 * @param block - 대상 block node
 * @param sourceText - fragment source text
 * @returns block name local range 또는 null
 */
function createBlockNameRange(block: BlockNode, sourceText: string): Range | null {
  const openText = CbsLspTextHelper.extractRangeText(sourceText, block.openRange);
  const match = /^\{\{\s*([^\s:}]+)/u.exec(openText);
  if (!match?.[1]) {
    return null;
  }

  const openStartOffset = positionToOffset(sourceText, block.openRange.start);
  const nameStartOffset = openStartOffset + openText.indexOf(match[1]);
  return {
    start: offsetToRangePosition(sourceText, nameStartOffset),
    end: offsetToRangePosition(sourceText, nameStartOffset + match[1].length),
  };
}

/**
 * rangesEqual 함수.
 * 두 Range가 정확히 같은지 비교함.
 *
 * @param left - 왼쪽 range
 * @param right - 오른쪽 range
 * @returns 동일 여부
 */
function rangesEqual(left: Range, right: Range): boolean {
  return comparePositions(left.start, right.start) === 0 && comparePositions(left.end, right.end) === 0;
}

/**
 * findExplicitCloseNameRange 함수.
 * `{{/when}}`처럼 block kind를 명시한 close tag의 local range를 계산함.
 *
 * @param block - 대상 block node
 * @param sourceText - fragment source text
 * @returns `/when` local range 또는 null
 */
function findExplicitCloseNameRange(block: BlockNode, sourceText: string): Range | null {
  if (!block.closeRange) {
    return null;
  }

  const closeText = CbsLspTextHelper.extractRangeText(sourceText, block.closeRange);
  const match = /^\{\{\/(\w+)/u.exec(closeText);
  if (!match?.[1]) {
    return null;
  }

  const closeStartOffset = positionToOffset(sourceText, block.closeRange.start);
  const slashStartOffset = closeStartOffset + closeText.indexOf(`/${match[1]}`);
  return {
    start: offsetToRangePosition(sourceText, slashStartOffset),
    end: offsetToRangePosition(sourceText, slashStartOffset + match[1].length + 1),
  };
}

/**
 * findWhenOperatorRange 함수.
 * #when header 안에서 잘못된 operator의 local range를 계산함.
 *
 * @param block - 대상 when block
 * @param sourceText - fragment source text
 * @param operator - diagnostic에서 뽑은 invalid operator
 * @returns operator local range 또는 null
 */
function findWhenOperatorRange(block: BlockNode, sourceText: string, operator: string): Range | null {
  const header = extractBlockHeaderInfo(block, sourceText);
  if (!header) {
    return null;
  }

  const openStartOffset = positionToOffset(sourceText, block.openRange.start);
  const openText = CbsLspTextHelper.extractRangeText(sourceText, block.openRange);
  const escapedOperator = escapeRegExp(operator);
  const match = new RegExp(`::(\\s*)${escapedOperator}(?=\\s*(::|\\}\\}))`, 'u').exec(openText);
  if (!match || match.index === undefined) {
    return null;
  }

  const operatorStartOffset = openStartOffset + match.index + 2 + (match[1]?.length ?? 0);
  return {
    start: offsetToRangePosition(sourceText, operatorStartOffset),
    end: offsetToRangePosition(sourceText, operatorStartOffset + operator.length),
  };
}

/**
 * offsetToRangePosition 함수.
 * fragment-local offset을 Range position으로 변환함.
 *
 * @param text - fragment text
 * @param offset - local offset
 * @returns local position
 */
function offsetToRangePosition(text: string, offset: number): Range['start'] {
  const lineText = text.slice(0, offset);
  const lines = lineText.split('\n');
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1]?.length ?? 0,
  };
}

/**
 * rankWhenOperatorCandidates 함수.
 * invalid operator와 가장 가까운 valid operator 순으로 정렬함.
 *
 * @param invalidOperator - diagnostic에 들어 있던 invalid operator
 * @returns ranked operator 후보
 */
function rankWhenOperatorCandidates(invalidOperator: string): string[] {
  return [...WHEN_OPERATOR_CANDIDATES].sort((left, right) => {
    return scoreOperatorDistance(invalidOperator, left) - scoreOperatorDistance(invalidOperator, right) || left.localeCompare(right);
  });
}

/**
 * scoreOperatorDistance 함수.
 * 간단한 levenshtein 거리로 operator 후보 우선순위를 계산함.
 *
 * @param source - 잘못된 operator
 * @param target - candidate operator
 * @returns edit distance
 */
function scoreOperatorDistance(source: string, target: string): number {
  const matrix = Array.from({ length: source.length + 1 }, () => new Array<number>(target.length + 1).fill(0));

  for (let row = 0; row <= source.length; row += 1) {
    matrix[row]![0] = row;
  }
  for (let column = 0; column <= target.length; column += 1) {
    matrix[0]![column] = column;
  }

  for (let row = 1; row <= source.length; row += 1) {
    for (let column = 1; column <= target.length; column += 1) {
      const substitutionCost = source[row - 1] === target[column - 1] ? 0 : 1;
      matrix[row]![column] = Math.min(
        matrix[row - 1]![column]! + 1,
        matrix[row]![column - 1]! + 1,
        matrix[row - 1]![column - 1]! + substitutionCost,
      );
    }
  }

  return matrix[source.length]![target.length]!;
}

/**
 * escapeRegExp 함수.
 * diagnostic 문자열을 regex literal로 안전하게 escape함.
 *
 * @param value - escape할 문자열
 * @returns regex-safe string
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
