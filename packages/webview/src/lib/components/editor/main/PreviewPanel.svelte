<!--
  Main editor quick preview result panel.
  @file packages/webview/src/lib/components/editor/main/PreviewPanel.svelte
-->

<script lang="ts">
  import { getLorebookDecoratorSpec, type LorebookDecoratorSpec } from 'risu-workbench-core/cbs-browser';
  import type { MainEditorFormatPreviewResultPayload, MainEditorPreviewResultPayload, MainEditorPreviewRuntimeResultPayload } from '../../../types/mainEditor';
  import { createTraceLensViewModel, getParentLensSource, isNestedLensChildTrace, isParentLensTraceNode, isVariableTraceNode, type PreviewLensTone } from './cbsLensFormatter';

  type PreviewPayload = MainEditorPreviewResultPayload | MainEditorPreviewRuntimeResultPayload | MainEditorFormatPreviewResultPayload;
  type OutputLensTone = PreviewLensTone | 'decorator';

  const MAX_PREVIEW_OUTPUT_LENSES = 12;

  interface PreviewOutputLens {
    id: string;
    label: string;
    tone: OutputLensTone;
    title: string;
    detailLines: string[];
    outputLine: number;
    outputColumn: number;
    placement: 'inline' | 'prefix-line';
    suppressOutputLine?: boolean;
  }

  interface PreviewLineSegment {
    text: string;
    lenses: PreviewOutputLens[];
  }

  const EMPTY_PREVIEW_LINE_TEXT = '\u00a0';
  const DECORATOR_LINE_PATTERN = /^(\s*)(@@[A-Za-z_][A-Za-z0-9_]*)(?:\s+(.*))?$/;

  export let preview: PreviewPayload | null;
  export let pending: boolean;
  export let sourceText: string | undefined = undefined;

  $: outputLines = preview ? splitPreviewOutput(preview.output) : [];
  $: sourceLines = sourceText?.split('\n') ?? [];
  $: outputLenses = preview ? createPreviewOutputLenses(preview, outputLines.length, sourceLines) : [];
  $: outputInlineLensesByLine = groupOutputLensesByLine(outputLenses.filter((lens) => lens.placement === 'inline'));
  $: outputPrefixLensesByLine = groupOutputLensesByLine(outputLenses.filter((lens) => lens.placement === 'prefix-line'));
  $: outputSuppressedLinesByLine = groupSuppressedOutputLinesByLine(outputLenses);
  $: outputLineSegments = outputLines.map((line, lineIndex) => createLineSegments(line, outputInlineLensesByLine[lineIndex]));
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
   * getTracePreviewOutputLine 함수.
   * core가 계산한 preview output line을 우선하고, 없으면 legacy source line clamp로 fallback함.
   *
   * @param event - output line을 계산할 runtime trace event
   * @param outputLineCount - 현재 preview output line 수
   * @returns lens를 배치할 preview output line index
   */
  function getTracePreviewOutputLine(event: MainEditorPreviewRuntimeResultPayload['trace'][number], outputLineCount: number): number {
    return clampOutputLine(event.outputLine ?? event.range?.line, outputLineCount);
  }

  /**
   * clampOutputColumn 함수.
   * core가 계산한 output column을 현재 line text 범위 안으로 맞춤.
   *
   * @param column - preview output column 후보
   * @param line - 해당 preview line text
   * @returns line 안에서 chip을 끼워 넣을 column index
   */
  function clampOutputColumn(column: number | undefined, line: string): number {
    if (column === undefined || !Number.isFinite(column)) return 0;
    return Math.max(0, Math.min(line.length, column));
  }

  /**
   * moveColumnToTokenStart 함수.
   * lens가 단어 내부에 끼어들어 `J [if] apanese`처럼 output text를 쪼개는 것을 막음.
   *
   * @param column - core가 계산한 output column
   * @param line - 해당 output line text
   * @returns 단어 내부이면 단어 시작 column, 아니면 원래 column
   */
  function moveColumnToTokenStart(column: number, line: string): number {
    let nextColumn = clampOutputColumn(column, line);
    while (nextColumn > 0 && isWordCharacter(line[nextColumn - 1]) && isWordCharacter(line[nextColumn] ?? '')) {
      nextColumn -= 1;
    }
    return nextColumn;
  }

  /**
   * isWordCharacter 함수.
   * preview lens가 alphabetic token 중간에 들어갔는지 판단하기 위한 보수적 문자 판정.
   *
   * @param value - 검사할 한 글자
   * @returns 단어 문자이면 true
   */
  function isWordCharacter(value: string): boolean {
    return /^[\p{L}\p{N}_]$/u.test(value);
  }

  /**
   * shouldRenderLensOnPrefixLine 함수.
   * source에서 control block open macro가 한 줄을 단독으로 차지한 경우 preview에서도 lens 줄을 보존함.
   *
   * @param event - lens를 만들 runtime trace event
   * @param outputLine - core가 계산한 output line
   * @param outputColumn - core가 계산한 output column
   * @param lines - 현재 source line 배열
   * @returns source macro-only control line이면 true
   */
  function shouldRenderLensOnPrefixLine(
    event: MainEditorPreviewRuntimeResultPayload['trace'][number],
    outputLine: number,
    outputColumn: number,
    lines: string[]
  ): boolean {
    if (!event.node || !isParentLensTraceNode(event.node) || !event.range) return false;
    if (outputColumn !== 0 || outputLines[outputLine]?.length === 0) return false;
    if (event.range.line !== event.range.endLine) return false;

    const sourceLine = lines[event.range.line];
    if (sourceLine === undefined) return false;
    return sourceLine.slice(0, event.range.character).trim() === '' && sourceLine.slice(event.range.endCharacter).trim() === '';
  }

  /**
   * isNestedParentLensChildTrace 함수.
   * 최종 조건/대입 lens에 이미 포함된 내부 trace인지 판정함.
   *
   * @param event - 검사할 trace event
   * @param events - 전체 runtime trace 이벤트
   * @param eventIndex - 검사할 이벤트 index
   * @param outputLineCount - 현재 preview output line 수
   * @returns parent lens 내부 child trace이면 true
   */
  function isNestedParentLensChildTrace(
    event: MainEditorPreviewRuntimeResultPayload['trace'][number],
    events: MainEditorPreviewRuntimeResultPayload['trace'],
    eventIndex: number,
    outputLineCount: number
  ): boolean {
    if (!event.node) return false;

    const eventOutputLine = getTracePreviewOutputLine(event, outputLineCount);
    for (let index = eventIndex + 1; index < events.length; index += 1) {
      const candidate = events[index];
      if (candidate.phase !== 'macro-skip' || !candidate.node || !isParentLensTraceNode(candidate.node)) continue;
      if (getTracePreviewOutputLine(candidate, outputLineCount) !== eventOutputLine) continue;

      if (isNestedLensChildTrace(event, getParentLensSource(candidate))) return true;
    }

    return false;
  }

  /**
   * createTraceOutputLenses 함수.
   * runtime trace의 CBS function/block 평가 결과를 output 내부 CodeLens형 힌트로 변환함.
   *
   * @param previewPayload - trace를 가진 runtime preview 결과 payload
   * @param outputLineCount - 현재 output line 수
   * @returns CBS trace output lens 배열
   */
  function createTraceOutputLenses(previewPayload: MainEditorPreviewRuntimeResultPayload, outputLineCount: number, lines: string[]): PreviewOutputLens[] {
    return previewPayload.trace
      .filter(
        (event, index, events) =>
          event.node &&
          event.phase === 'macro-skip' &&
          (isParentLensTraceNode(event.node) || isVariableTraceNode(event.node)) &&
          !isNestedParentLensChildTrace(event, events, index, outputLineCount)
      )
      .slice(0, 16)
      .map((event, index) => {
        const lens = createTraceLensViewModel(event);
        const outputLine = getTracePreviewOutputLine(event, outputLineCount);
        const outputColumn = moveColumnToTokenStart(clampOutputColumn(event.outputColumn, outputLines[outputLine] ?? ''), outputLines[outputLine] ?? '');
        return {
          id: `trace-${index}`,
          label: lens.label,
          tone: lens.tone,
          title: lens.title,
          detailLines: lens.detailLines,
          outputLine,
          outputColumn,
          placement: shouldRenderLensOnPrefixLine(event, outputLine, outputColumn, lines) ? 'prefix-line' : 'inline'
        };
      });
  }

  /**
   * createDecoratorOutputLenses 함수.
   * preview output 안에 line-leading registered lorebook decorator가 보이면 registry metadata lens로 변환함.
   *
   * @param lines - 현재 preview output line 배열
   * @returns registered decorator output lens 배열
   */
  function createDecoratorOutputLenses(lines: string[]): PreviewOutputLens[] {
    return lines.flatMap((line, lineIndex) => {
      const match = DECORATOR_LINE_PATTERN.exec(line);
      if (!match) return [];

      const spec = getLorebookDecoratorSpec(match[2]);
      if (!spec) return [];

      return [createDecoratorOutputLens(spec, lineIndex, match[1].length, match[3]?.trim() ?? '')];
    });
  }

  /**
   * createDecoratorOutputLens 함수.
   * registered decorator metadata를 preview lens view model 형태로 변환함.
   *
   * @param spec - registry에서 조회한 decorator spec
   * @param outputLine - lens를 붙일 preview output line index
   * @param outputColumn - decorator token 시작 column
   * @param argumentText - decorator token 뒤에 붙은 실제 인자 문자열
   * @returns decorator metadata lens
   */
  function createDecoratorOutputLens(spec: LorebookDecoratorSpec, outputLine: number, outputColumn: number, argumentText: string): PreviewOutputLens {
    return {
      id: `decorator-${outputLine}-${spec.name}`,
      label: createDecoratorLensLabel(spec, argumentText),
      tone: 'decorator',
      title: `${spec.label} — ${spec.summary}`,
      detailLines: [
        `${spec.signature}`,
        `category: ${spec.category}`,
        `support: ${spec.supportLevel}`,
        spec.summary,
        spec.description,
        ...(spec.examples.length > 0 ? ['', 'examples:', ...spec.examples.map((example) => `- ${example}`)] : [])
      ],
      outputLine,
      outputColumn,
      placement: 'prefix-line',
      suppressOutputLine: true
    };
  }

  /**
   * createDecoratorLensLabel 함수.
   * `@@depth 0` 같은 원문 decorator 호출을 preview용 `depth 0` label로 축약함.
   *
   * @param spec - registry에서 조회한 decorator spec
   * @param argumentText - decorator token 뒤의 실제 인자 문자열
   * @returns preview에 표시할 compact decorator label
   */
  function createDecoratorLensLabel(spec: LorebookDecoratorSpec, argumentText: string): string {
    return argumentText ? `${spec.name} ${argumentText}` : spec.name;
  }

  /**
   * createPreviewOutputLenses 함수.
   * output 영역 안에 표시할 CodeLens형 preview 흐름 힌트를 만듦.
   *
   * @param previewPayload - flow chip을 만들 preview 결과 payload
   * @param outputLineCount - 현재 output line 수
   * @returns output 내부에 렌더링할 lens 배열
   */
  function createPreviewOutputLenses(previewPayload: PreviewPayload, outputLineCount: number, lines: string[]): PreviewOutputLens[] {
    const decoratorLenses = createDecoratorOutputLenses(outputLines);
    if (!isRuntimePreview(previewPayload)) {
      return decoratorLenses.slice(0, MAX_PREVIEW_OUTPUT_LENSES);
    }

    return [...decoratorLenses, ...createTraceOutputLenses(previewPayload, outputLineCount, lines)].slice(0, MAX_PREVIEW_OUTPUT_LENSES);
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
   * groupSuppressedOutputLinesByLine 함수.
   * lens 자체가 원문 preview line을 대체해야 하는 line을 표시함.
   *
   * @param lenses - output 내부에 렌더링할 lens 배열
   * @returns line index를 key로 하는 suppress lookup
   */
  function groupSuppressedOutputLinesByLine(lenses: PreviewOutputLens[]): Record<number, true> {
    const byLine: Record<number, true> = {};
    for (const lens of lenses) {
      if (lens.suppressOutputLine) {
        byLine[lens.outputLine] = true;
      }
    }
    return byLine;
  }

  /**
   * createLineSegments 함수.
   * 한 preview line의 text와 chip을 outputColumn 기준 좌→우 흐름으로 배치합니다.
   *
   * @param line - 렌더링할 preview output line text
   * @param lenses - 같은 output line에 속한 preview lens 목록
   * @returns text segment와 그 앞에 놓을 lens 목록입니다.
   */
  function createLineSegments(line: string, lenses: PreviewOutputLens[] | undefined): PreviewLineSegment[] {
    if (!lenses || lenses.length === 0) {
      return [{ text: line || EMPTY_PREVIEW_LINE_TEXT, lenses: [] }];
    }

    const sortedLenses = [...lenses].sort((left, right) => left.outputColumn - right.outputColumn || left.id.localeCompare(right.id));
    const segments: PreviewLineSegment[] = [];
    let cursor = 0;
    let index = 0;

    while (index < sortedLenses.length) {
      const outputColumn = clampOutputColumn(sortedLenses[index].outputColumn, line);
      const columnLenses: PreviewOutputLens[] = [];
      while (index < sortedLenses.length && clampOutputColumn(sortedLenses[index].outputColumn, line) === outputColumn) {
        columnLenses.push(sortedLenses[index]);
        index += 1;
      }
      segments.push({ text: line.slice(cursor, outputColumn), lenses: columnLenses });
      cursor = outputColumn;
    }

    segments.push({ text: line.slice(cursor) || (cursor === 0 ? EMPTY_PREVIEW_LINE_TEXT : ''), lenses: [] });
    return segments;
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
    return `${getPreviewKindLabel(previewPayload)} updated. Status ${previewPayload.status}. ${lenses.length} compact preview hints available in the output.`;
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
        {#if outputPrefixLensesByLine[lineIndex]}
          <div class="main-editor-preview-panel__output-line">
            <span class="main-editor-preview-panel__line-number" aria-hidden="true">{lineIndex + 1}</span>
            <div class="main-editor-preview-panel__output-line-body">
              <span class="main-editor-preview-panel__output-flow" aria-label={`Preview output prefix hints for output line ${lineIndex + 1}`}>
                {#each outputPrefixLensesByLine[lineIndex] as lens (lens.id)}
                  <span class="main-editor-preview-panel__inline-lenses" aria-label={`Preview hints for output line ${lineIndex + 1}`}>
                    <details class={`main-editor-preview-panel__lens main-editor-preview-panel__lens--${lens.tone}`} title={lens.title} aria-label={lens.title}>
                      <summary class="main-editor-preview-panel__lens-summary">{lens.label}</summary>
                      <pre class="main-editor-preview-panel__lens-detail">{lens.detailLines.join('\n')}</pre>
                    </details>
                  </span>
                {/each}
              </span>
            </div>
          </div>
        {/if}
        {#if !outputSuppressedLinesByLine[lineIndex]}
          <div class="main-editor-preview-panel__output-line">
            <span class="main-editor-preview-panel__line-number" aria-hidden="true">{lineIndex + 1}</span>
            <div class="main-editor-preview-panel__output-line-body">
              <span class="main-editor-preview-panel__output-flow" aria-label={`Preview output line ${lineIndex + 1}`}>
                {#each outputLineSegments[lineIndex] ?? [] as segment, segmentIndex (`${lineIndex}-${segmentIndex}`)}
                  <span class="main-editor-preview-panel__output-text">{segment.text}</span>
                  {#if segment.lenses.length > 0}
                    <span class="main-editor-preview-panel__inline-lenses" aria-label={`Preview hints for output line ${lineIndex + 1}`}>
                      {#each segment.lenses as lens (lens.id)}
                        <details class={`main-editor-preview-panel__lens main-editor-preview-panel__lens--${lens.tone}`} title={lens.title} aria-label={lens.title}>
                          <summary class="main-editor-preview-panel__lens-summary">{lens.label}</summary>
                          <pre class="main-editor-preview-panel__lens-detail">{lens.detailLines.join('\n')}</pre>
                        </details>
                      {/each}
                    </span>
                  {/if}
                {/each}
              </span>
            </div>
          </div>
        {/if}
      {/each}
    </div>
  {:else if pending}
    <p class="main-editor-preview-panel__muted">Preview updating...</p>
  {:else}
    <p class="main-editor-preview-panel__muted">Edit CONTENT to generate a quick preview.</p>
  {/if}
</section>
