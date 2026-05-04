<!--
  Marker Editor live preview panel.
  @file packages/webview/src/lib/components/editor/marker/LivePreview.svelte
-->

<script lang="ts">
  import cosmosBottomTextureUrl from '../../../assets/live-preview-effects/cosmos-bottom.png';
  import cosmosMiddleTextureUrl from '../../../assets/live-preview-effects/cosmos-middle-trans.png';
  import cosmosTopTextureUrl from '../../../assets/live-preview-effects/cosmos-top-trans.png';
  import glitterTextureUrl from '../../../assets/live-preview-effects/glitter.png';
  import grainTextureUrl from '../../../assets/live-preview-effects/grain.webp';
  import type { CharacterEditFields, MarkerEditorMode, ModuleEditFields } from '../../../types/markerEditor';
  // biome-ignore lint/correctness/noUnusedImports: Svelte markup consumes this component.
  import TagChip from '../../TagChip.svelte';

  export let mode: MarkerEditorMode;
  export let fields: CharacterEditFields | ModuleEditFields;
  export let imageUri: string | undefined = undefined;

  const MAX_TILT = 16;

  type PreviewEffectPresetId = 'aurora' | 'cosmos' | 'matrix';
  type PreviewCardThemeId = 'ember' | 'lagoon' | 'violet' | 'mono' | 'sapphire' | 'rose';

  type PreviewEffectPreset = {
    id: PreviewEffectPresetId;
    label: string;
    description: string;
    accent: string;
    glow: string;
    shineBlend: string;
    texturePrimary: string;
    textureSecondary: string;
    textureTertiary: string;
    grain: string;
    sparkle: string;
    intensity: number;
  };

  type PreviewCardTheme = {
    id: PreviewCardThemeId;
    label: string;
    description: string;
    frame: string;
    frameDark: string;
    paper: string;
    panel: string;
    glow: string;
    holoA: string;
    holoB: string;
    holoC: string;
  };

  const PREVIEW_CARD_THEMES: readonly PreviewCardTheme[] = [
    {
      id: 'ember',
      label: 'Ember',
      description: 'Warm rare-card frame with amber paper and pink-gold foil.',
      frame: '#f59e0b',
      frameDark: '#9a3412',
      paper: '#3a2417',
      panel: '#2d1b14',
      glow: '#fbbf24',
      holoA: '#f97316',
      holoB: '#fb7185',
      holoC: '#fde68a',
    },
    {
      id: 'lagoon',
      label: 'Lagoon',
      description: 'Cool teal shell frame with glassy cyan-green highlights.',
      frame: '#14b8a6',
      frameDark: '#0f766e',
      paper: '#102f35',
      panel: '#0d2529',
      glow: '#5eead4',
      holoA: '#22d3ee',
      holoB: '#34d399',
      holoC: '#a7f3d0',
    },
    {
      id: 'violet',
      label: 'Violet',
      description: 'Deep arcane violet frame with sapphire and rose foil hits.',
      frame: '#8b5cf6',
      frameDark: '#5b21b6',
      paper: '#24183d',
      panel: '#1e1633',
      glow: '#c4b5fd',
      holoA: '#a78bfa',
      holoB: '#60a5fa',
      holoC: '#f0abfc',
    },
    {
      id: 'mono',
      label: 'Mono',
      description: 'Smoked graphite card with precise silver-blue holo edges.',
      frame: '#94a3b8',
      frameDark: '#334155',
      paper: '#171923',
      panel: '#111827',
      glow: '#cbd5e1',
      holoA: '#e2e8f0',
      holoB: '#93c5fd',
      holoC: '#64748b',
    },
    {
      id: 'sapphire',
      label: 'Sapphire',
      description: 'Deep royal blue frame with ice-blue sapphire and indigo foil.',
      frame: '#3b82f6',
      frameDark: '#1d4ed8',
      paper: '#0c1929',
      panel: '#081020',
      glow: '#60a5fa',
      holoA: '#38bdf8',
      holoB: '#818cf8',
      holoC: '#93c5fd',
    },
    {
      id: 'rose',
      label: 'Rose',
      description: 'Rich crimson-rose frame with coral and gold foil highlights.',
      frame: '#e11d48',
      frameDark: '#9f1239',
      paper: '#290c18',
      panel: '#1f0812',
      glow: '#fb7185',
      holoA: '#f43f5e',
      holoB: '#fbbf24',
      holoC: '#fecdd3',
    },
  ];

  const PREVIEW_EFFECT_PRESETS: readonly PreviewEffectPreset[] = [
    {
      id: 'aurora',
      label: 'Aurora',
      description: 'Rainbow foil with glitter and a stronger cursor glare.',
      accent: '#ff5fd7',
      glow: '#78f7ff',
      shineBlend: 'screen',
      texturePrimary: glitterTextureUrl,
      textureSecondary: grainTextureUrl,
      textureTertiary: grainTextureUrl,
      grain: cosmosBottomTextureUrl,
      sparkle: glitterTextureUrl,
      intensity: 0.72,
    },
    {
      id: 'cosmos',
      label: 'Cosmos',
      description: 'Layered star holo textures with cooler violet highlights.',
      accent: '#a78bfa',
      glow: '#8be9ff',
      shineBlend: 'screen',
      texturePrimary: cosmosMiddleTextureUrl,
      textureSecondary: cosmosTopTextureUrl,
      textureTertiary: glitterTextureUrl,
      grain: grainTextureUrl,
      sparkle: glitterTextureUrl,
      intensity: 0.86,
    },
    {
      id: 'matrix',
      label: 'Matrix',
      description: 'Low-noise green module grid with scanline glare.',
      accent: '#70f0a8',
      glow: '#38f2c2',
      shineBlend: 'overlay',
      texturePrimary: grainTextureUrl,
      textureSecondary: grainTextureUrl,
      textureTertiary: grainTextureUrl,
      grain: grainTextureUrl,
      sparkle: grainTextureUrl,
      intensity: 0.58,
    },
  ];

  let cardEl: HTMLElement | null = null;
  let tiltX = 0;
  let tiltY = 0;
  let glareX = 50;
  let glareY = 50;
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this state as a class directive.
  let isInteracting = false;
  let isCardSettingsOpen = false;
  let selectedThemeId: PreviewCardThemeId = 'mono';
  let selectedPresetId: PreviewEffectPresetId = 'aurora';

  $: isCharacterMode = mode === 'character';
  $: characterFields = isCharacterMode ? (fields as CharacterEditFields) : null;
  $: moduleFields = isCharacterMode ? null : (fields as ModuleEditFields);
  $: previewName = fields.name.trim() || 'Unnamed';
  $: creatorName = characterFields?.creator.trim() || 'Unknown Creator';
  $: characterVersion = characterFields?.characterVersion.trim() || '';
  $: moduleNamespace = moduleFields?.namespace.trim() || '';
  $: moduleDescription = moduleFields?.description.trim() || '';
  $: cardKind = isCharacterMode ? 'Character' : 'Module';
  $: stageLabel = isCharacterMode ? 'Basic Character' : 'Module Card';
  $: editionLabel = characterVersion ? `v${characterVersion}` : moduleNamespace || 'Draft';
  $: imageCaption = isCharacterMode
    ? `Creator · ${creatorName}`
    : moduleNamespace
      ? `Namespace · ${moduleNamespace}`
      : 'Module Preview';
  $: flavorText = isCharacterMode
    ? `Created by ${creatorName}`
    : moduleDescription || 'Configure the module details to complete this preview.';
  $: tags = characterFields?.tags ?? [];
  $: visibleTags = tags.slice(0, 3);
  $: hiddenTagCount = Math.max(tags.length - visibleTags.length, 0);
  $: rarityText = isCharacterMode ? '' : '';
  $: typeInitial = isCharacterMode ? 'C' : 'M';
  $: cardClass = `live-preview__card live-preview__card--${mode} live-preview__card--theme-${selectedThemeId} live-preview__card--effect-${selectedPresetId}`;
  $: selectedTheme = PREVIEW_CARD_THEMES.find((theme) => theme.id === selectedThemeId) ?? PREVIEW_CARD_THEMES[0];
  $: selectedPreset = PREVIEW_EFFECT_PRESETS.find((preset) => preset.id === selectedPresetId) ?? PREVIEW_EFFECT_PRESETS[0];
  $: previewCardStyle = buildPreviewCardStyle(selectedPreset, selectedTheme, tiltX, tiltY, glareX, glareY);

  /**
   * clampPreviewValue 함수.
   * 포인터 비율과 glare 좌표를 안전한 범위로 제한함.
   *
   * @param value - 제한할 현재 계산값
   * @param min - 허용할 최솟값
   * @param max - 허용할 최댓값
   * @returns 지정 범위 안으로 보정된 값
   */
  function clampPreviewValue(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
  }

  /**
   * buildPreviewCardStyle 함수.
   * Pointer tilt 값과 선택된 theme/effect 값을 카드 CSS 변수 문자열로 변환함.
   *
   * @param preset - 현재 라이브 프리뷰에 적용할 효과 preset
   * @param theme - 현재 라이브 프리뷰에 적용할 카드 theme
   * @param currentTiltX - 카드 X축 회전 각도
   * @param currentTiltY - 카드 Y축 회전 각도
   * @param currentGlareX - glare 중심 X 좌표 비율
   * @param currentGlareY - glare 중심 Y 좌표 비율
   * @returns 카드 article에 주입할 CSS 변수 문자열
   */
  function buildPreviewCardStyle(
    preset: PreviewEffectPreset,
    theme: PreviewCardTheme,
    currentTiltX: number,
    currentTiltY: number,
    currentGlareX: number,
    currentGlareY: number,
  ): string {
    return [
      `--tilt-x: ${currentTiltX}deg`,
      `--tilt-y: ${currentTiltY}deg`,
      `--glare-x: ${currentGlareX}%`,
      `--glare-y: ${currentGlareY}%`,
      `--preview-frame: ${theme.frame}`,
      `--preview-frame-dark: ${theme.frameDark}`,
      `--preview-paper: color-mix(in srgb, var(--card) 72%, ${theme.paper})`,
      `--preview-panel: color-mix(in srgb, var(--section) 72%, ${theme.panel})`,
      `--preview-glow: ${theme.glow}`,
      `--preview-holo-a: ${theme.holoA}`,
      `--preview-holo-b: ${theme.holoB}`,
      `--preview-holo-c: ${theme.holoC}`,
      `--preview-effect-accent: ${preset.accent}`,
      `--preview-effect-glow: ${preset.glow}`,
      `--preview-effect-blend: ${preset.shineBlend}`,
      `--preview-effect-primary: url("${preset.texturePrimary}")`,
      `--preview-effect-secondary: url("${preset.textureSecondary}")`,
      `--preview-effect-tertiary: url("${preset.textureTertiary}")`,
      `--preview-effect-grain: url("${preset.grain}")`,
      `--preview-effect-sparkle: url("${preset.sparkle}")`,
      `--preview-effect-intensity: ${preset.intensity}`,
    ].join('; ');
  }

  /**
   * updatePreviewTilt 함수.
   * 카드 영역 안의 포인터 좌표를 tilt와 glare CSS 변수 상태로 변환함.
   *
   * @param event - 카드 위에서 발생한 포인터 이벤트
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function updatePreviewTilt(event: PointerEvent) {
    if (!cardEl) {
      return;
    }

    const rect = cardEl.getBoundingClientRect();
    const pointerX = clampPreviewValue((event.clientX - rect.left) / rect.width, 0, 1);
    const pointerY = clampPreviewValue((event.clientY - rect.top) / rect.height, 0, 1);
    const normalizedX = pointerX * 2 - 1;
    const normalizedY = pointerY * 2 - 1;

    tiltX = clampPreviewValue(-normalizedY * MAX_TILT, -MAX_TILT, MAX_TILT);
    tiltY = clampPreviewValue(normalizedX * MAX_TILT, -MAX_TILT, MAX_TILT);
    glareX = pointerX * 100;
    glareY = pointerY * 100;
    isInteracting = true;
  }

  /**
   * resetPreviewTilt 함수.
   * 포인터 상호작용이 끝난 카드의 tilt와 glare를 중립 상태로 되돌림.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function resetPreviewTilt() {
    tiltX = 0;
    tiltY = 0;
    glareX = 50;
    glareY = 50;
    isInteracting = false;
  }

  /**
   * selectPreviewPreset 함수.
   * 버튼 그룹에서 선택한 효과 preset을 현재 라이브 프리뷰에 적용함.
   *
   * @param presetId - 활성화할 preview effect preset id
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function selectPreviewPreset(presetId: PreviewEffectPresetId): void {
    selectedPresetId = presetId;
  }

  /**
   * toggleCardSettings 함수.
   * 카드 theme/effect 설정 패널의 노출 상태를 전환함.
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function toggleCardSettings(): void {
    isCardSettingsOpen = !isCardSettingsOpen;
  }

  /**
   * clickOutside 함수.
   * 대상 노드 외부 클릭과 Escape 입력을 감지해 설정 패널을 닫음.
   *
   * @param node - 외부 클릭을 감지할 기준 DOM 노드
   * @param params - 감지 활성화 여부와 닫기 콜백
   * @returns Svelte action update/destroy 핸들러
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this action.
  function clickOutside(node: HTMLElement, params: { enabled: boolean; onOut: () => void }) {
    function handleClick(event: MouseEvent): void {
      if (params.enabled && !node.contains(event.target as Node)) {
        params.onOut();
      }
    }

    function handleKeydown(event: KeyboardEvent): void {
      if (params.enabled && event.key === 'Escape') {
        params.onOut();
        event.stopPropagation();
      }
    }

    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeydown, true);

    return {
      update(newParams: { enabled: boolean; onOut: () => void }): void {
        params = newParams;
      },
      destroy(): void {
        document.removeEventListener('click', handleClick, true);
        document.removeEventListener('keydown', handleKeydown, true);
      },
    };
  }

  /**
   * selectPreviewTheme 함수.
   * 버튼 그룹에서 선택한 카드 theme을 현재 라이브 프리뷰에 적용함.
   *
   * @param themeId - 활성화할 preview card theme id
   */
  // biome-ignore lint/correctness/noUnusedVariables: Svelte markup consumes this handler.
  function selectPreviewTheme(themeId: PreviewCardThemeId): void {
    selectedThemeId = themeId;
  }
