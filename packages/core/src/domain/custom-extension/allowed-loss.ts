import type { CustomExtensionTarget } from './contracts';

/** Shared round-trip diff categories. */
export const ALLOWED_LOSS_CATEGORIES = [
  'intentional_unedited',
  'upstream_limit',
  'design_bug',
] as const;

/** Shared round-trip diff category. */
export type AllowedLossCategory = (typeof ALLOWED_LOSS_CATEGORIES)[number];

/** Allowlisted round-trip loss rule. */
export interface AllowedLossRule {
  id: string;
  category: Exclude<AllowedLossCategory, 'design_bug'>;
  targets: readonly CustomExtensionTarget[];
  summary: string;
  references: readonly string[];
}

const ALL_TARGETS = ['charx', 'module', 'preset'] as const satisfies readonly CustomExtensionTarget[];

/** Shared allowlisted loss rules frozen before adapter work begins. */
export const ALLOWED_LOSS_RULES = Object.freeze([
  {
    id: 'authoring-scope-unedited-fields',
    category: 'intentional_unedited',
    targets: ALL_TARGETS,
    summary: 'Fields outside workbench authoring scope are not extracted and repack from upstream defaults.',
    references: [
      'docs/custom-extension/common/principles.md#authoring-scope-원칙',
      'docs/custom-extension/common/root-json-removal.md#2-미편집-필드-정책',
    ],
  },
  {
    id: 'root-json-default-overlay',
    category: 'intentional_unedited',
    targets: ALL_TARGETS,
    summary: 'Legacy root json is removed and replaced by default-template overlay during pack.',
    references: ['docs/custom-extension/common/root-json-removal.md#pack-재조립-흐름'],
  },
  {
    id: 'upstream-selective-logic-injection',
    category: 'upstream_limit',
    targets: ALL_TARGETS,
    summary: 'Upstream injects or drops runtime-only directives that canonical files keep as-is.',
    references: ['docs/custom-extension/common/principles.md#diff-분류'],
  },
  {
    id: 'upstream-case-sensitivity-runtime-collapse',
    category: 'upstream_limit',
    targets: ALL_TARGETS,
    summary: 'Runtime-only case sensitivity collapse is treated as an upstream limitation rather than a canonical bug.',
    references: ['docs/custom-extension/common/principles.md#diff-분류'],
  },
] as const satisfies readonly AllowedLossRule[]);

/** isAllowedLossCategory checks whether a value is a shared diff category id. */
export function isAllowedLossCategory(value: string): value is AllowedLossCategory {
  return ALLOWED_LOSS_CATEGORIES.includes(value as AllowedLossCategory);
}

/** assertAllowedLossCategory validates a shared diff category id. */
export function assertAllowedLossCategory(value: string): asserts value is AllowedLossCategory {
  if (!isAllowedLossCategory(value)) {
    throw new Error(`Unsupported allowed-loss category: ${value}`);
  }
}

/** listAllowedLossRules returns shared allowlisted rules, optionally filtered by category. */
export function listAllowedLossRules(category?: AllowedLossCategory): readonly AllowedLossRule[] {
  if (!category) return ALLOWED_LOSS_RULES;
  if (category === 'design_bug') return [];
  return ALLOWED_LOSS_RULES.filter((rule) => rule.category === category);
}

/** getAllowedLossRule returns one allowlisted rule by id. */
export function getAllowedLossRule(id: string): AllowedLossRule | undefined {
  return ALLOWED_LOSS_RULES.find((rule) => rule.id === id);
}
