import { getHostDocument, removeLeftovers, type SafeHostElement } from '../helpers/host-dom';
import type { MergeMode } from '../hmr/merge';
import type { PreviewSnapshot } from '../hmr/preview';
import { ACTION_SELECTOR, actionOf, hitAction, inside, pointOf, type ActionHit } from './actions';
import { PREVIEW_CSS, ROOT_ATTR } from './style';
import { canApply, PARTS, renderPart, type PreviewPart, type PreviewView } from './view';

export interface PreviewModalDeps {
  readonly prepare: (mode: MergeMode) => Promise<PreviewSnapshot>;
  readonly apply: (snapshot: PreviewSnapshot) => Promise<
    { readonly status: 'applied' } | { readonly status: 'stale'; readonly snapshot: PreviewSnapshot } | { readonly status: 'busy' }
  >;
  readonly onVisibilityChange: (visible: boolean) => void;
  readonly returnFocus?: () => Promise<void>;
  readonly onError?: (message: string) => void;
}

export interface PreviewModal {
  show(mode?: MergeMode): Promise<void>;
  hide(): Promise<void>;
  update(state: { readonly observedVersion?: number; readonly applying?: boolean }): Promise<void>;
  destroy(): Promise<void>;
}

export class PreviewHostError extends Error {
  constructor() {
    super('미리보기 모달을 열 수 없습니다. RisuAI 루트 문서 접근 권한을 확인하세요.');
    this.name = 'PreviewHostError';
  }
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error);

