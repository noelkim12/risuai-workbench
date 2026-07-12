<script lang="ts">
  import { onMount } from 'svelte';
  import {
    anomalyLabel,
    buildGroupOverrides,
    detectFirstSlotCounts,
    detectSeparator,
    detectSlotCount,
    pruneStaleOverrides,
    seedFromBootstrapConfig,
    type GroupTokenCounts,
  } from '../../asset-manager/bootstrapGroups';
  import type {
    AssetCatalogBootstrapAnomalyReason,
    AssetCatalogBootstrapConfigMirror,
    AssetCatalogBootstrapGroupSummaryMirror,
    AssetCatalogBootstrapSplitOptions,
    AssetCatalogSchemaMirror,
    AssetSlotId,
    AssetSlotValues,
  } from '../../types/assetManager';

  type BootstrapSource = 'manifest' | 'filename';
  type BootstrapMode = 'full' | 'missing';
  const SHORT_ANOMALY: Record<AssetCatalogBootstrapAnomalyReason, string> = {
    'insufficient-tokens': '조각 부족',
    'vocab-overlap': '어휘 겹침',
  };

  export let schema: AssetCatalogSchemaMirror;
  export let catalogExists = true;
  /** catalog에 persist된 생성 규칙. 있으면 이 값으로 seed하고 자동 감지를 건너뛴다. */
  export let bootstrapConfig: AssetCatalogBootstrapConfigMirror | null = null;
  export let previewRows: readonly { readonly path: string; readonly name: string; readonly slots: AssetSlotValues | null }[];
  /** asset 스냅샷 세대. watcher가 파일 변화를 감지할 때마다 증가 — 모달이 열린 채로도 미리보기를 다시 요청한다. */
  export let assetRevision = 0;
  export let groups: readonly AssetCatalogBootstrapGroupSummaryMirror[] = [];
  export let onPreview: (source: BootstrapSource, mode: BootstrapMode, split: AssetCatalogBootstrapSplitOptions, schema: AssetCatalogSchemaMirror) => void;
  export let onSelect: (source: BootstrapSource, mode: BootstrapMode, split: AssetCatalogBootstrapSplitOptions, schema: AssetCatalogSchemaMirror) => void;
  export let onClose: () => void;

  const ALL_SLOT_IDS: readonly AssetSlotId[] = ['s1', 's2', 's3'];
  const DEFAULT_LABELS = ['character', 'emotion', 'attire'];

  let source: BootstrapSource = 'filename';
  let mode: BootstrapMode = 'full';
  let separator = '_';
  // 모달이 편집 가능한 스키마를 소유한다(슬롯 수/라벨/구분자). 적용 시 부트스트랩과 함께 전송된다.
  let slotCount: 1 | 2 | 3 = 2;
  let labels = [...DEFAULT_LABELS];

  // 마지막 슬롯은 remainder라 조각 수 지정 대상이 아니다. globalCounts는 비마지막 슬롯 조각 수만 담는다(원시 입력값).
  let globalCounts: GroupTokenCounts = {};
  let groupCounts = new Map<string, GroupTokenCounts>();
  let expandedGroups = new Set<string>();
  // 해결로 표시한 그룹(조각 부족 등을 확인/무시 처리). 세션 한정 UI 상태 — 서버 payload에는 영향 없음.
  let solvedGroups = new Set<string>();
  let groupSearch = '';
  let hideSolved = false;
  let prunedForGroups: typeof groups | null = null;
  let schemaSeeded = false;
  let autoDetected = false;
  let seenAssetRevision: number | null = null;

  $: slotIds = ALL_SLOT_IDS.slice(0, slotCount);
  $: nonLastSlotIds = slotIds.slice(0, -1);
  // 현재 슬롯 수 기준 비마지막 슬롯 조각 수 투영(원시 globalCounts에 잔여 키가 있어도 안전).
  $: effectiveGlobalCounts = Object.fromEntries(nonLastSlotIds.map((id) => [id, globalCounts[id] ?? 1])) as GroupTokenCounts;
  $: draftSchema = {
    slots: slotIds.map((id, index) => ({ id, label: labels[index]?.trim() || id })),
    joinTemplate: slotIds.map((id) => `{${id}}`).join(separator),
  } satisfies AssetCatalogSchemaMirror;

  // catalog 스키마에서 슬롯 수/라벨 1회 시드. persist된 bootstrap 규칙이 있으면
  // 구분자/조각 수/그룹 override를 그 값으로 복원한다(자동 감지보다 우선).
  $: if (schema && !schemaSeeded) {
    schemaSeeded = true;
    slotCount = Math.min(3, Math.max(1, schema.slots.length)) as 1 | 2 | 3;
    labels = DEFAULT_LABELS.map((def, index) => schema.slots[index]?.label ?? def);
    separator = joinTemplateSeparator(schema.joinTemplate);
    if (bootstrapConfig !== null) {
      const seed = seedFromBootstrapConfig(bootstrapConfig);
      separator = seed.separator;
      globalCounts = seed.globalCounts;
      groupCounts = seed.groupCounts;
    }
  }

  // previewRows가 처음 채워질 때 1회: persist된 규칙이 없을 때만 정적 감지를 돌린다.
  // 규칙이 있으면 seed된 상태 그대로 미리보기만 갱신한다(감지가 저장된 규칙을 덮어쓰지 않게).
  $: if (!autoDetected && previewRows.length > 0) {
    autoDetected = true;
    if (bootstrapConfig === null) runAutoDetect();
  }

  // 모달이 열린 뒤 watcher가 파일 변화를 보고하면(스냅샷 세대 증가) 미리보기를 다시 요청한다.
  // 모달이 스냅샷보다 먼저 떠서 빈 채로 남는 레이스 방지. 최초 렌더는 onMount의 refreshPreview가 담당.
  $: if (assetRevision !== seenAssetRevision) {
    const isFirst = seenAssetRevision === null;
    seenAssetRevision = assetRevision;
    if (!isFirst) refreshPreview();
  }

  // groups가 갱신될 때 한 번만 prune — groupCounts를 $: 의존성으로 직접 쓰면 자기참조 재실행이 되므로 guard 패턴 사용
  $: if (groups !== prunedForGroups) {
    prunedForGroups = groups;
    groupCounts = pruneStaleOverrides(groupCounts, groups);
    // 새 분석 결과에 없는 firstToken의 해결 표시는 폐기(재분석 시 stale 방지).
    const valid = new Set(groups.map((group) => group.firstToken));
    solvedGroups = new Set([...solvedGroups].filter((token) => valid.has(token)));
  }
  $: overriddenTokens = new Set(buildGroupOverrides(groupCounts, effectiveGlobalCounts).map((entry) => entry.firstToken));

  // 펼침 상태를 반응형 파생값으로 계산한다. 세 Set(expanded/solved/overridden)을 여기서 직접 참조해야
  // Svelte(legacy)가 각각의 변경을 추적한다 — isGroupOpen()을 템플릿에서 직접 호출하면 expandedGroups
  // 변경이 재렌더로 이어지지 않아 "문제 없는" 그룹이 클릭해도 펼쳐지지 않는다.
  $: openGroups = (() => {
    const open = new Set<string>();
    for (const group of groups) {
      // 해결로 표시한 그룹은 경고로 인한 자동 펼침을 멈춘다(직접 펼칠 때만 열림).
      const isOpen = solvedGroups.has(group.firstToken)
        ? expandedGroups.has(group.firstToken)
        : group.anomalies.length > 0 || expandedGroups.has(group.firstToken) || overriddenTokens.has(group.firstToken);
      if (isOpen) open.add(group.firstToken);
    }
    return open;
  })();

  // 검색어·해결됨 숨김 필터를 적용한 표시 대상 그룹. 미해결(경고) → 일반 → 해결됨 순으로 정렬.
  // 검색은 firstToken(캐릭터명)뿐 아니라 슬롯 값 표본·insufficient 예시까지 매칭한다(이상한 슬롯 값으로도 찾을 수 있게).
  $: normalizedSearch = groupSearch.trim().toLowerCase();
  $: visibleGroups = groups
    .filter((group) => {
      if (hideSolved && solvedGroups.has(group.firstToken)) return false;
      if (normalizedSearch && !groupMatchesSearch(group, normalizedSearch)) return false;
      return true;
    })
    .sort((a, b) => groupRank(a) - groupRank(b));
  $: unresolvedAnomalyCount = groups.filter((group) => group.anomalies.length > 0 && !solvedGroups.has(group.firstToken)).length;

  $: exampleName = previewRows[0]?.name ?? '';

  interface SlotSegment {
    readonly slot: AssetSlotId;
    readonly text: string;
  }

  function joinTemplateSeparator(joinTemplate: string): string {
    const parsed = /\}(.*?)\{/.exec(joinTemplate);
    return parsed ? parsed[1] : '_';
  }

  function runAutoDetect(): void {
    const names = previewRows.map((row) => row.name);
    if (!catalogExists) {
      // 최초 생성: 구분자 + 슬롯 수를 정적 분석으로 pre-fill. catalog가 있으면 스키마를 따른다.
      separator = detectSeparator(names, joinTemplateSeparator(schema.joinTemplate));
      slotCount = detectSlotCount(names, separator);
    }
    // s1 조각 수는 catalog에 persist되지 않으므로 항상 감지.
    const ids = ALL_SLOT_IDS.slice(0, slotCount);
    const nonLast = ids.slice(0, -1);
    if (nonLast.length > 0) {
      const detection = detectFirstSlotCounts(names, separator, ids.length);
      const base: GroupTokenCounts = {};
      for (const id of nonLast) base[id] = id === ids[0] ? detection.global : globalCounts[id] ?? 1;
      globalCounts = base;
      const nextGroups = new Map(groupCounts);
      for (const [token, s1] of detection.groupS1) {
        if (s1 !== detection.global) nextGroups.set(token, { ...base, [ids[0]]: s1 });
      }
      groupCounts = nextGroups;
    }
    refreshPreview();
  }

  function splitName(name: string, currentSeparator: string): readonly string[] {
    if (name.length === 0) return [];
    if (currentSeparator.trim() === '') return name.split(/[\s_]+/).filter(Boolean);
    return name.split(currentSeparator).map((part) => part.trim()).filter(Boolean);
  }

  function splitSegments(name: string, counts: GroupTokenCounts): readonly SlotSegment[] {
    const tokens = splitName(name, separator);
    const join = separator || ' ';
    const segments: SlotSegment[] = [];
    let offset = 0;
    for (let index = 0; index < slotIds.length; index += 1) {
      const id = slotIds[index];
      const isLast = index === slotIds.length - 1;
      const size = Math.max(0, isLast ? tokens.length - offset : counts[id] ?? 1);
      segments.push({ slot: id, text: tokens.slice(offset, offset + size).join(join) });
      offset += size;
    }
    return segments;
  }

  // 메시지 payload는 반응형 파생값(draftSchema/effectiveGlobalCounts) 대신 원시 상태에서 직접 계산한다.
  // runAutoDetect가 slotCount 등을 바꾼 뒤 같은 tick에 호출해도 최신 값이 반영되도록(반응형은 tick 뒤 갱신).
  function currentNonLastIds(): AssetSlotId[] {
    return ALL_SLOT_IDS.slice(0, slotCount).slice(0, -1);
  }

  function currentCounts(): GroupTokenCounts {
    const counts: GroupTokenCounts = {};
    for (const id of currentNonLastIds()) counts[id] = globalCounts[id] ?? 1;
    return counts;
  }

  function currentSchema(): AssetCatalogSchemaMirror {
    const ids = ALL_SLOT_IDS.slice(0, slotCount);
    return {
      slots: ids.map((id, index) => ({ id, label: labels[index]?.trim() || id })),
      joinTemplate: ids.map((id) => `{${id}}`).join(separator),
    };
  }

  function splitOptions(): AssetCatalogBootstrapSplitOptions {
    const counts = currentCounts();
    const groupOverrides = buildGroupOverrides(groupCounts, counts);
    return {
      separator,
      slotTokenCounts: counts,
      ...(groupOverrides.length > 0 && { groupOverrides }),
    };
  }

  function refreshPreview(): void {
    onPreview(source, mode, splitOptions(), currentSchema());
  }

  function applyBootstrap(): void {
    onSelect(source, mode, splitOptions(), currentSchema());
  }

  function slotsLabel(slots: AssetSlotValues | null): string {
    if (slots === null) return '—';
    return slotIds.map((slotId) => `${slotId}: ${slots[slotId] ?? '—'}`).join(' · ');
  }

  function groupCountsFor(firstToken: string): GroupTokenCounts {
    return groupCounts.get(firstToken) ?? effectiveGlobalCounts;
  }

  function groupExampleName(firstToken: string): string {
    return previewRows.find((row) => rowFirstToken(row.name) === firstToken)?.name ?? firstToken;
  }

  // insufficient-tokens 경고를 유발한 실제 항목이 있으면 그걸 예시로 쓴다(80행 미리보기 밖이어도 서버가 내려줌).
  function groupDemoName(group: AssetCatalogBootstrapGroupSummaryMirror): string {
    return group.insufficientExample ?? groupExampleName(group.firstToken);
  }

  // 위반 항목이 왜 규칙을 못 맞추는지 짚어주는 짧은 설명. 첫 번째로 비는 슬롯을 알려준다.
  function insufficientNote(name: string, counts: GroupTokenCounts): string {
    const tokenCount = splitName(name, separator).length;
    const emptySlot = splitSegments(name, counts).find((seg) => seg.text === '');
    return emptySlot ? `조각 ${tokenCount}개뿐, ${emptySlot.slot}를 못 채움` : `조각 ${tokenCount}개`;
  }

  function setGlobalCount(slot: AssetSlotId, value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > 8) return;
    globalCounts = { ...globalCounts, [slot]: value };
    refreshPreview();
  }

  function setGroupCount(firstToken: string, slot: AssetSlotId, value: number): void {
    if (!Number.isInteger(value) || value < 1 || value > 8) return;
    const current = groupCountsFor(firstToken);
    groupCounts = new Map(groupCounts).set(firstToken, { ...current, [slot]: value });
    refreshPreview();
  }

  function resetGroup(firstToken: string): void {
    const next = new Map(groupCounts);
    next.delete(firstToken);
    groupCounts = next;
    refreshPreview();
  }

  function toggleGroup(firstToken: string): void {
    const next = new Set(expandedGroups);
    if (next.has(firstToken)) next.delete(firstToken);
    else next.add(firstToken);
    expandedGroups = next;
  }

  // firstToken · 슬롯 값 표본 · insufficient 예시 어디든 부분일치하면 검색에 걸린다.
  function groupMatchesSearch(group: AssetCatalogBootstrapGroupSummaryMirror, needle: string): boolean {
    if (group.firstToken.toLowerCase().includes(needle)) return true;
    if (group.insufficientExample?.toLowerCase().includes(needle)) return true;
    return (group.sampleValues ?? []).some((value) => value.toLowerCase().includes(needle));
  }

  // 정렬 우선순위: 미해결 경고(0) → 일반(1) → 해결됨(2). Array.sort는 안정 정렬이라 동순위는 원래 순서 유지.
  function groupRank(group: AssetCatalogBootstrapGroupSummaryMirror): number {
    if (solvedGroups.has(group.firstToken)) return 2;
    if (group.anomalies.length > 0) return 0;
    return 1;
  }

  function toggleSolved(firstToken: string): void {
    const next = new Set(solvedGroups);
    if (next.has(firstToken)) next.delete(firstToken);
    else next.add(firstToken);
    solvedGroups = next;
  }

  function rowFirstToken(name: string): string {
    return splitName(name, separator)[0] ?? '';
  }

  onMount(refreshPreview);
