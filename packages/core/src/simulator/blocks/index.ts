/**
 * Block evaluator barrel export.
 * Re-exports all block evaluator functions and the shared state interface.
 * @file packages/core/src/domain/cbs/simulator/blocks/index.ts
 */
export type { BlockEvaluationState } from './state';
export { evaluateIfBlock } from './if';
export { evaluateWhenBlock } from './when';
export { evaluateEachBlock } from './each';
export { evaluatePureBlock, evaluatePureDisplayBlock, evaluateEscapeBlock } from './literal';
export { trimLines, trimBlankEdgeLines, trimOuterWhitespace } from './whitespace';
