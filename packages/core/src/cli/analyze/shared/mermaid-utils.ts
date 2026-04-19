import { escapeHtml } from '@/cli/shared/report-utils';

/** Lua Mermaid node kind label helper 입력값 */
export type LuaMermaidNodeKind = 'handler' | 'function' | 'state' | 'bridge';

function toIdFragment(value: string): string {
  const fragment = value
    .normalize('NFKC')
    .replace(/[^0-9A-Za-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return fragment || 'node';
}

function hashStableText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function serializeStableSeed(seed: unknown): string {
  return JSON.stringify(seed) ?? 'null';
}

/** toMermaidStableId가 raw label 충돌을 피하는 Mermaid node id를 만든다. */
export function toMermaidStableId(parts: string[], seed: unknown = parts): string {
  const prefix = parts.map(toIdFragment).join('_');
  return `${prefix}_${hashStableText(serializeStableSeed(seed))}`;
}

/** escapeMermaidLabel이 Mermaid HTML label 위험 문자를 제한적으로 이스케이프한다. */
export function escapeMermaidLabel(value: string): string {
  return escapeHtml(value)
    .replace(/\[/g, '&#91;')
    .replace(/\]/g, '&#93;')
    .replace(/\(/g, '&#40;')
    .replace(/\)/g, '&#41;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

/** buildLuaHtmlLabel이 Lua interaction Mermaid용 HTML label을 생성한다. */
export function buildLuaHtmlLabel(kind: LuaMermaidNodeKind, title: string, subtitle?: string): string {
  const kindShort = kind === 'handler' ? 'HND' : kind === 'function' ? 'FN' : kind === 'state' ? 'VAR' : 'BRG';
  const secondary = subtitle
    ? `<span class="lua-flow-node-subtitle">${escapeMermaidLabel(subtitle)}</span>`
    : '';
  return `<div class="lua-flow-node lua-flow-node--${kind}"><span class="lua-flow-node-badge">${kindShort}</span><span class="lua-flow-node-title">${escapeMermaidLabel(title)}</span>${secondary}</div>`;
}
