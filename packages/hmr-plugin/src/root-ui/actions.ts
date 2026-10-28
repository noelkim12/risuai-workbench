import type { SafeHostElement } from '../helpers/host-dom';

export const ACTION_SELECTOR = 'button[data-hmr-action]:not(:disabled)';
export type PreviewAction = 'close' | 'cancel' | 'merge-by-name' | 'replace' | 'retry' | 'apply' | 'agree' | 'details';
export interface ActionHit { readonly action: PreviewAction; readonly index: number | null }
export interface Point { readonly x: number; readonly y: number }

export function pointOf(event: unknown): Point | null {
  if (typeof event !== 'object' || event === null) return null;
  const x: unknown = Reflect.get(event, 'clientX');
  const y: unknown = Reflect.get(event, 'clientY');
  return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y) ? { x, y } : null;
}

export const inside = (point: Point, rect: DOMRect): boolean => rect.width > 0 && rect.height > 0
  && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;

export function actionOf(html: string): ActionHit | null {
  const tag = html.match(/^<button\b[^>]*>/i)?.[0];
  if (!tag || /\sdisabled(?:[\s=>])/.test(tag)) return null;
  const action = tag.match(/\sdata-hmr-action="([^"]+)"/)?.[1];
  switch (action) {
    case 'close': case 'cancel': case 'merge-by-name': case 'replace': case 'retry': case 'apply': case 'agree':
      return { action, index: null };
    case 'details': {
      const value = tag.match(/\sdata-hmr-index="(\d+)"/)?.[1];
      return value === undefined ? null : { action, index: Number(value) };
    }
    default: return null;
  }
}

export async function hitAction(point: Point, dialog: SafeHostElement, body: SafeHostElement): Promise<ActionHit | null> {
  if (!inside(point, await dialog.getBoundingClientRect())) return null;
  const buttons = await dialog.querySelectorAll(ACTION_SELECTOR);
  for (let index = 0, count = await buttons.length(); index < count; index += 1) {
    const button = await buttons.at(index);
    if (!button || !inside(point, await button.getBoundingClientRect())) continue;
    const html = await button.getOuterHTML();
    if (/\sdata-hmr-in-body(?:[\s=>])/.test(html) && !inside(point, await body.getBoundingClientRect())) continue;
    const action = actionOf(html);
    if (action) return action;
  }
  return null;
}
