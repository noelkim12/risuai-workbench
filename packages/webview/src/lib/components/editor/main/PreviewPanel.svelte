<!--
  Main editor quick preview result panel.
  @file packages/webview/src/lib/components/editor/main/PreviewPanel.svelte
-->

<script lang="ts">
  import type { MainEditorFormatPreviewResultPayload, MainEditorPreviewResultPayload, MainEditorPreviewRuntimeResultPayload } from '../../../types/mainEditor';

  type PreviewPayload = MainEditorPreviewResultPayload | MainEditorPreviewRuntimeResultPayload | MainEditorFormatPreviewResultPayload;
  type OutputLensTone = 'active' | 'skipped' | 'neutral';

  const CONDITION_TRACE_NODES = new Set(['#if', '#if_pure', '#when']);
  const VARIABLE_TRACE_NODES = new Set(['getvar', 'getglobalvar', 'gettempvar']);

  interface PreviewOutputLens {
    id: string;
    label: string;
    tone: OutputLensTone;
    title: string;
    outputLine: number;
  }

  export let preview: PreviewPayload | null;
  export let pending: boolean;

  $: outputLines = preview ? splitPreviewOutput(preview.output) : [];
  $: outputLenses = preview ? createPreviewOutputLenses(preview, outputLines.length) : [];
  $: outputLensesByLine = groupOutputLensesByLine(outputLenses);
  $: previewAnnouncement = preview ? createPreviewAnnouncement(preview, outputLenses) : '';

  /**
   * getPreviewKindLabel 함수.
   * preview payload 형태를 사용자가 읽을 수 있는 처리 단계 이름으로 변환함.
   *
   * @param previewPayload - chip label을 만들 preview 결과 payload
   * @returns preview 처리 경로 이름
   */
  function getPreviewKindLabel(previewPayload: PreviewPayload): string {
    if ('effects' in previewPayload) {
      return 'runtime';
    }
    if ('metadata' in previewPayload) {
      return `${previewPayload.formatKind} format`;
    }
    return 'quick preview';
  }

  /**
   * isRuntimePreview 함수.
   * runtime trace/effect를 가진 preview payload인지 판정함.
   *
   * @param previewPayload - runtime 여부를 확인할 preview 결과 payload
   * @returns runtime preview payload이면 true
   */
  function isRuntimePreview(previewPayload: PreviewPayload): previewPayload is MainEditorPreviewRuntimeResultPayload {
    return 'trace' in previewPayload && 'effects' in previewPayload;
  }

  /**
   * splitPreviewOutput 함수.
   * preview output을 line별 렌더링 가능한 배열로 나눔.
   *
   * @param output - preview output 원문
   * @returns output line 배열
   */
  function splitPreviewOutput(output: string): string[] {
    const lines = output.split('\n');
    return lines.length === 0 ? [''] : lines;
  }

  /**
   * clampOutputLine 함수.
   * source range line을 현재 output line 영역 안으로 보수적으로 맞춤.
   *
   * @param line - source trace/binding line
   * @param outputLineCount - 현재 preview output line 수
   * @returns output 내부에 렌더링할 line index
   */
  function clampOutputLine(line: number | undefined, outputLineCount: number): number {
    if (outputLineCount <= 0 || line === undefined || !Number.isFinite(line)) {
      return 0;
    }
    return Math.max(0, Math.min(outputLineCount - 1, line));
  }

  /**
   * createCbsNodeAbbreviation 함수.
   * CBS trace node 이름을 preview line에 넣을 짧은 표기로 축약함.
   *
   * @param node - trace event의 CBS node 이름
   * @returns output lens에 표시할 축약 label
   */
  function createCbsNodeAbbreviation(node: string): string {
    const normalizedNode = node.trim();
    const knownAbbreviations: Record<string, string> = {
      '#if_pure': '#if',
      getvar: 'gv',
      getglobalvar: 'ggv',
      gettempvar: 'gtv',
      setvar: 'sv',
      setglobalvar: 'sgv',
      settempvar: 'stv',
      addvar: '+v',
      addglobalvar: '+gv',
      addtempvar: '+tv',
      random: 'rnd',
      roll: 'roll',
      time: 'time',
      equal: 'eq',
      '?': '?'
    };
    return knownAbbreviations[normalizedNode.toLowerCase()] ?? normalizedNode;
  }

  /**
   * isConditionTraceNode 함수.
   * preview lens에 표시할 최종 조건 블록 trace인지 확인함.
   *
   * @param node - trace event의 CBS node 이름
   * @returns 조건 블록 trace이면 true
   */
  function isConditionTraceNode(node: string): boolean {
    return CONDITION_TRACE_NODES.has(node);
  }

  /**
   * isVariableTraceNode 함수.
   * CBS variable read trace인지 확인함.
   *
   * @param node - trace event의 CBS node 이름
   * @returns variable read trace이면 true
   */
  function isVariableTraceNode(node: string): boolean {
    return VARIABLE_TRACE_NODES.has(node);
  }

  /**
   * getConditionRawExpression 함수.
   * 조건 trace details에서 source 조건식을 꺼냄.
   *
   * @param details - trace event details
   * @returns source 조건식 또는 빈 문자열
   */
  function getConditionRawExpression(details: Record<string, string> | undefined): string {
    return details?.rawCondition ?? details?.condition ?? '';
  }

  /**
   * isNestedConditionChildTrace 함수.
   * 최종 조건 lens에 이미 포함된 getvar/? 내부 trace인지 판정함.
   *
   * @param event - 검사할 trace event
   * @param events - 전체 runtime trace 이벤트
   * @param eventIndex - 검사할 이벤트 index
   * @param outputLineCount - 현재 preview output line 수
   * @returns 조건식 내부 child trace이면 true
   */
  function isNestedConditionChildTrace(
    event: MainEditorPreviewRuntimeResultPayload['trace'][number],
    events: MainEditorPreviewRuntimeResultPayload['trace'],
    eventIndex: number,
    outputLineCount: number
  ): boolean {
    if (!event.node || (event.node !== '?' && !isVariableTraceNode(event.node))) return false;

    const eventOutputLine = clampOutputLine(event.range?.line, outputLineCount);
    for (let index = eventIndex + 1; index < events.length; index += 1) {
      const candidate = events[index];
      if (candidate.phase !== 'macro-skip' || !candidate.node || !isConditionTraceNode(candidate.node)) continue;
      if (clampOutputLine(candidate.range?.line, outputLineCount) !== eventOutputLine) continue;

      const rawCondition = getConditionRawExpression(candidate.details);
      if (event.node === '?' && rawCondition.includes('{{?')) return true;
      if (isVariableTraceNode(event.node) && event.details?.key && rawCondition.includes(`{{${event.node}::${event.details.key}}}`)) return true;
    }

    return false;
  }

  /**
   * stripOuterParentheses 함수.
   * 조건식 전체를 감싸는 괄호만 반복해서 제거함.
   *
   * @param expression - CBS wrapper 제거 후 조건식
   * @returns 바깥 괄호가 제거된 조건식
   */
  function stripOuterParentheses(expression: string): string {
    let nextExpression = expression.trim();
    while (hasWrappingParentheses(nextExpression)) {
      nextExpression = nextExpression.slice(1, -1).trim();
    }
    return nextExpression;
  }

  /**
   * hasWrappingParentheses 함수.
   * 첫 괄호가 문자열 끝에서만 닫히는 전체 wrapper인지 확인함.
   *
   * @param expression - 검사할 조건식
   * @returns 전체를 감싼 괄호이면 true
   */
  function hasWrappingParentheses(expression: string): boolean {
    if (!expression.startsWith('(') || !expression.endsWith(')')) return false;
    let depth = 0;
    for (let index = 0; index < expression.length; index += 1) {
      const character = expression[index];
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (depth === 0 && index < expression.length - 1) return false;
    }
    return depth === 0;
  }

  /**
   * simplifyCbsConditionExpression 함수.
   * CBS variable wrappers를 사용자가 읽는 변수명 중심 조건식으로 축약함.
   *
   * @param condition - raw CBS condition 또는 evaluated condition fallback
   * @returns compact condition label fragment
   */
  function simplifyCbsConditionExpression(condition: string): string {
    const withoutMathWrapper = condition
      .trim()
      .replace(/^\{\{\?\s*/, '')
      .replace(/\}\}\s*$/, '')
      .replace(/\{\{get(?:global|temp)?var::([^}]+)\}\}/g, '$1')
      .replace(/\{\{([^}:]+)\}\}/g, '$1')
      .replace(/::/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return stripOuterParentheses(withoutMathWrapper);
  }

  /**
   * createConditionLensLabel 함수.
   * #if/#when trace를 `if variable == value` 같은 읽기 쉬운 label로 변환함.
   *
   * @param node - trace event의 CBS node 이름
   * @param details - trace event details
   * @returns 조건형 lens label 또는 undefined
   */
  function createConditionLensLabel(node: string, details: Record<string, string> | undefined): string | undefined {
    const condition = simplifyCbsConditionExpression(getConditionRawExpression(details));
    if (!condition) return undefined;
    if (node === '#if' || node === '#if_pure') {
      return `if ${condition}`;
    }
    if (node === '#when') {
      return `when ${condition}`;
    }
    return undefined;
  }

  /**
   * createTraceLensLabel 함수.
   * CBS trace를 preview output에 표시할 compact label로 변환함.
   *
   * @param node - trace event의 CBS node 이름
   * @param details - trace event details
   * @returns output lens에 표시할 label
   */
  function createTraceLensLabel(node: string, details: Record<string, string> | undefined): string {
    const conditionLabel = createConditionLensLabel(node, details);
    if (conditionLabel) return conditionLabel;

    const abbreviation = createCbsNodeAbbreviation(node);
    if (isVariableTraceNode(node) && details?.key) {
      return `${abbreviation}:${details.key}`;
    }
    return abbreviation;
  }

  /**
   * getTraceLensTone 함수.
   * 조건형 CBS trace는 실패 시 취소선 tone으로, 그 외 trace는 중립 tone으로 표시함.
   *
   * @param node - trace event의 CBS node 이름
   * @param truthy - trace details의 조건 평가 결과
   * @returns lens visual tone
   */
  function getTraceLensTone(node: string, truthy: string | undefined): OutputLensTone {
    if ((node === '#if' || node === '#if_pure' || node === '#when') && truthy === 'false') {
      return 'skipped';
    }
    if (truthy === 'true') {
      return 'active';
    }
    return 'neutral';
  }

  /**
   * createTraceOutputLenses 함수.
   * runtime trace의 CBS function/block 평가 결과를 output 내부 CodeLens형 힌트로 변환함.
   *
   * @param previewPayload - trace를 가진 runtime preview 결과 payload
   * @param outputLineCount - 현재 output line 수
   * @returns CBS trace output lens 배열
   */
  function createTraceOutputLenses(previewPayload: MainEditorPreviewRuntimeResultPayload, outputLineCount: number): PreviewOutputLens[] {
    return previewPayload.trace
      .filter((event, index, events) => event.node && event.phase === 'macro-skip' && !isNestedConditionChildTrace(event, events, index, outputLineCount))
      .slice(0, 16)
      .map((event, index) => {
        const node = event.node ?? '';
        const label = createTraceLensLabel(node, event.details);
        const tone = getTraceLensTone(node, event.details?.truthy);
        const condition = event.details?.condition ? `: ${event.details.condition}` : '';
        return {
          id: `trace-${index}`,
          label,
          tone,
          title: `${node} ${event.message}${condition}`,
          outputLine: clampOutputLine(event.range?.line, outputLineCount)
        };
      });
  }

  /**
   * createPreviewOutputLenses 함수.
   * output 영역 안에 표시할 CodeLens형 preview 흐름 힌트를 만듦.
   *
   * @param previewPayload - flow chip을 만들 preview 결과 payload
   * @param outputLineCount - 현재 output line 수
   * @returns output 내부에 렌더링할 lens 배열
   */
  function createPreviewOutputLenses(previewPayload: PreviewPayload, outputLineCount: number): PreviewOutputLens[] {
    if (!isRuntimePreview(previewPayload)) {
      return [];
    }

    return createTraceOutputLenses(previewPayload, outputLineCount).slice(0, 8);
  }

  /**
   * groupOutputLensesByLine 함수.
   * output line index별로 CodeLens형 힌트를 묶음.
   *
   * @param lenses - output 내부에 렌더링할 lens 배열
   * @returns line index를 key로 하는 lens lookup
   */
  function groupOutputLensesByLine(lenses: PreviewOutputLens[]): Record<number, PreviewOutputLens[]> {
    const byLine: Record<number, PreviewOutputLens[]> = {};
    for (const lens of lenses) {
      byLine[lens.outputLine] = [...(byLine[lens.outputLine] ?? []), lens];
    }
    return byLine;
  }

  /**
   * createPreviewAnnouncement 함수.
   * async preview 갱신 결과를 screen reader가 읽기 쉬운 flow 중심 한 줄로 요약함.
   *
   * @param previewPayload - announcement를 만들 preview 결과 payload
   * @param lenses - 현재 output 안에 표시되는 lens 배열
   * @returns 접근성 live region에 넣을 preview flow 요약
   */
  function createPreviewAnnouncement(previewPayload: PreviewPayload, lenses: PreviewOutputLens[]): string {
    return `${getPreviewKindLabel(previewPayload)} updated. Status ${previewPayload.status}. ${lenses.length} compact CBS hints available in the output.`;
  }