export async function createPreviewModal(deps: PreviewModalDeps): Promise<PreviewModal> {
  const document = await getHostDocument();
  const hostBody = await document?.querySelector('body');
  if (!document || !hostBody) throw new PreviewHostError();
  await removeLeftovers(document, `[${ROOT_ATTR}]`);
  const root = await document.createElement('div');
  const listeners: { readonly type: string; readonly id: string }[] = [];
  const parts = new Map<PreviewPart, SafeHostElement>();
  let dialog: SafeHostElement;
  let body: SafeHostElement;
  try {
    await root.setAttribute(ROOT_ATTR, 'true');
    await root.setStyle('display', 'none');
    await root.setInnerHTML('<div data-hmr-dialog role="dialog" aria-modal="true" aria-label="Workbench HMR 변경 미리보기" tabindex="-1"><div data-hmr-part="header"></div><div data-hmr-part="body"></div><div data-hmr-part="footer"></div></div>');
    const foundDialog = await root.querySelector('[data-hmr-dialog]');
    if (!foundDialog) throw new PreviewHostError();
    dialog = foundDialog;
    for (const part of PARTS) {
      const element = await root.querySelector(`[data-hmr-part="${part}"]`);
      if (!element) throw new PreviewHostError();
      parts.set(part, element);
    }
    const foundBody = parts.get('body');
    if (!foundBody) throw new PreviewHostError();
    body = foundBody;
    const style = await document.createElement('style');
    await style.setTextContent(PREVIEW_CSS);
    await root.appendChild(style);
    await hostBody.appendChild(root);
  } catch (error) {
    await root.remove();
    throw error;
  }

  let visible = false;
  let destroyed = false;
  let generation = 0;
  let revision = 0;
  let observedVersion = 0;
  let externalApplying = false;
  let snapshot: PreviewSnapshot | null = null;
  let opening: Promise<void> = Promise.resolve();
  let renderTail: Promise<void> = Promise.resolve();
  const drawn = new Map<PreviewPart, string>();
  let view: PreviewView = {
    phase: 'loading', mode: 'merge-by-name', target: '연결된 대상', version: null,
    diff: null, error: '', agreed: false, expanded: new Set(),
  };
  const current = (id: number): boolean => visible && !destroyed && generation === id;
  const busy = (): boolean => view.phase === 'applying' || externalApplying;

  function draw(): Promise<void> {
    revision += 1;
    const run = async (): Promise<void> => {
      if (destroyed) return;
      if (visible) {
        const active = await dialog.querySelector(`${ACTION_SELECTOR}:focus`);
        const focused = active ? actionOf(await active.getOuterHTML()) : null;
        for (const part of PARTS) {
          if (destroyed || !visible) break;
          const html = renderPart(part, view);
          if (drawn.get(part) === html) continue;
          await parts.get(part)?.setInnerHTML(html);
          drawn.set(part, html);
        }
        if (focused && visible && !destroyed) {
          const selector = `[data-hmr-action="${focused.action}"]${focused.index === null ? '' : `[data-hmr-index="${focused.index}"]`}:not(:disabled)`;
          const target = await dialog.querySelector(selector);
          if (visible && !destroyed) await (target ?? dialog).focus();
        }
      }
      if (!destroyed) await root.setStyle('display', visible ? 'grid' : 'none');
    };
    renderTail = renderTail.then(run, run);
    return renderTail;
  }

  async function focusFirst(id: number): Promise<void> {
    const first = await dialog.querySelector(ACTION_SELECTOR);
    if (current(id)) await (first ?? dialog).focus();
  }

  function accept(next: PreviewSnapshot): void {
    snapshot = next;
    const name = next.after['name'] ?? next.existing['name'];
    view = {
      ...view, phase: observedVersion > next.source.version ? 'stale' : 'ready',
      mode: next.mode, target: typeof name === 'string' ? name : next.target.id,
      version: next.source.version, diff: next.diff, error: '', agreed: false, expanded: new Set(),
    };
  }

  async function prepare(mode: MergeMode): Promise<void> {
    const id = ++generation;
    snapshot = null;
    view = { ...view, phase: 'loading', mode, diff: null, error: '', agreed: false, expanded: new Set() };
    await draw();
    if (!current(id)) return;
    try {
      const next = await deps.prepare(mode);
      if (!current(id)) return;
      accept(next);
    } catch (error) {
      if (!current(id)) return;
      view = { ...view, phase: 'error', error: messageOf(error), agreed: false };
    }
    await draw();
  }

  async function hide(): Promise<void> {
    if (!visible || destroyed || busy()) return;
    visible = false;
    generation += 1;
    snapshot = null;
    deps.onVisibilityChange(false);
    await draw();
    if (!visible && !destroyed) await deps.returnFocus?.();
  }

  async function perform(hit: ActionHit): Promise<void> {
    if (!visible || destroyed || busy()) return;
    switch (hit.action) {
      case 'cancel': case 'close': await hide(); return;
      case 'merge-by-name': case 'replace':
        if (hit.action !== view.mode) await prepare(hit.action);
        return;
      case 'retry':
        if (view.phase === 'error' || view.phase === 'stale') await prepare(view.mode);
        return;
      case 'details': {
        if (!view.diff || hit.index === null || !view.diff.fields[hit.index]) return;
        const expanded = new Set(view.expanded);
        if (expanded.has(hit.index)) expanded.delete(hit.index);
        else expanded.add(hit.index);
        view = { ...view, expanded };
        await draw();
        return;
      }
      case 'agree':
        if (view.phase !== 'ready' || (view.diff?.conflicts?.length ?? 0) > 0) return;
        view = { ...view, agreed: !view.agreed };
        await draw();
        return;
      case 'apply': {
        if (!snapshot || !canApply(view)) return;
        const confirmed = snapshot;
        const id = generation;
        view = { ...view, phase: 'applying', agreed: false };
        await draw();
        if (!current(id)) return;
        try {
          const result = await deps.apply(confirmed);
          if (!current(id)) return;
          switch (result.status) {
            case 'applied':
              view = { ...view, phase: 'ready' };
              externalApplying = false;
              await hide();
              return;
            case 'stale':
              accept(result.snapshot);
              view = { ...view, phase: 'stale' };
              break;
            case 'busy':
              view = { ...view, phase: 'error', error: '다른 적용이 진행 중입니다. 완료 후 다시 확인하세요.' };
              break;
          }
        } catch (error) {
          if (!current(id)) return;
          view = { ...view, phase: 'error', error: messageOf(error) };
        }
        await draw();
        return;
      }
    }
  }

  async function click(event: unknown): Promise<void> {
    if (!visible || destroyed || busy() || typeof event !== 'object' || event === null) return;
    if (Reflect.get(event, 'button') !== 0) return;
    if (Reflect.get(event, 'detail') === 0) return;
    const point = pointOf(event);
    if (!point || (point.x === 0 && point.y === 0)) return;
    const id = generation;
    const before = revision;
    if (!inside(point, await root.getBoundingClientRect())) return;
    const hit = inside(point, await dialog.getBoundingClientRect())
      ? await hitAction(point, dialog, body) : { action: 'close', index: null } satisfies ActionHit;
    if (hit && current(id) && before === revision) await perform(hit);
  }

  async function keydown(event: unknown): Promise<void> {
    if (!visible || destroyed || typeof event !== 'object' || event === null) return;
    const key: unknown = Reflect.get(event, 'key');
    if (key === 'Escape') { await hide(); return; }
    const id = generation;
    const before = revision;
    if (key === 'Tab') {
      // The bridge delays keydown until native Tab has already moved focus.
      if (await dialog.querySelector(`${ACTION_SELECTOR}:focus`)) return;
      const buttons = await dialog.querySelectorAll(ACTION_SELECTOR);
      const count = await buttons.length();
      const backwards = Reflect.get(event, 'shiftKey') === true;
      const next = backwards ? count - 1 : 0;
      const target = count > 0 ? await buttons.at(next) : dialog;
      if (current(id) && before === revision) await target?.focus();
    } else if (key === 'Enter' || key === ' ') {
      const active = await dialog.querySelector(`${ACTION_SELECTOR}:focus`);
      const hit = active ? actionOf(await active.getOuterHTML()) : null;
      if (hit && current(id) && before === revision) await perform(hit);
    }
  }

  function report(error: unknown): void {
    const message = messageOf(error);
    if (deps.onError) deps.onError(message);
    else console.warn('[hmr] preview modal failed:', message);
  }

  try {
    listeners.push({ type: 'click', id: await root.addEventListener('click', (event: unknown) => { void click(event).catch(report); }) });
    listeners.push({ type: 'keydown', id: await root.addEventListener('keydown', (event: unknown) => { void keydown(event).catch(report); }) });
  } catch (error) {
    for (const listener of listeners) await root.removeEventListener(listener.type, listener.id);
    await root.remove();
    throw error;
  }

  return {
    show(mode = 'merge-by-name') {
      if (destroyed) return Promise.resolve();
      if (visible) return opening;
      visible = true;
      deps.onVisibilityChange(true);
      view = { ...view, phase: 'loading', mode, diff: null, error: '', agreed: false };
      opening = (async () => {
        const id = generation;
        await draw();
        await focusFirst(id);
        if (current(id)) await prepare(mode);
      })();
      return opening;
    },
    hide,
    async update(state) {
      if (destroyed) return;
      if (state.applying !== undefined) externalApplying = state.applying;
      if (state.observedVersion !== undefined) observedVersion = state.observedVersion;
      if (visible && snapshot && view.phase === 'ready' && observedVersion > snapshot.source.version) {
        view = { ...view, phase: 'stale', agreed: false };
        await draw();
      }
    },
    async destroy() {
      if (destroyed) return;
      destroyed = true;
      generation += 1;
      if (visible) deps.onVisibilityChange(false);
      visible = false;
      snapshot = null;
      try {
        await renderTail;
      } finally {
        try {
          for (const listener of listeners) await root.removeEventListener(listener.type, listener.id);
        } finally {
          await root.remove();
        }
      }
    },
  };
}