</script>

{#snippet chips(name: string, counts: GroupTokenCounts)}
  <span class="cbm-chips">
    {#each splitSegments(name, counts) as seg}
      <span class="cbm-chip" data-slot={seg.slot} class:is-empty={seg.text === ''}>
        <span class="cbm-chip__k">{seg.slot}</span>
        <span class="cbm-chip__v">{seg.text || '—'}</span>
      </span>
    {/each}
  </span>
{/snippet}

<div class="modal-backdrop" role="presentation">
  <div class="cbm" role="dialog" aria-modal="true" aria-labelledby="catalog-bootstrap-title">
    <header class="cbm__header">
      <p class="cbm__eyebrow">Catalog Bootstrap</p>
      <h2 id="catalog-bootstrap-title">Catalog 생성 방식 선택</h2>
    </header>

    <div class="cbm__body" class:cbm__body--split={groups.length > 0}>
      <div class="cbm__col cbm__col--main">
    <div class="cbm__controls">
      <label>
        <span>소스</span>
        <select bind:value={source} onchange={refreshPreview}>
          <option value="filename">Asset file name</option>
          <option value="manifest">manifest.json name</option>
        </select>
      </label>
      <label>
        <span>모드</span>
        <select bind:value={mode} onchange={refreshPreview}>
          <option value="full">전체 재생성</option>
          <option value="missing">누락항목 생성</option>
        </select>
      </label>
      <label>
        <span>슬롯 수</span>
        <select bind:value={slotCount} onchange={refreshPreview}>
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <label>
        <span>구분자</span>
        <input type="text" bind:value={separator} maxlength="6" onchange={refreshPreview} />
      </label>
      {#each nonLastSlotIds as slotId (slotId)}
        <label>
          <span>{slotId} 조각 수</span>
          <input
            type="number"
            min="1"
            max="8"
            value={effectiveGlobalCounts[slotId] ?? 1}
            onchange={(event) => setGlobalCount(slotId, Number(event.currentTarget.value))}
          />
        </label>
      {/each}
    </div>

    <div class="cbm__labels" aria-label="Slot labels">
      {#each slotIds as slotId, index (slotId)}
        <label>
          <span>{slotId} 라벨</span>
          <input type="text" bind:value={labels[index]} placeholder={slotId} maxlength="24" />
        </label>
      {/each}
    </div>

    <section class="cbm-example" aria-label="Split rule example">
      <p class="cbm-example__hint">
        이름을 <code>{separator || ' '}</code>로 나눈 뒤 앞에서부터 각 슬롯에 담습니다. 마지막 슬롯은 남은 조각 전부.
        <span class="cbm-example__tmpl">템플릿 <code>{draftSchema.joinTemplate}</code></span>
      </p>
      <div class="cbm-demo">
        <span class="cbm-demo__name">{exampleName || '미리보기 갱신 후 표시됩니다'}</span>
        {#if exampleName}<span class="cbm-arrow" aria-hidden="true">→</span>{@render chips(exampleName, effectiveGlobalCounts)}{/if}
      </div>
    </section>
      </div>

      {#if groups.length > 0}
      <div class="cbm__col cbm__col--groups">
      <section class="cbm-groups" aria-label="Per-group split rules">
        <div class="cbm-groups__head">
          <strong>그룹별 규칙</strong>
          {#if unresolvedAnomalyCount > 0}
            <span class="cbm-groups__count">미해결 {unresolvedAnomalyCount}</span>
          {/if}
          <span class="cbm-groups__sub">캐릭터명(첫 조각) 기준. <em class="cbm-warn-ink">⚠ 표시</em>는 전역 규칙과 안 맞는 그룹이에요.</span>
        </div>
        <div class="cbm-groups__tools">
          <input
            class="cbm-groups__search"
            type="search"
            placeholder="그룹·슬롯 값 검색…"
            bind:value={groupSearch}
            aria-label="그룹 검색"
          />
          <label class="cbm-groups__filter">
            <input type="checkbox" bind:checked={hideSolved} />
            <span>해결됨 숨기기</span>
          </label>
        </div>
        <ul>
          {#each visibleGroups as group (group.firstToken)}
            {@const open = openGroups.has(group.firstToken)}
            {@const counts = groupCountsFor(group.firstToken)}
            {@const overridden = overriddenTokens.has(group.firstToken)}
            {@const solved = solvedGroups.has(group.firstToken)}
            {@const anomalous = group.anomalies.length > 0}
            {@const demoName = groupDemoName(group)}
            <li class="cbm-group" class:is-anomalous={anomalous && !solved} class:is-open={open} class:is-solved={solved}>
              <button type="button" class="cbm-group__row" onclick={() => toggleGroup(group.firstToken)} aria-expanded={open}>
                <span class="cbm-group__status" data-state={solved ? 'solved' : anomalous ? 'warn' : overridden ? 'edit' : 'ok'} aria-hidden="true"></span>
                <span class="cbm-group__name">{group.firstToken}</span>
                <span class="cbm-group__tags">
                  {#if solved}<span class="cbm-tag cbm-tag--solved">✓ 해결됨</span>{/if}
                  {#each group.anomalies as reason}
                    <span class="cbm-tag cbm-tag--warn" title={anomalyLabel(reason)}>{SHORT_ANOMALY[reason]}</span>
                  {/each}
                  {#if overridden}<span class="cbm-tag cbm-tag--edit">규칙 변경됨</span>{/if}
                </span>
                <span class="cbm-group__meta">{group.entryCount}개 · {group.tokenCountMin}{group.tokenCountMin === group.tokenCountMax ? '' : `~${group.tokenCountMax}`}조각</span>
                <span class="cbm-group__chevron" data-open={open} aria-hidden="true">›</span>
              </button>
              {#if open}
                <div class="cbm-group__body">
                  {#if anomalous}
                    <p class="cbm-group__reason">{group.anomalies.map(anomalyLabel).join(' · ')}</p>
                  {/if}
                  {#if group.insufficientExample !== undefined}
                    <p class="cbm-group__culprit">이 이름이 규칙을 못 맞춰요 ↓</p>
                  {/if}
                  <div class="cbm-demo cbm-demo--inset">
                    <span class="cbm-demo__name">{demoName}</span>
                    <span class="cbm-arrow" aria-hidden="true">→</span>
                    {@render chips(demoName, counts)}
                    {#if group.insufficientExample !== undefined}
                      <span class="cbm-group__culpritnote">({insufficientNote(demoName, counts)})</span>
                    {/if}
                  </div>
                  <div class="cbm-group__controls">
                    {#each nonLastSlotIds as slotId (slotId)}
                      <label>
                        {slotId}
                        <input
                          type="number"
                          min="1"
                          max="8"
                          value={counts[slotId] ?? 1}
                          onchange={(event) => setGroupCount(group.firstToken, slotId, Number(event.currentTarget.value))}
                        />
                      </label>
                    {/each}
                    {#if overridden}
                      <button type="button" class="cbm-linkbtn" onclick={() => resetGroup(group.firstToken)}>전역과 같게</button>
                    {/if}
                    <button
                      type="button"
                      class="cbm-linkbtn cbm-linkbtn--solve"
                      class:is-active={solved}
                      onclick={() => toggleSolved(group.firstToken)}
                    >{solved ? '해결 취소' : '✓ 해결로 표시'}</button>
                  </div>
                </div>
              {/if}
            </li>
          {:else}
            <li class="cbm-group cbm-group--empty">
              {normalizedSearch ? '일치하는 그룹이 없습니다.' : hideSolved ? '표시할 그룹이 없습니다.' : '그룹이 없습니다.'}
            </li>
          {/each}
        </ul>
      </section>
      </div>
      {/if}
    </div>

    <section class="cbm-preview" aria-label="Catalog bootstrap split preview">
      <p class="cbm-preview__caption">아래 표가 그대로 catalog assignment로 저장됩니다.</p>
      <table>
        <thead><tr><th>name</th><th>분할 결과</th></tr></thead>
        <tbody>
          {#each previewRows as row (row.path)}
            <tr class:is-invalid={row.slots === null}>
              <td>
                {row.name}
                {#if overriddenTokens.has(rowFirstToken(row.name))}<span class="cbm-tag cbm-tag--edit" title="그룹 규칙 변경됨">⚙</span>{/if}
              </td>
              <td>{slotsLabel(row.slots)}</td>
            </tr>
          {:else}
            <tr><td colspan="2">미리보기 항목이 없습니다.</td></tr>
          {/each}
        </tbody>
      </table>
    </section>

    <footer class="cbm__footer">
      <button type="button" class="cbm-btn cbm-btn--ghost" onclick={refreshPreview}>미리보기 갱신</button>
      <div class="cbm__footer-actions">
        <button type="button" class="cbm-btn cbm-btn--secondary" onclick={onClose}>취소</button>
        <button type="button" class="cbm-btn cbm-btn--primary" onclick={applyBootstrap}>이 분할로 적용</button>
      </div>
    </footer>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    background: rgb(0 0 0 / 45%);
  }
  .cbm {
    width: min(920px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-lg);
    background: var(--vscode-editor-background, #1e1e1e);
    box-shadow: 0 18px 64px rgb(0 0 0 / 35%);
    overflow: auto;
  }

  /* ── two-column body: config on the left, per-group rules on the right ── */
  .cbm__body { display: grid; gap: var(--space-3); }
  .cbm__body--split { grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr); align-items: start; }
  .cbm__col { display: grid; gap: var(--space-3); align-content: start; min-width: 0; }
  @media (max-width: 720px) {
    .cbm__body--split { grid-template-columns: minmax(0, 1fr); }
  }
  .cbm__header { display: grid; gap: 2px; }
  .cbm__eyebrow {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: color-mix(in srgb, var(--focus) 70%, var(--secondary-text));
  }
  .cbm h2 { margin: 0; font-size: 1.1rem; }

  /* ── controls ── */
  .cbm__controls {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .cbm__controls label { display: grid; gap: 4px; }
  .cbm__controls span { color: var(--secondary-text); font-size: var(--text-sm); font-weight: 700; }
  .cbm__controls select,
  .cbm__controls input {
    padding: 5px 8px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background, transparent);
    color: inherit;
    font: inherit;
  }

  /* ── slot labels ── */
  .cbm__labels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
  }
  .cbm__labels label { display: grid; gap: 4px; }
  .cbm__labels span { color: var(--secondary-text); font-size: var(--text-sm); font-weight: 700; }
  .cbm__labels input {
    padding: 5px 8px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background, transparent);
    color: inherit;
    font: inherit;
  }
  .cbm-example__tmpl { margin-left: 6px; }

  /* ── slot chips (shared visual language) ── */
  .cbm-chips { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .cbm-chip {
    display: inline-flex;
    align-items: stretch;
    border-radius: var(--radius-sm);
    overflow: hidden;
    font-size: var(--text-sm);
    line-height: 1.5;
  }
  .cbm-chip__k {
    padding: 0 5px;
    font-size: 0.7em;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--accent-text);
    display: inline-flex;
    align-items: center;
  }
  .cbm-chip__v {
    padding: 1px 7px;
    font-weight: 600;
    background: var(--secondary);
    color: inherit;
  }
  .cbm-chip[data-slot='s1'] .cbm-chip__k { background: color-mix(in srgb, var(--accent) 85%, transparent); }
  .cbm-chip[data-slot='s2'] .cbm-chip__k { background: color-mix(in srgb, var(--focus) 78%, #888); }
  .cbm-chip[data-slot='s3'] .cbm-chip__k { background: color-mix(in srgb, var(--secondary-text) 55%, transparent); }
  .cbm-chip.is-empty { opacity: 0.4; }

  .cbm-demo {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .cbm-demo__name {
    padding: 1px 7px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--secondary-text) 16%, transparent);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--text-sm);
  }
  .cbm-arrow { color: var(--secondary-text); font-weight: 700; }

  /* ── example ── */
  .cbm-example {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--focus) 34%, var(--card-border));
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--focus) 8%, transparent);
  }
  .cbm-example__hint { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); line-height: 1.5; }
  .cbm-example__hint code {
    padding: 0 5px;
    border-radius: var(--radius-sm);
    background: var(--secondary);
    font-weight: 700;
  }

  /* ── groups ── */
  .cbm-groups {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 6px;
    padding: var(--space-2) var(--space-3) var(--space-3);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    max-height: min(62vh, 560px);
    overflow: hidden;
  }
  .cbm-groups__head { display: flex; align-items: baseline; gap: var(--space-2); flex-wrap: wrap; }
  .cbm-groups__sub { color: var(--secondary-text); font-size: var(--text-sm); }
  .cbm-groups__count {
    padding: 1px 7px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    color: var(--vscode-editorWarning-foreground, #cca700);
    background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 18%, transparent);
  }
  .cbm-warn-ink { font-style: normal; color: var(--vscode-editorWarning-foreground, #cca700); font-weight: 700; }

  /* ── group search + filter ── */
  .cbm-groups__tools { display: flex; align-items: center; gap: var(--space-2); }
  .cbm-groups__search {
    flex: 1 1 auto;
    min-width: 0;
    padding: 5px 8px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background, transparent);
    color: inherit;
    font: inherit;
  }
  .cbm-groups__filter {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex: none;
    color: var(--secondary-text);
    font-size: var(--text-sm);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .cbm-groups__filter input { accent-color: var(--focus); }

  .cbm-groups ul { display: grid; gap: 4px; margin: 0; padding: 2px 0; list-style: none; overflow: auto; align-content: start; }
  .cbm-group--empty {
    padding: 12px 8px;
    color: var(--secondary-text);
    font-size: var(--text-sm);
    text-align: center;
    background: none;
  }
  .cbm-group {
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--secondary-text) 6%, transparent);
  }
  .cbm-group.is-open { border-color: var(--card-border); background: color-mix(in srgb, var(--secondary-text) 9%, transparent); }
  .cbm-group.is-anomalous { background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 12%, transparent); }
  .cbm-group.is-anomalous.is-open { border-color: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 45%, transparent); }
  .cbm-group.is-solved { opacity: 0.6; }
  .cbm-group.is-solved .cbm-group__name { text-decoration: line-through; text-decoration-color: color-mix(in srgb, var(--secondary-text) 60%, transparent); }

  .cbm-group__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 6px 8px;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .cbm-group__row:hover:not(:disabled) { outline: none; }
  .cbm-group__status {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--secondary-text) 45%, transparent);
  }
  .cbm-group__status[data-state='warn'] { background: var(--vscode-editorWarning-foreground, #cca700); }
  .cbm-group__status[data-state='edit'] { background: var(--focus); }
  .cbm-group__status[data-state='solved'] { background: var(--vscode-testing-iconPassed, #4caf50); }
  .cbm-group__name { font-weight: 700; font-size: var(--text-sm); }
  .cbm-group__tags { display: inline-flex; gap: 4px; flex-wrap: wrap; }
  .cbm-group__meta { margin-left: auto; color: var(--secondary-text); font-size: var(--text-sm); white-space: nowrap; }
  .cbm-group__chevron {
    flex: none;
    color: var(--secondary-text);
    font-size: 1.1em;
    line-height: 1;
    transition: transform 0.12s ease;
  }
  .cbm-group__chevron[data-open='true'] { transform: rotate(90deg); }

  .cbm-tag {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1.5;
  }
  .cbm-tag--warn {
    color: var(--vscode-editorWarning-foreground, #cca700);
    background: color-mix(in srgb, var(--vscode-editorWarning-foreground, #cca700) 18%, transparent);
  }
  .cbm-tag--edit {
    color: var(--focus);
    background: color-mix(in srgb, var(--focus) 18%, transparent);
  }
  .cbm-tag--solved {
    color: var(--vscode-testing-iconPassed, #4caf50);
    background: color-mix(in srgb, var(--vscode-testing-iconPassed, #4caf50) 18%, transparent);
  }

  .cbm-group__body {
    display: grid;
    gap: var(--space-2);
    padding: 0 8px 8px 22px;
  }
  .cbm-group__reason { margin: 0; color: var(--vscode-editorWarning-foreground, #cca700); font-size: var(--text-sm); }
  .cbm-group__culprit { margin: 0; color: var(--secondary-text); font-size: var(--text-sm); }
  .cbm-group__culpritnote { color: var(--vscode-editorWarning-foreground, #cca700); font-size: var(--text-sm); font-weight: 600; }
  .cbm-demo--inset {
    padding: 6px 8px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--secondary-text) 8%, transparent);
  }
  .cbm-group__controls { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
  .cbm-group__controls label { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; color: var(--secondary-text); }
  .cbm-group__controls input {
    width: 52px;
    padding: 3px 6px;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-sm);
    background: var(--vscode-input-background, transparent);
    color: inherit;
    font: inherit;
  }
  .cbm-linkbtn {
    padding: 2px 4px;
    border: none;
    background: none;
    color: var(--focus);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: 700;
    cursor: pointer;
    text-decoration: underline;
  }
  .cbm-linkbtn:hover { outline: none; }
  .cbm-linkbtn--solve { margin-left: auto; color: var(--vscode-testing-iconPassed, #4caf50); }
  .cbm-linkbtn--solve.is-active { color: var(--secondary-text); }

  /* ── preview table ── */
  .cbm-preview {
    max-height: 300px;
    overflow: auto;
    border: 1px solid var(--card-border);
    border-radius: var(--radius-md);
    padding: var(--space-2);
  }
  .cbm-preview__caption { margin: 0 0 var(--space-2); color: var(--secondary-text); font-size: var(--text-sm); }
  .cbm-preview table { width: 100%; border-collapse: collapse; font-size: var(--text-sm); }
  .cbm-preview th,
  .cbm-preview td { padding: 4px 6px; border-top: 1px solid var(--card-border); text-align: left; }
  .cbm-preview thead th { border-top: none; color: var(--secondary-text); font-weight: 700; }
  .cbm-preview tr.is-invalid td { color: var(--vscode-errorForeground, #f48771); }

  /* ── footer ── */
  .cbm__footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
  .cbm__footer-actions { display: flex; gap: var(--space-2); }
  .cbm__footer .cbm-btn {
    padding: 5px 14px;
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    font-weight: 600;
  }
  .cbm-btn--primary { color: var(--accent-text); background: var(--accent); }
  .cbm-btn--secondary { color: var(--secondary-text); background: var(--secondary); }
  .cbm-btn--ghost {
    color: var(--secondary-text);
    background: none;
    border: 1px solid transparent;
  }
  .cbm-btn--ghost:hover:not(:disabled) { background: color-mix(in srgb, var(--secondary-text) 12%, transparent); outline: none; }
</style>