</script>

<section class="main-editor-preview-panel" class:main-editor-preview-panel--pending={pending && Boolean(preview)} aria-label="Preview result" aria-busy={pending}>
  {#if preview}
    <span class="main-editor-preview-panel__sr" aria-live="polite">{previewAnnouncement}</span>
    {#if pending}
      <span class="main-editor-preview-panel__pending-badge" aria-live="polite">Updating preview...</span>
    {/if}
    <div class="main-editor-preview-panel__output" role="region" aria-label="Preview output with inline evaluation hints">
      {#each outputLines as line, lineIndex (lineIndex)}
        <div class="main-editor-preview-panel__output-line">
          {#if outputLensesByLine[lineIndex]}
            <div class="main-editor-preview-panel__lenses" aria-label={`Preview hints for output line ${lineIndex + 1}`}>
              {#each outputLensesByLine[lineIndex] as lens}
                <span class={`main-editor-preview-panel__lens main-editor-preview-panel__lens--${lens.tone}`} title={lens.title} aria-label={lens.title}>{lens.label}</span>
              {/each}
            </div>
          {/if}
          <span class="main-editor-preview-panel__output-text">{line || ' '}</span>
        </div>
      {/each}
    </div>
  {:else if pending}
    <p class="main-editor-preview-panel__muted">Preview updating...</p>
  {:else}
    <p class="main-editor-preview-panel__muted">Edit CONTENT to generate a quick preview.</p>
  {/if}
</section>
