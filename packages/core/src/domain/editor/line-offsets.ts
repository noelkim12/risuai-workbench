/**
 * 기존 import path 호환을 위해 source-position line offset index를 재노출하는 compatibility module.
 * @file packages/core/src/domain/editor/line-offsets.ts
 */

export type { LineOffsetIndex } from './shared/source-position/line-offset-index';
export { createLineOffsetIndex } from './shared/source-position/line-offset-index';
