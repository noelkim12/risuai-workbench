/**
 * name 프리뷰 렌더 (core naming.ts의 경량 미러 — 스키마 편집 라이브 프리뷰 전용).
 * @file packages/webview/src/lib/asset-manager/naming.ts
 */

import type { AssetCatalogSchemaMirror, AssetSlotId, AssetSlotValues } from '../types/assetManager';

const SLOT_PLACEHOLDER = /\{(s[123])\}/g;

export function renderNamePreview(schema: AssetCatalogSchemaMirror, slots: AssetSlotValues): string | null {
  for (const slot of schema.slots) {
    const value = slots[slot.id];
    if (!value || !value.trim()) return null;
  }

  return schema.joinTemplate.replace(SLOT_PLACEHOLDER, (_match, slotId: AssetSlotId) => slots[slotId] ?? '');
}

export function labelTemplate(schema: AssetCatalogSchemaMirror): string {
  return schema.joinTemplate.replace(SLOT_PLACEHOLDER, (_match, slotId: AssetSlotId) => {
    const slot = schema.slots.find((entry) => entry.id === slotId);
    return `{${slot?.label ?? slotId}}`;
  });
}
