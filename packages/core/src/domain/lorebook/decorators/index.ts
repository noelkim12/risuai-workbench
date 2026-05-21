/**
 * Lorebook decorator module barrel exports.
 * @file packages/core/src/domain/lorebook/decorators/index.ts
 */

export type {
  LorebookDecoratorSupportLevel,
  LorebookDecoratorSpec,
  LorebookDecoratorCompletionCandidate,
  LorebookDecoratorCategory,
} from './types';

export {
  normalizeLorebookDecoratorName,
  getLorebookDecoratorSpec,
  listLorebookDecoratorSpecs,
  getLorebookDecoratorCompletionCandidates,
} from './registry';

export {
  formatLorebookDecoratorMarkdown,
  formatLorebookDecoratorPlain,
} from './format';

export {
  getLorebookDecoratorCompletionContext,
  getLorebookDecoratorHoverToken,
  type LorebookDecoratorCompletionContext,
  type LorebookDecoratorHoverToken,
} from './context';