</script>

<section class="live-preview" aria-label="Live Preview">
  <h2 class="live-preview__heading">Live Preview</h2>

  <article
    bind:this={cardEl}
    class={cardClass}
    class:is-interacting={isInteracting}
    style={previewCardStyle}
    aria-label={`${previewName} preview card`}
    on:pointermove={updatePreviewTilt}
    on:pointerleave={resetPreviewTilt}
    on:pointercancel={resetPreviewTilt}
  >
    <div class="live-preview__foil" aria-hidden="true"></div>
    <div class="live-preview__sparkle" aria-hidden="true"></div>
    <div class="live-preview__texture" aria-hidden="true"></div>
    <div class="live-preview__shine" aria-hidden="true"></div>
    <div class="live-preview__glare" aria-hidden="true"></div>

    <div class="live-preview__inner">
      <div class="live-preview__topline">
        <span class="live-preview__stage">{stageLabel}</span>
        <span class="live-preview__edition">{editionLabel}</span>
      </div>

      <div class="live-preview__name-row">
        <h3 class="live-preview__name">{previewName}</h3>
        <div class="live-preview__type-cluster" aria-label={`${rarityText} ${cardKind}`}>
          <span class="live-preview__rarity-mark">★</span>
          <span class="live-preview__type-orb">{typeInitial}</span>
        </div>
      </div>

      <div class="live-preview__art-card">
        <div class="live-preview__image-frame">
          <span class="live-preview__image-badge">{cardKind}</span>
          {#if imageUri}
            <div class="live-preview__avatar">
              <img src={imageUri} alt={`${previewName} preview`} class="live-preview__avatar-img" />
            </div>
          {:else}
            <div class="live-preview__avatar live-preview__avatar--empty">
              <span class="live-preview__avatar-placeholder">No Image</span>
            </div>
          {/if}
        </div>
        <p class="live-preview__image-caption">{imageCaption}</p>
      </div>

      <div class="live-preview__ability-panel">
        <div class="live-preview__section-title">
          <span>{isCharacterMode ? 'Tags / Abilities' : 'Module Text'}</span>
          <span>{rarityText}</span>
        </div>

        {#if isCharacterMode}
          {#if visibleTags.length > 0}
            <div class="live-preview__tag-rows" aria-label="Preview tags">
              {#each visibleTags as tag, tagIndex}
                <div class={`live-preview__tag-row live-preview__tag-row--${tagIndex % 4}`}>
                  <span class="live-preview__energy-dot" aria-hidden="true"></span>
                  <span class="live-preview__tag-name">
                    <TagChip label={tag} />
                  </span>
                  <span class="live-preview__tag-rarity" aria-hidden="true">✦</span>
                </div>
              {/each}
            </div>

            {#if hiddenTagCount > 0}
              <p class="live-preview__more-tags">+{hiddenTagCount} more tag{hiddenTagCount > 1 ? 's' : ''}</p>
            {/if}
          {:else}
            <p class="live-preview__flavor-text">{flavorText}</p>
          {/if}
        {:else}
          <p class="live-preview__flavor-text">{flavorText}</p>
        {/if}
      </div>

      <div class="live-preview__status-grid" aria-label="Preview card stats">
        {#if characterFields}
          <div class="live-preview__status" class:is-off={!characterFields.utilityBot}>
            <span class="live-preview__status-dot"></span>
            Utility Bot
          </div>
        {/if}

        <div class="live-preview__status" class:is-off={!fields.lowLevelAccess}>
          <span class="live-preview__status-dot"></span>
          Low Level Access
        </div>

        {#if moduleFields}
          <div class="live-preview__status" class:is-off={moduleFields.hideIcon}>
            <span class="live-preview__status-dot"></span>
            Hide Icon
          </div>
        {/if}
      </div>

      <div class="live-preview__footer" aria-hidden="true">
        <span>Root Marker · {cardKind}</span>
        <span>{rarityText}</span>
      </div>
    </div>

  </article>

  <div
    class="live-preview__settings-shell"
    use:clickOutside={{ enabled: isCardSettingsOpen, onOut: () => (isCardSettingsOpen = false) }}
  >
    <button
      type="button"
      class="live-preview__settings-toggle"
      aria-expanded={isCardSettingsOpen}
      aria-controls="live-preview-card-settings"
      on:click={toggleCardSettings}
    >
      <span aria-hidden="true">⚙</span>
      <span class="live-preview__settings-toggle-label">{selectedTheme.label} · {selectedPreset.label}</span>
      <span class="live-preview__settings-toggle-icon" aria-hidden="true">▽</span>
    </button>

    <div
      id="live-preview-card-settings"
      class="live-preview__settings-panel"
      class:is-open={isCardSettingsOpen}
      aria-hidden={!isCardSettingsOpen}
    >
      <div class="live-preview__settings-group">
        <p class="live-preview__settings-label">Card Theme</p>
        <div class="live-preview__preset-bar" aria-label="Live preview card themes">
          {#each PREVIEW_CARD_THEMES as theme}
            <button
              type="button"
              class="live-preview__preset-button live-preview__preset-button--theme"
              class:is-active={theme.id === selectedThemeId}
              aria-pressed={theme.id === selectedThemeId}
              title={theme.description}
              on:click={() => selectPreviewTheme(theme.id)}
            >
              <span
                class="live-preview__preset-swatch live-preview__preset-swatch--theme"
                aria-hidden="true"
                style={`--preset-swatch: ${theme.glow}; --preset-swatch-alt: ${theme.frame};`}
              ></span>
              <span>{theme.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="live-preview__settings-group">
        <p class="live-preview__settings-label">Effect</p>
        <div class="live-preview__preset-bar" aria-label="Live preview effect presets">
          {#each PREVIEW_EFFECT_PRESETS as preset}
            <button
              type="button"
              class="live-preview__preset-button"
              class:is-active={preset.id === selectedPresetId}
              aria-pressed={preset.id === selectedPresetId}
              title={preset.description}
              on:click={() => selectPreviewPreset(preset.id)}
            >
              <span class="live-preview__preset-swatch" aria-hidden="true" style={`--preset-swatch: ${preset.accent};`}></span>
              <span>{preset.label}</span>
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
</section>

<style>
  .live-preview__settings-shell {
    position: relative;
    z-index: 2;
    width: min(100%, 390px);
    margin: var(--space-2) auto 0;
    text-align: right;
  }

  .live-preview__settings-toggle {
    width: auto;
    max-width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: 0;
    min-height: 38px;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border: 1px solid color-mix(in srgb, var(--preview-glow, var(--focus)) 34%, var(--card-border));
    border-radius: var(--radius-pill);
    color: var(--text);
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--preview-holo-a, var(--warning)) 16%, transparent), transparent 48%),
      linear-gradient(180deg, color-mix(in srgb, white 8%, transparent), transparent 58%),
      color-mix(in srgb, var(--surface) 78%, var(--card));
    backdrop-filter: blur(14px) saturate(1.24);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
      0 8px 20px color-mix(in srgb, var(--vscode-widget-shadow) 30%, transparent),
      0 0 18px color-mix(in srgb, var(--preview-glow, var(--focus)) 12%, transparent);
    font: inherit;
    cursor: pointer;
    transition:
      background 160ms ease,
      border-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  .live-preview__settings-toggle[aria-expanded='true'] {
    border-color: color-mix(in srgb, var(--preview-glow, var(--focus)) 56%, var(--card-border));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 12%, transparent),
      0 10px 24px color-mix(in srgb, var(--vscode-widget-shadow) 34%, transparent),
      0 0 22px color-mix(in srgb, var(--preview-glow, var(--focus)) 18%, transparent);
  }

  .live-preview__settings-toggle:hover,
  .live-preview__settings-toggle:focus-visible {
    border-color: color-mix(in srgb, var(--preview-glow, var(--focus)) 58%, var(--card-border));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 14%, transparent),
      0 12px 26px color-mix(in srgb, var(--vscode-widget-shadow) 48%, transparent),
      0 0 18px color-mix(in srgb, var(--preview-glow, var(--focus)) 18%, transparent);
    outline: none;
    transform: translateY(-1px);
  }

  .live-preview__settings-toggle-label {
    min-width: 0;
    overflow: hidden;
    display: inline-flex;
    gap: var(--space-1);
    align-items: center;
    max-width: 230px;
    color: color-mix(in srgb, var(--preview-glow, var(--focus)) 76%, var(--text));
    font-size: var(--text-xs);
    font-weight: 900;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .live-preview__settings-toggle-icon {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border: 1px solid color-mix(in srgb, var(--preview-glow, var(--focus)) 36%, var(--card-border));
    border-radius: var(--radius-pill);
    color: color-mix(in srgb, var(--preview-glow, var(--focus)) 84%, white 12%);
    background: color-mix(in srgb, var(--card) 76%, var(--preview-glow, var(--focus)));
    transition: transform 160ms ease;
  }

  .live-preview__settings-toggle[aria-expanded='true'] .live-preview__settings-toggle-icon {
    transform: rotate(180deg);
  }

  .live-preview__settings-panel {
    position: absolute;
    bottom: calc(100% + var(--space-1));
    left: 0;
    width: min(100%, 380px);
    max-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0 var(--space-3);
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--preview-glow, var(--focus)) 28%, var(--card-border));
    border-radius: var(--radius-lg);
    background:
      linear-gradient(180deg, color-mix(in srgb, white 8%, transparent), transparent 48%),
      radial-gradient(circle at 18% 8%, color-mix(in srgb, var(--preview-holo-b, var(--focus)) 14%, transparent), transparent 38%),
      color-mix(in srgb, var(--preview-panel, var(--section)) 78%, var(--surface));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 10%, transparent),
      0 14px 28px color-mix(in srgb, var(--vscode-widget-shadow) 26%, transparent),
      0 0 22px color-mix(in srgb, var(--preview-glow, var(--focus)) 12%, transparent);
    opacity: 0;
    pointer-events: none;
    transform: translateY(var(--space-1));
    transition:
      max-height 220ms ease,
      opacity 220ms ease,
      padding 220ms ease,
      transform 220ms ease,
      visibility 220ms ease;
    visibility: hidden;
    backdrop-filter: blur(16px) saturate(1.18);
    z-index: 10;
  }

  .live-preview__settings-panel.is-open {
    max-height: 260px;
    opacity: 1;
    padding: var(--space-3);
    pointer-events: auto;
    transform: translateY(0);
    visibility: visible;
  }

  .live-preview__settings-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .live-preview__settings-label {
    margin: 0;
    color: color-mix(in srgb, var(--muted) 76%, var(--text));
    font-size: var(--text-xs);
    font-weight: 950;
    letter-spacing: 0.11em;
    line-height: 1;
    text-transform: uppercase;
  }

  .live-preview__preset-bar {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
    justify-content: center;
    margin: 0;
  }

  .live-preview__preset-button {
    display: inline-flex;
    gap: var(--space-2);
    align-items: center;
    min-height: 30px;
    padding: var(--space-1) var(--space-3) var(--space-1) var(--space-2);
    border: 1px solid color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 28%, var(--card-border));
    border-radius: var(--radius-pill);
    color: color-mix(in srgb, var(--text) 82%, var(--muted));
    font: inherit;
    font-size: var(--text-md);
    font-weight: 750;
    letter-spacing: 0.01em;
    background:
      linear-gradient(180deg, color-mix(in srgb, white 10%, transparent), transparent 52%),
      color-mix(in srgb, var(--card) 86%, transparent);
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 14%, transparent),
      0 8px 18px color-mix(in srgb, black 18%, transparent);
    cursor: pointer;
    transform: translateY(0) scale(1);
    transition:
      border-color 140ms ease,
      color 140ms ease,
      background 140ms ease,
      box-shadow 140ms ease,
      transform 160ms ease;
  }

  .live-preview__preset-button:hover,
  .live-preview__preset-button:focus-visible {
    color: var(--text);
    border-color: color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 58%, var(--card-border));
    background:
      linear-gradient(180deg, color-mix(in srgb, white 14%, transparent), transparent 58%),
      color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 18%, var(--card));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 18%, transparent),
      0 10px 24px color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 22%, transparent);
    outline: none;
    transform: translateY(-1px) scale(1.02);
  }

  .live-preview__preset-button.is-active {
    color: white;
    border-color: color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 74%, white 18%);
    background:
      linear-gradient(180deg, color-mix(in srgb, white 24%, transparent), transparent 46%),
      linear-gradient(135deg, color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 58%, var(--card)), color-mix(in srgb, var(--preset-swatch-alt, var(--preset-swatch, var(--preview-glow, var(--focus)))) 34%, var(--section)));
    box-shadow:
      inset 0 1px 0 color-mix(in srgb, white 30%, transparent),
      inset 0 0 18px color-mix(in srgb, white 12%, transparent),
      0 0 20px color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 36%, transparent),
      0 12px 26px color-mix(in srgb, black 22%, transparent);
  }

  .live-preview__preset-swatch {
    width: 1rem;
    height: 1rem;
    flex: 0 0 auto;
    border-radius: var(--radius-pill);
    background:
      radial-gradient(circle at 35% 28%, white, color-mix(in srgb, white 28%, var(--preset-swatch, var(--preview-glow, var(--focus)))) 24%, transparent 58%),
      radial-gradient(circle at 50% 58%, var(--preset-swatch, var(--preview-glow, var(--focus))), color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 62%, black) 72%);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, white 28%, transparent),
      0 0 14px color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 56%, transparent);
    transform: scale(1);
    transition: box-shadow 160ms ease, transform 160ms ease, filter 160ms ease;
  }

  .live-preview__preset-button--theme {
    min-height: 36px;
    padding-block: var(--space-2);
  }

  .live-preview__preset-swatch--theme {
    width: 1.35rem;
    height: 1.05rem;
    border-radius: var(--radius-sm);
    background:
      radial-gradient(circle at 28% 20%, color-mix(in srgb, white 88%, transparent), transparent 24%),
      linear-gradient(135deg, var(--preset-swatch-alt, var(--preset-swatch)) 0 48%, var(--preset-swatch, var(--preview-glow, var(--focus))) 48% 100%);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, white 34%, transparent),
      inset 0 -8px 12px color-mix(in srgb, black 18%, transparent),
      0 0 16px color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 50%, transparent);
  }

  .live-preview__preset-button:hover .live-preview__preset-swatch,
  .live-preview__preset-button:focus-visible .live-preview__preset-swatch {
    filter: saturate(1.18) brightness(1.08);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, white 38%, transparent),
      0 0 18px color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 68%, transparent);
    transform: scale(1.08);
  }

  .live-preview__preset-button.is-active .live-preview__preset-swatch {
    box-shadow:
      0 0 0 2px color-mix(in srgb, white 70%, transparent),
      inset 0 0 0 1px color-mix(in srgb, white 46%, transparent),
      0 0 18px color-mix(in srgb, var(--preset-swatch, var(--preview-glow, var(--focus))) 78%, transparent);
    transform: scale(1.12);
  }

  .live-preview__card {
    isolation: isolate;
    overflow: hidden;
    transform: perspective(760px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg)) translate3d(0, 0, 0);
    transform-style: preserve-3d;
    will-change: transform;
    transition: transform 220ms ease;
  }

  .live-preview__card.is-interacting {
    transition-duration: 80ms;
  }

  .live-preview__card::before,
  .live-preview__card::after,
  .live-preview__foil,
  .live-preview__sparkle,
  .live-preview__texture,
  .live-preview__shine,
  .live-preview__glare {
    position: absolute;
    inset: 0;
    pointer-events: none;
    content: '';
  }

  .live-preview__card::before {
    z-index: 0;
    border-radius: inherit;
    background:
      radial-gradient(
        circle at var(--glare-x, 50%) var(--glare-y, 50%),
        color-mix(in srgb, white 46%, transparent),
        color-mix(in srgb, var(--preview-holo-b) 24%, transparent) 12%,
        transparent 34%
      ),
      linear-gradient(
        118deg,
        transparent 0% 24%,
        color-mix(in srgb, var(--preview-holo-a) 34%, transparent) 35%,
        color-mix(in srgb, var(--preview-holo-b) 42%, transparent) 44%,
        color-mix(in srgb, var(--preview-holo-c) 32%, transparent) 55%,
        transparent 70% 100%
      ),
      conic-gradient(
        from 140deg at 50% 48%,
        color-mix(in srgb, var(--preview-holo-b) 20%, transparent),
        transparent 18%,
        color-mix(in srgb, var(--preview-holo-c) 18%, transparent),
        transparent 38%,
        color-mix(in srgb, var(--preview-holo-a) 22%, transparent),
        transparent 64%,
        color-mix(in srgb, var(--preview-holo-b) 20%, transparent)
      );
    background-size: 120% 120%, 180% 180%, 120% 120%;
    opacity: 0.18;
    mix-blend-mode: color-dodge;
    filter: saturate(1.2) brightness(1.06);
    animation: live-preview-holo 5.6s ease-in-out infinite;
  }

  .live-preview__card.is-interacting::before {
    opacity: 0.2;
    animation: none;
  }

  .live-preview__card::after {
    z-index: 3;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, white 20%, transparent),
      inset 0 0 34px color-mix(in srgb, var(--preview-glow) 20%, transparent),
      inset 0 -18px 42px color-mix(in srgb, black 18%, transparent);
  }

  .live-preview__foil {
    z-index: 2;
    border-radius: inherit;
    background:
      repeating-linear-gradient(
        0deg,
        color-mix(in srgb, white 12%, transparent) 0 1px,
        transparent 1px 5px
      ),
      repeating-linear-gradient(
        90deg,
        color-mix(in srgb, black 10%, transparent) 0 1px,
        transparent 1px 9px
      );
    opacity: 0.08;
    mix-blend-mode: overlay;
  }

  .live-preview__sparkle {
    z-index: 6;
    border-radius: inherit;
    background:
      var(--preview-effect-sparkle),
      radial-gradient(circle at 18% 18%, color-mix(in srgb, white 44%, transparent), transparent 3% 18%),
      radial-gradient(circle at 82% 24%, color-mix(in srgb, var(--preview-holo-b) 42%, transparent), transparent 3% 16%),
      radial-gradient(circle at 34% 82%, color-mix(in srgb, var(--preview-holo-c) 34%, transparent), transparent 3% 14%),
      linear-gradient(110deg, transparent 0 36%, color-mix(in srgb, white 34%, transparent) 48%, transparent 62% 100%);
    background-size: 42% 42%, auto, auto, auto, auto;
    opacity: 0.34;
    mix-blend-mode: screen;
    transform: translateX(-78%);
    animation: live-preview-sheen 7.2s ease-in-out infinite;
  }

  .live-preview__texture {
    z-index: 5;
    border-radius: inherit;
    background-image:
      var(--preview-effect-grain),
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--preview-effect-accent) 18%, transparent),
        transparent 46%,
        color-mix(in srgb, var(--preview-effect-glow) 24%, transparent)
      );
    background-size: 160px 160px, 100% 100%;
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.16);
    mix-blend-mode: soft-light;
  }

  .live-preview__shine {
    z-index: 6;
    display: grid;
    border-radius: inherit;
    overflow: hidden;
    background-image:
      radial-gradient(
        farthest-corner circle at var(--glare-x, 50%) var(--glare-y, 50%),
        color-mix(in srgb, white 64%, transparent) 0%,
        color-mix(in srgb, var(--preview-effect-glow) 46%, transparent) 18%,
        transparent 52%
      ),
      var(--preview-effect-primary),
      repeating-linear-gradient(
        115deg,
        color-mix(in srgb, var(--preview-effect-accent) 58%, transparent) 0 4%,
        color-mix(in srgb, #42f5ff 42%, transparent) 4% 8%,
        color-mix(in srgb, #8f7cff 44%, transparent) 8% 12%
      );
    background-position:
      center,
      calc(20% + var(--glare-x, 50%) * 0.35) calc(20% + var(--glare-y, 50%) * 0.35),
      calc(50% + (var(--glare-x, 50%) - 50%) * 0.6) calc(50% + (var(--glare-y, 50%) - 50%) * 0.6);
    background-size: cover, 58% 58%, 240% 240%;
    background-blend-mode: screen, screen;
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.32);
    mix-blend-mode: var(--preview-effect-blend, color-dodge);
    filter: brightness(1.08) contrast(1.24) saturate(1.32);
  }

  .live-preview__shine::before,
  .live-preview__shine::after {
    grid-area: 1 / 1;
    border-radius: inherit;
    pointer-events: none;
    content: '';
  }

  .live-preview__shine::before {
    background-image:
      var(--preview-effect-secondary),
      linear-gradient(110deg, transparent 0 34%, color-mix(in srgb, white 44%, transparent) 48%, transparent 64% 100%);
    background-position:
      calc(12% + var(--glare-x, 50%) * 0.18) calc(12% + var(--glare-y, 50%) * 0.18),
      center;
    background-size: cover, 180% 180%;
    opacity: 0.46;
    mix-blend-mode: screen;
  }

  .live-preview__shine::after {
    background-image:
      var(--preview-effect-tertiary),
      repeating-linear-gradient(
        90deg,
        color-mix(in srgb, white 14%, transparent) 0 1px,
        transparent 1px 7px
      );
    background-position:
      calc(18% + var(--glare-x, 50%) * 0.12) calc(18% + var(--glare-y, 50%) * 0.12),
      center;
    background-size: cover, 100% 100%;
    opacity: 0.38;
    mix-blend-mode: overlay;
  }

  .live-preview__glare {
    z-index: 7;
    border-radius: inherit;
    background:
      radial-gradient(
        farthest-corner circle at var(--glare-x, 50%) var(--glare-y, 50%),
        color-mix(in srgb, white 74%, transparent) 0%,
        color-mix(in srgb, var(--preview-effect-glow) 24%, transparent) 22%,
        color-mix(in srgb, black 34%, transparent) 92%
      );
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.2);
    mix-blend-mode: overlay;
    filter: brightness(0.9) contrast(1.36);
  }

  .live-preview__card.is-interacting .live-preview__shine,
  .live-preview__card.is-interacting .live-preview__glare {
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.42);
  }

  .live-preview__card--effect-matrix .live-preview__shine {
    background-image:
      radial-gradient(
        farthest-corner circle at var(--glare-x, 50%) var(--glare-y, 50%),
        color-mix(in srgb, white 70%, transparent) 0%,
        color-mix(in srgb, var(--preview-effect-glow) 44%, transparent) 18%,
        transparent 48%
      ),
      linear-gradient(90deg, color-mix(in srgb, var(--preview-effect-accent) 28%, transparent) 1px, transparent 1px),
      linear-gradient(0deg, color-mix(in srgb, var(--preview-effect-glow) 24%, transparent) 1px, transparent 1px);
    background-size: cover, 18px 18px, 18px 18px;
    background-blend-mode: screen, overlay;
  }

  .live-preview__card--effect-cosmos .live-preview__shine {
    background-image:
      radial-gradient(
        farthest-corner circle at var(--glare-x, 50%) var(--glare-y, 50%),
        color-mix(in srgb, white 36%, transparent) 0%,
        color-mix(in srgb, var(--preview-effect-glow) 24%, transparent) 18%,
        transparent 52%
      ),
      var(--preview-effect-primary),
      var(--preview-effect-secondary),
      radial-gradient(
        ellipse at calc(68% - var(--glare-x, 50%) * 0.08) calc(24% + var(--glare-y, 50%) * 0.1),
        color-mix(in srgb, #8f7cff 16%, transparent),
        transparent 48%
      );
    background-position:
      center,
      calc(24% + var(--glare-x, 50%) * 0.16) calc(24% + var(--glare-y, 50%) * 0.16),
      calc(18% + var(--glare-x, 50%) * 0.1) calc(18% + var(--glare-y, 50%) * 0.1),
      center;
    background-size: cover, cover, cover, 150% 150%;
    background-blend-mode: screen, screen, screen;
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.34);
    mix-blend-mode: screen;
    filter: brightness(1.1) contrast(1.08) saturate(1.28) hue-rotate(8deg);
  }

  .live-preview__card--effect-cosmos .live-preview__shine::before,
  .live-preview__card--effect-cosmos .live-preview__shine::after {
    opacity: 0.28;
  }

  .live-preview__card--effect-cosmos .live-preview__texture,
  .live-preview__card--effect-aurora .live-preview__texture {
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.1);
    mix-blend-mode: screen;
  }

  .live-preview__card--effect-aurora .live-preview__shine {
    background-image:
      radial-gradient(
        farthest-corner circle at var(--glare-x, 50%) var(--glare-y, 50%),
        color-mix(in srgb, white 44%, transparent) 0%,
        color-mix(in srgb, var(--preview-effect-glow) 30%, transparent) 20%,
        transparent 54%
      ),
      radial-gradient(
        ellipse at calc(24% + var(--glare-x, 50%) * 0.18) calc(26% + var(--glare-y, 50%) * 0.12),
        color-mix(in srgb, #ff5fd7 20%, transparent),
        transparent 44%
      ),
      radial-gradient(
        ellipse at calc(74% - var(--glare-x, 50%) * 0.1) calc(70% - var(--glare-y, 50%) * 0.08),
        color-mix(in srgb, #42f5ff 18%, transparent),
        transparent 48%
      );
    background-position: center, center, center;
    background-size: cover, 140% 140%, 150% 150%;
    background-blend-mode: screen, screen;
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.32);
    filter: brightness(1.12) contrast(1.08) saturate(1.34) hue-rotate(-18deg);
  }

  .live-preview__card--effect-aurora .live-preview__shine::before,
  .live-preview__card--effect-aurora .live-preview__shine::after {
    opacity: 0.24;
  }

  .live-preview__card--effect-cosmos .live-preview__glare,
  .live-preview__card--effect-aurora .live-preview__glare {
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.18);
    mix-blend-mode: screen;
  }

  .live-preview__card--effect-cosmos.is-interacting .live-preview__shine,
  .live-preview__card--effect-aurora.is-interacting .live-preview__shine {
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.46);
  }

  .live-preview__card--effect-cosmos.is-interacting .live-preview__glare,
  .live-preview__card--effect-aurora.is-interacting .live-preview__glare {
    opacity: calc(var(--preview-effect-intensity, 0.7) * 0.26);
  }

  .live-preview__image-frame::before,
  .live-preview__image-frame::after,
  .live-preview__avatar--empty::before,
  .live-preview__avatar--empty::after {
    position: absolute;
    pointer-events: none;
    content: '';
  }

  .live-preview__image-frame::before,
  .live-preview__image-frame::after {
    inset: var(--space-1);
    border-radius: 17px 19px 16px 18px / 18px 16px 19px 17px;
  }

  .live-preview__image-frame::before {
    z-index: 1;
    background:
      radial-gradient(circle at 25% 20%, color-mix(in srgb, white 22%, transparent), transparent 35%),
      linear-gradient(135deg, color-mix(in srgb, var(--preview-holo-a) 18%, transparent), transparent 48%);
    opacity: 0.72;
    mix-blend-mode: overlay;
  }

  .live-preview__image-frame::after {
    z-index: 3;
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, white 14%, transparent),
      inset 0 -36px 54px color-mix(in srgb, black 32%, transparent);
  }

  .live-preview__avatar--empty::before,
  .live-preview__avatar--empty::after {
    border: 1px solid color-mix(in srgb, var(--preview-glow) 50%, transparent);
    border-radius: var(--radius-pill);
    opacity: 0.34;
  }

  .live-preview__avatar--empty::before {
    width: 54%;
    aspect-ratio: 1;
  }

  .live-preview__avatar--empty::after {
    width: 74%;
    aspect-ratio: 1;
    border-style: dashed;
  }

  @keyframes live-preview-holo {
    0%,
    100% {
      background-position: 0% 42%, 50% 50%;
      opacity: 0.14;
    }

    46% {
      background-position: 100% 58%, 58% 42%;
      opacity: 0.24;
    }

    72% {
      background-position: 64% 12%, 42% 64%;
      opacity: 0.18;
    }
  }

  @keyframes live-preview-sheen {
    0%,
    30%,
    100% {
      opacity: 0;
      transform: translateX(-82%);
    }

    48% {
      opacity: 0.26;
    }

    66% {
      opacity: 0;
      transform: translateX(82%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .live-preview__card,
    .live-preview__card.is-interacting {
      transform: translateZ(0);
      transition: none;
    }

    .live-preview__card::before,
    .live-preview__card.is-interacting::before,
    .live-preview__sparkle,
    .live-preview__texture,
    .live-preview__shine,
    .live-preview__glare {
      animation: none;
    }
  }
</style>
