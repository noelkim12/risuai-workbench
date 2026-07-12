<script lang="ts">
  import type { ArtifactBrowserCreateArtifactKind, ArtifactBrowserCreateArtifactPayload } from '../types';
  import charxCardImage from '../assets/create-artifact-wizard/charx.webp?inline';
  import moduleCardImage from '../assets/create-artifact-wizard/module.webp?inline';
  import pluginCardImage from '../assets/create-artifact-wizard/plugin.webp?inline';
  import { fly } from 'svelte/transition';

  // Webview is always client-side; matchMedia is safe here.
  const prefersReducedMotion =
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motionDuration = prefersReducedMotion ? 0 : 160;

  export let open = false;
  export let initialKind: ArtifactBrowserCreateArtifactKind = 'charx';
  export let onCreate: (payload: ArtifactBrowserCreateArtifactPayload) => void;
  export let onClose: () => void;

  const PLUGIN_NAME_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

  const KIND_CARDS: { kind: ArtifactBrowserCreateArtifactKind; imageUrl: string; title: string; blurb: string }[] = [
    { kind: 'charx', imageUrl: charxCardImage, title: 'CharX', blurb: 'Risuai Character card' },
    { kind: 'module', imageUrl: moduleCardImage, title: 'Module', blurb: 'Risuai Module' },
    { kind: 'plugin', imageUrl: pluginCardImage, title: 'Plugin', blurb: 'Risual Plugin' },
  ];

  let step: 1 | 2 = 1;
  let createKind: ArtifactBrowserCreateArtifactKind = 'charx';
  let name = '';
  let creator = '';
  let tags = '';
  let utilityBot = false;
  let lowLevelAccess = false;
  let description = '';
  let pluginFramework: 'vanilla' | 'svelte' = 'vanilla';
  let nameInput: HTMLInputElement | undefined;

  $: pluginNameInvalid =
    createKind === 'plugin' && name.trim().length > 0 && !PLUGIN_NAME_PATTERN.test(name.trim());
  $: canCreate = name.trim().length > 0 && !pluginNameInvalid;

  // Reset form + step exactly once each time the modal opens.
  let wasOpen = false;
  $: if (open && !wasOpen) resetForOpen();
  $: if (!open) wasOpen = false;

  function resetForOpen(): void {
    wasOpen = true;
    createKind = initialKind;
    step = 1;
    name = '';
    creator = '';
    tags = '';
    utilityBot = false;
    lowLevelAccess = false;
    description = '';
    pluginFramework = 'vanilla';
  }

  function selectKind(kind: ArtifactBrowserCreateArtifactKind): void {
    createKind = kind;
    step = 2;
    // Focus the name field after the step-2 markup renders.
    queueMicrotask(() => nameInput?.focus());
  }

  function back(): void {
    step = 1;
  }

  function submitCreate(): void {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (createKind === 'plugin' && !PLUGIN_NAME_PATTERN.test(trimmedName)) return;

    if (createKind === 'charx') {
      onCreate({
        kind: 'charx',
        name: trimmedName,
        creator: creator.trim(),
        tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        utilityBot,
        lowLevelAccess,
      });
    } else if (createKind === 'plugin') {
      onCreate({
        kind: 'plugin',
        name: trimmedName,
        description: description.trim(),
        framework: pluginFramework,
      });
    } else {
      onCreate({
        kind: 'module',
        name: trimmedName,
        description: description.trim(),
        lowLevelAccess,
      });
    }

    onClose();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (open && event.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if open}
  <section class="modal-backdrop" aria-label="Create dialog backdrop">
    <div class="modal-scrim" aria-hidden="true"></div>
    <div class="create-modal" aria-label="Create workbench artifact" role="dialog" aria-modal="true">
      <header class="create-modal__header">
        <div>
          <p class="eyebrow">Create root marker</p>
          <h2>New Workbench Item</h2>
        </div>
        <button type="button" class="button-icon button-icon--quiet" aria-label="Close create dialog" on:click={onClose}>×</button>
      </header>

      <ol class="wizard-steps" aria-label="Wizard progress">
        <li class:active={step === 1} class:done={step === 2}>1. Type</li>
        <li class:active={step === 2}>2. Details</li>
      </ol>

      {#if step === 1}
        <div
          class="wizard-cards"
          role="group"
          aria-label="Artifact type"
          in:fly={{ x: -12, duration: motionDuration }}
        >
          {#each KIND_CARDS as card (card.kind)}
            <button
              type="button"
              class="wizard-card"
              // class:active={createKind === card.kind}
              on:click={() => selectKind(card.kind)}
            >
              <span class="wizard-card__header">
                <span class="wizard-card__title">{card.title}</span>
              </span>
              <img class="wizard-card__image" src={card.imageUrl} alt="" decoding="async" />
              <span class="wizard-card__body">
                <span class="wizard-card__blurb">{card.blurb}</span>
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <form
          class="create-modal__form"
          on:submit|preventDefault={submitCreate}
          in:fly={{ x: 12, duration: motionDuration }}
        >
          <label class="field-stack">
            <span>Name</span>
            <input
              bind:this={nameInput}
              type="text"
              bind:value={name}
              required
              autocomplete="off"
              placeholder={createKind === 'charx' ? 'Character name' : createKind === 'plugin' ? 'my-risu-plugin' : 'Module name'}
            />
          </label>

          {#if createKind === 'charx'}
            <label class="field-stack">
              <span>Creator</span>
              <input type="text" bind:value={creator} autocomplete="off" placeholder="Creator" />
            </label>
            <label class="field-stack">
              <span>Tags</span>
              <input type="text" bind:value={tags} autocomplete="off" placeholder="tag-a, tag-b" />
            </label>
            <div class="toggle-grid">
              <label class="toggle-row">
                <span class="toggle-row__label">Utility bot</span>
                <input type="checkbox" role="switch" class="toggle-row__input" bind:checked={utilityBot} />
                <span class="toggle-row__switch" aria-hidden="true"><span class="toggle-row__thumb"></span></span>
              </label>
              <label class="toggle-row">
                <span class="toggle-row__label">Low level access</span>
                <input type="checkbox" role="switch" class="toggle-row__input" bind:checked={lowLevelAccess} />
                <span class="toggle-row__switch" aria-hidden="true"><span class="toggle-row__thumb"></span></span>
              </label>
            </div>
          {:else if createKind === 'module'}
            <label class="field-stack">
              <span>Description</span>
              <textarea bind:value={description} rows="3" placeholder="Short module description"></textarea>
            </label>
            <label class="toggle-row">
              <span class="toggle-row__label">Low level access</span>
              <input type="checkbox" role="switch" class="toggle-row__input" bind:checked={lowLevelAccess} />
              <span class="toggle-row__switch" aria-hidden="true"><span class="toggle-row__thumb"></span></span>
            </label>
          {:else if createKind === 'plugin'}
            <label class="field-stack">
              <span>Description</span>
              <textarea bind:value={description} rows="3" placeholder="Short plugin description"></textarea>
            </label>
            <fieldset class="create-type-switch" aria-label="Plugin framework">
              <label class:active={pluginFramework === 'vanilla'}>
                <input type="radio" bind:group={pluginFramework} value="vanilla" />
                Vanilla
              </label>
              <label class:active={pluginFramework === 'svelte'}>
                <input type="radio" bind:group={pluginFramework} value="svelte" />
                Svelte
              </label>
            </fieldset>
            {#if pluginNameInvalid}
              <p class="field-hint field-hint--error">Plugin name must be kebab-case (e.g. my-risu-plugin).</p>
            {/if}
          {/if}

          <footer class="create-modal__actions">
            <button type="button" class="button-secondary" on:click={back}>← Back</button>
            <button type="submit" disabled={!canCreate}>Create</button>
          </footer>
        </form>
      {/if}
    </div>
  </section>
{/if}

<style>
  .wizard-steps {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--muted);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .wizard-steps li {
    flex: 1;
    padding-bottom: var(--space-1);
    border-bottom: 2px solid var(--card-border);
  }

  .wizard-steps li.active {
    color: var(--text);
    border-bottom-color: var(--accent);
  }

  .wizard-steps li.done {
    color: var(--text);
    border-bottom-color: color-mix(in srgb, var(--accent) 60%, transparent);
  }

  .wizard-cards {
    display: grid;
    /* Cap card width so the 5/7 images never push the modal past 70vh:
       the vh term shrinks cards on short windows instead of scrolling. */
    grid-template-columns: repeat(3, minmax(0, min(280px, 50vh - 230px)));
    gap: var(--space-5);
    justify-content: center;
  }

  .wizard-card {
    --wizard-card-frame: color-mix(in srgb, var(--text) 28%, var(--card-border));
    --wizard-card-frame-strong: color-mix(in srgb, var(--text) 44%, var(--card-border));
    --wizard-card-frame-soft: color-mix(in srgb, var(--text) 10%, var(--card));

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    min-width: 0;
    padding: 7px;
    overflow: hidden;
    border: 5px solid var(--wizard-card-frame);
    border-radius: 8px;
    color: var(--text);
    background: var(--card);
    box-shadow:
      inset 0 0 0 2px var(--wizard-card-frame-soft),
      0 0 0 1px var(--wizard-card-frame-strong),
      var(--card-shadow);
    text-align: center;
    cursor: pointer;
    transition:
      border-color 140ms ease,
      background 140ms ease,
      box-shadow 140ms ease,
      transform 140ms ease;
  }

  .wizard-card::before {
    position: absolute;
    z-index: 1;
    inset: 3px;
    border: 1px solid var(--wizard-card-frame-soft);
    border-radius: 2px;
    content: '';
    pointer-events: none;
  }

  .wizard-card:hover {
    border-color: color-mix(in srgb, var(--focus) 64%, var(--wizard-card-frame));
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--focus) 14%, var(--wizard-card-frame-soft)),
      0 0 0 2px color-mix(in srgb, var(--focus) 28%, transparent),
      var(--card-selected-shadow);
    transform: translateY(-2px);
  }

  .wizard-card.active {
    border-color: color-mix(in srgb, var(--focus) 76%, var(--wizard-card-frame));
    background: color-mix(in srgb, var(--focus) 8%, var(--card));
    box-shadow:
      inset 0 0 0 2px color-mix(in srgb, var(--focus) 18%, var(--wizard-card-frame-soft)),
      0 0 0 3px color-mix(in srgb, var(--focus) 34%, transparent),
      var(--card-selected-shadow);
  }

  .wizard-card:focus-visible {
    outline: 1px solid var(--focus);
    outline-offset: 2px;
  }

  .wizard-card__header {
    position: relative;
    display: flex;
    min-height: 46px;
    align-items: center;
    padding: var(--space-2) 36px var(--space-2) var(--space-3);
    border: 1px solid var(--wizard-card-frame-strong);
    border-radius: 3px 3px 0 0;
    background: var(--wizard-card-frame-soft);
    text-align: left;
  }

  .wizard-card__header::after {
    position: absolute;
    top: 50%;
    right: 14px;
    width: 12px;
    height: 12px;
    border: 2px solid var(--wizard-card-frame-strong);
    background: var(--card);
    content: '';
    transform: translateY(-50%) rotate(45deg);
  }

  .wizard-card__image {
    display: block;
    width: 100%;
    aspect-ratio: 5 / 7;
    margin: 6px 0;
    border: 3px solid var(--wizard-card-frame-strong);
    border-radius: 2px;
    box-shadow:
      0 0 0 1px var(--wizard-card-frame-soft),
      inset 0 0 0 1px var(--card-border);
    object-fit: cover;
  }

  .wizard-card__body {
    display: flex;
    min-height: 72px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--wizard-card-frame-strong);
    border-top: 3px double var(--wizard-card-frame-strong);
    border-radius: 0 0 3px 3px;
    background: var(--wizard-card-frame-soft);
  }

  .wizard-card__title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
  }

  .wizard-card__blurb {
    color: var(--muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .field-hint--error {
    margin: 0;
    font-size: 12px;
    color: var(--vscode-errorForeground, #f14c4c);
  }

  /* --- Wizard-scoped modal presentation ---------------------------------
     The shared .modal-backdrop / .create-modal top-align the dialog. Center
     it here so the wizard reads as a true modal within the webview panel.
     Svelte scoping raises specificity by one class, so these win over the
     shared rules without touching the other modals that reuse them. */
  .modal-backdrop {
    align-items: center;
    justify-items: center;
    padding: var(--space-4);
    background: color-mix(in srgb, var(--surface) 55%, transparent);
    backdrop-filter: blur(3px);
  }

  .create-modal {
    gap: var(--space-4);
    /* Cap at the natural width of three 280px cards (+ gaps/padding) so
       wide screens don't leave dead space beside the card row. */
    width: min(70vw, 960px);
    max-height: 70vh;
    margin: 0;
    padding: var(--space-5);
    overflow: hidden;
    animation: wizard-pop 180ms ease;
  }

  .create-modal__header h2 {
    font-size: 20px;
  }

  .create-modal__form {
    width: 100%;
    gap: var(--space-4);
  }

  /* --- Modern form fields -----------------------------------------------
     Softly filled inputs with a glow focus ring, card-style checkbox rows,
     and a divided action footer. Scoped so the shared modal forms keep
     their plainer look. */
  .field-stack {
    gap: 6px;
    font-size: 11px;
  }

  .field-stack input,
  .field-stack textarea {
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--text) 4%, var(--surface));
    transition:
      border-color 140ms ease,
      background 140ms ease,
      box-shadow 140ms ease;
  }

  .field-stack input:hover,
  .field-stack textarea:hover {
    border-color: color-mix(in srgb, var(--text) 32%, transparent);
  }

  .field-stack input:focus,
  .field-stack textarea:focus {
    border-color: var(--focus);
    outline: none;
    background: var(--surface);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--focus) 22%, transparent);
  }

  .field-stack input::placeholder,
  .field-stack textarea::placeholder {
    color: color-mix(in srgb, var(--muted) 70%, transparent);
  }

  .field-stack textarea {
    min-height: 84px;
    resize: vertical;
  }

  .toggle-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--text) 16%, transparent);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--text) 4%, var(--surface));
    cursor: pointer;
    user-select: none;
    transition:
      border-color 140ms ease,
      background 140ms ease;
  }

  .toggle-row:hover {
    border-color: color-mix(in srgb, var(--text) 32%, transparent);
  }

  .toggle-row:has(input:checked) {
    border-color: color-mix(in srgb, var(--focus) 70%, transparent);
    background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  }

  .toggle-row__label {
    font-weight: 500;
  }

  /* Visually hidden but still focusable for keyboard users. */
  .toggle-row__input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    border: 0;
    white-space: nowrap;
  }

  .toggle-row__switch {
    position: relative;
    display: inline-flex;
    flex: none;
    width: 40px;
    height: 22px;
    align-items: center;
    border: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--text) 14%, var(--surface));
    transition:
      border-color 140ms ease,
      background 140ms ease;
  }

  .toggle-row__thumb {
    position: absolute;
    left: 3px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px color-mix(in srgb, var(--vscode-widget-shadow) 60%, rgb(0 0 0 / 25%));
    transition: transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }

  .toggle-row__input:checked + .toggle-row__switch {
    border-color: transparent;
    background: var(--accent);
  }

  .toggle-row__input:checked + .toggle-row__switch .toggle-row__thumb {
    transform: translateX(18px);
  }

  .toggle-row__input:focus-visible + .toggle-row__switch {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }

  .create-modal__actions {
    margin-top: var(--space-2);
    padding-top: var(--space-4);
    border-top: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  }

  .create-modal__actions button {
    padding: var(--space-2) var(--space-5);
    border-radius: var(--radius-md);
  }

  @keyframes wizard-pop {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* --- Segmented-pill framework toggle ----------------------------------
     Replace the raw native radios with an iOS-style segmented control:
     the container is the track, each label is a pill, the checked one fills
     with the accent. The native input is visually hidden but stays
     focusable for keyboard users. */
  .create-type-switch {
    gap: var(--space-1);
    padding: var(--space-1);
    border: 1px solid var(--card-border);
    border-radius: var(--radius-pill);
    background: var(--section);
  }

  .create-type-switch label {
    justify-content: center;
    gap: 0;
    padding: var(--space-2) var(--space-3);
    border: 0;
    border-radius: var(--radius-pill);
    color: var(--muted);
    font-weight: 600;
    background: transparent;
    cursor: pointer;
    transition:
      color 140ms ease,
      background 140ms ease,
      box-shadow 140ms ease;
  }

  .create-type-switch label:hover {
    color: var(--text);
  }

  .create-type-switch label.active {
    color: var(--accent-text);
    background: var(--accent);
    box-shadow: 0 1px 4px color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .create-type-switch label:focus-within {
    outline: 1px solid var(--focus);
    outline-offset: 1px;
  }

  .create-type-switch input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
  }

  @media (max-width: 640px) {
    .modal-backdrop {
      padding: var(--space-3);
    }

    .create-modal {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
      padding: var(--space-4);
      /* Stacked cards can't fit one screen; allow scrolling again here. */
      overflow-y: auto;
    }

    .wizard-cards {
      grid-template-columns: 1fr;
      gap: var(--space-3);
      justify-items: center;
    }

    .wizard-card {
      width: min(100%, 320px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .create-modal {
      animation: none;
    }

    .create-type-switch label {
      transition: none;
    }
  }
</style>
