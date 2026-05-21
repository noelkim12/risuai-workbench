/**
 * Curated lorebook decorator metadata registry.
 * Static data populated from docs/decorator/reference.md.
 * Provides lookup, normalization, completion candidates, and formatting helpers.
 * @file packages/core/src/domain/lorebook/decorators/registry.ts
 */

import type {
  LorebookDecoratorCategory,
  LorebookDecoratorCompletionCandidate,
  LorebookDecoratorSpec,
  LorebookDecoratorSupportLevel,
} from './types';

// ── Internal raw shape ─────────────────────────────────────────────

interface RawDecorator {
  readonly name: string;
  readonly label: string;
  readonly signature: string;
  readonly category: LorebookDecoratorCategory;
  readonly summary: string;
  readonly description: string;
  readonly examples: readonly string[];
  readonly supportLevel: LorebookDecoratorSupportLevel;
  readonly aliases?: readonly string[];
  readonly insertText?: string;
}

// ── Curated decorator catalog ──────────────────────────────────────

const RAW_DECORATORS: ReadonlyArray<RawDecorator> = [
  // ── Insertion position ────────────────────────────────────────
  {
    name: 'depth',
    label: '@@depth N',
    signature: '@@depth N',
    category: 'insertion',
    summary: 'Insert lore at chat depth N',
    description:
      'Inserts the activated lore at depth N in chat history. 0 is a special post-everything position. Non-integer arguments cause the upstream callback to return false.',
    examples: ['@@depth 0', '@@depth 4'],
    supportLevel: 'active',
  },
  {
    name: 'reverse_depth',
    label: '@@reverse_depth N',
    signature: '@@reverse_depth N',
    category: 'insertion',
    summary: 'Insert lore at reverse depth N',
    description:
      'Like @@depth but uses reverse depth positioning, counting from older messages toward newer ones.',
    examples: ['@@reverse_depth 2'],
    supportLevel: 'active',
  },
  {
    name: 'end',
    label: '@@end',
    signature: '@@end',
    category: 'insertion',
    summary: 'Legacy alias for @@depth 0',
    description:
      'Legacy alias equivalent to @@depth 0. New writing UX should prefer @@depth 0 over @@end.',
    examples: ['@@end'],
    supportLevel: 'active',
  },
  {
    name: 'position',
    label: '@@position NAME',
    signature: '@@position NAME',
    category: 'insertion',
    summary: 'Insert lore at named prompt position',
    description:
      'Inserts lore at a named prompt template position instead of a numeric depth. Allowed values: pt_*, after_desc, before_desc, personality, scenario. Invalid names cause the upstream callback to return false.',
    examples: ['@@position after_desc', '@@position pt_custom_memory'],
    supportLevel: 'active',
  },

  // ── Role ──────────────────────────────────────────────────────
  {
    name: 'role',
    label: '@@role system|user|assistant',
    signature: '@@role system|user|assistant',
    category: 'role',
    summary: 'Set insertion message role',
    description:
      'Changes the message role of the inserted lore prompt. Only system, user, assistant are valid. Values like bot or char are not accepted.',
    examples: ['@@role assistant', '@@role system'],
    supportLevel: 'active',
  },

  // ── Activation ────────────────────────────────────────────────
  {
    name: 'probability',
    label: '@@probability N',
    signature: '@@probability N',
    category: 'activation',
    summary: 'Random activation gate (0-100)',
    description:
      'Sets the probability that the lore activates. If Math.random()*100 > N, the lore is deactivated. 15 means roughly 15% chance of survival. Upstream compatibility caveat: the switch case lacks an explicit return, causing fall-through to the priority case. @@probability N may also set priority = N.',
    examples: ['@@probability 15', '@@probability 30'],
    supportLevel: 'partial',
  },
  {
    name: 'activate_only_after',
    label: '@@activate_only_after N',
    signature: '@@activate_only_after N',
    category: 'activation',
    summary: 'Activate only after N messages',
    description:
      'The lore is only considered for activation once the chat has at least N messages. Hides the lore during early conversation.',
    examples: ['@@activate_only_after 10'],
    supportLevel: 'active',
  },
  {
    name: 'activate_only_every',
    label: '@@activate_only_every N',
    signature: '@@activate_only_every N',
    category: 'activation',
    summary: 'Activate only every N-th turn',
    description:
      'The lore is only eligible for activation when chatLength is a multiple of N. Creates recurring periodic events.',
    examples: ['@@activate_only_every 5'],
    supportLevel: 'active',
  },
  {
    name: 'is_greeting',
    label: '@@is_greeting N',
    signature: '@@is_greeting N',
    category: 'activation',
    summary: 'Activate only for greeting index N',
    description:
      'Activates only when the current greeting index matches N. Uses (fmIndex+1) !== N check. Upstream compatibility caveat: the switch case lacks an explicit return, potentially falling through to the position case.',
    examples: ['@@is_greeting 2'],
    supportLevel: 'active',
  },
  {
    name: 'activate',
    label: '@@activate',
    signature: '@@activate',
    category: 'activation',
    summary: 'Force activate unconditionally',
    description:
      'Forces the lore entry to activate regardless of key matching. Skips the condition search entirely.',
    examples: ['@@activate'],
    supportLevel: 'active',
  },
  {
    name: 'dont_activate',
    label: '@@dont_activate',
    signature: '@@dont_activate',
    category: 'activation',
    summary: 'Force deactivate unconditionally',
    description:
      'Forces the lore entry to be deactivated regardless of key matching. Preserves content but disables runtime activation.',
    examples: ['@@dont_activate'],
    supportLevel: 'active',
  },
  {
    name: 'keep_activate_after_match',
    label: '@@keep_activate_after_match',
    signature: '@@keep_activate_after_match',
    category: 'activation',
    summary: 'Persist activation after first match',
    description:
      'Once the lore matches and activates, it stores an internal chat variable to force activation in all subsequent turns.',
    examples: ['@@keep_activate_after_match'],
    supportLevel: 'active',
  },
  {
    name: 'dont_activate_after_match',
    label: '@@dont_activate_after_match',
    signature: '@@dont_activate_after_match',
    category: 'activation',
    summary: 'Deactivate after first match',
    description:
      'Once the lore matches once, it stores an internal chat variable to force deactivation in all subsequent turns. Used for one-time events.',
    examples: ['@@dont_activate_after_match'],
    supportLevel: 'active',
  },

  // ── Search ────────────────────────────────────────────────────
  {
    name: 'scan_depth',
    label: '@@scan_depth N',
    signature: '@@scan_depth N',
    category: 'search',
    summary: 'Per-entry key search depth',
    description:
      'Overrides how many recent chat messages are searched for key matching on this specific entry.',
    examples: ['@@scan_depth 8'],
    supportLevel: 'active',
  },
  {
    name: 'additional_keys',
    label: '@@additional_keys ...',
    signature: '@@additional_keys KEYS',
    category: 'search',
    summary: 'Add extra positive search keys',
    description:
      'Appends additional positive key queries beyond the frontmatter keys. If any of these words appear, the lore becomes an activation candidate.',
    examples: ['@@additional_keys dragon ancient ruin'],
    supportLevel: 'active',
  },
  {
    name: 'exclude_keys',
    label: '@@exclude_keys ...',
    signature: '@@exclude_keys KEYS',
    category: 'search',
    summary: 'Exclude if any key matches',
    description:
      'Adds negative key queries. If any of these words are found, the lore is deactivated.',
    examples: ['@@exclude_keys resolved peaceful'],
    supportLevel: 'active',
  },
  {
    name: 'exclude_keys_all',
    label: '@@exclude_keys_all ...',
    signature: '@@exclude_keys_all KEYS',
    category: 'search',
    summary: 'Exclude only if all keys match',
    description:
      'Adds negative key queries that require ALL keys to be present before deactivating. Unlike exclude_keys which deactivates on any match.',
    examples: ['@@exclude_keys_all castle safe'],
    supportLevel: 'active',
  },
  {
    name: 'match_full_word',
    label: '@@match_full_word',
    signature: '@@match_full_word',
    category: 'search',
    summary: 'Require full-word key matching',
    description:
      'Switches key matching to full-word mode for this entry. Prevents "cat" from matching "cathedral".',
    examples: ['@@match_full_word'],
    supportLevel: 'active',
  },
  {
    name: 'match_partial_word',
    label: '@@match_partial_word',
    signature: '@@match_partial_word',
    category: 'search',
    summary: 'Use partial/substring key matching',
    description:
      'Switches key matching to partial mode. Searches for key substrings even within larger words, ignoring whitespace.',
    examples: ['@@match_partial_word'],
    supportLevel: 'active',
  },

  // ── Recursive ─────────────────────────────────────────────────
  {
    name: 'recursive',
    label: '@@recursive',
    signature: '@@recursive',
    category: 'recursive',
    summary: 'Include in recursive scan source',
    description:
      'Forces this entry to be included in the recursive scanning source, allowing its content to trigger other lore entries.',
    examples: ['@@recursive'],
    supportLevel: 'active',
  },
  {
    name: 'unrecursive',
    label: '@@unrecursive',
    signature: '@@unrecursive',
    category: 'recursive',
    summary: 'Exclude from recursive scan source',
    description:
      'Prevents this entry from being included in the recursive scanning source. Other lore entries will not be triggered by this content.',
    examples: ['@@unrecursive'],
    supportLevel: 'active',
  },
  {
    name: 'no_recursive_search',
    label: '@@no_recursive_search',
    signature: '@@no_recursive_search',
    category: 'recursive',
    summary: 'Do not scan recursive content for keys',
    description:
      'Excludes recursivePrompt content from being searched for this entry\'s keys. Only actual chat messages are scanned.',
    examples: ['@@no_recursive_search'],
    supportLevel: 'active',
  },

  // ── Budget / ordering ─────────────────────────────────────────
  {
    name: 'priority',
    label: '@@priority N',
    signature: '@@priority N',
    category: 'budget',
    summary: 'Token budget priority',
    description:
      'Sets priority for token budget filtering. Higher values survive budget cuts first. Final prompt order also depends on insertion order after budget filtering.',
    examples: ['@@priority 1000'],
    supportLevel: 'active',
  },
  {
    name: 'ignore_on_max_context',
    label: '@@ignore_on_max_context',
    signature: '@@ignore_on_max_context',
    category: 'budget',
    summary: 'Low priority when context is full',
    description:
      'Drops this entry\'s priority to -1000, making it one of the first to be dropped when context space is limited.',
    examples: ['@@ignore_on_max_context'],
    supportLevel: 'active',
  },

  // ── Injection ─────────────────────────────────────────────────
  {
    name: 'inject_lore',
    label: '@@inject_lore TARGET',
    signature: '@@inject_lore TARGET',
    category: 'injection',
    summary: 'Inject content into another lore',
    description:
      'Injects this entry\'s content into another active lore identified by TARGET source/comment name. Active lore list is searched for source === TARGET.',
    examples: ['@@inject_lore Ancient Kingdom'],
    supportLevel: 'partial',
  },
  {
    name: 'inject_at',
    label: '@@inject_at TARGET',
    signature: '@@inject_at TARGET',
    category: 'injection',
    summary: 'Inject at prompt template position',
    description:
      'Creates injection metadata targeting a prompt template position or {{position::...}} slot. Actual injection is handled by the positionParser path, not loadLoreBookV3Prompt directly.',
    examples: ['@@inject_at custom_memory'],
    supportLevel: 'partial',
  },
  {
    name: 'inject_prepend',
    label: '@@inject_prepend PARAM',
    signature: '@@inject_prepend PARAM',
    category: 'injection',
    summary: 'Prepend injection operation',
    description:
      'Changes the injection operation to prepend. The entry\'s content is placed before the target content.',
    examples: ['@@inject_prepend before'],
    supportLevel: 'partial',
  },
  {
    name: 'inject_replace',
    label: '@@inject_replace PARAM',
    signature: '@@inject_replace PARAM',
    category: 'injection',
    summary: 'Replace injection operation',
    description:
      'Changes the injection operation to replace. Replaces the specified string in the target with this entry\'s content.',
    examples: ['@@inject_replace {{DETAILS}}'],
    supportLevel: 'partial',
  },

  // ── UI prompt ─────────────────────────────────────────────────
  {
    name: 'disable_ui_prompt',
    label: '@@disable_ui_prompt system_prompt|post_history_instructions',
    signature: '@@disable_ui_prompt system_prompt|post_history_instructions',
    category: 'ui',
    summary: 'Disable a UI prompt (uncertain)',
    description:
      'Adds a UI prompt to the disable list. However, the current upstream loadLoreBookV3Prompt return value does not include disabledUIPrompts, so the actual effect is unclear.',
    examples: ['@@disable_ui_prompt system_prompt'],
    supportLevel: 'uncertain',
  },

  // ── Unsupported / TODO ────────────────────────────────────────
  {
    name: 'instruct_depth',
    label: '@@instruct_depth N',
    signature: '@@instruct_depth N',
    category: 'insertion',
    summary: 'Instruct mode depth (unsupported)',
    description:
      'Intended for instruct mode depth positioning. Upstream explicitly returns false because RisuAI does not have instruct mode.',
    examples: [],
    supportLevel: 'unsupported',
  },
  {
    name: 'reverse_instruct_depth',
    label: '@@reverse_instruct_depth N',
    signature: '@@reverse_instruct_depth N',
    category: 'insertion',
    summary: 'Reverse instruct depth (unsupported)',
    description:
      'Intended for reverse instruct mode depth. Upstream explicitly returns false.',
    examples: [],
    supportLevel: 'unsupported',
  },
  {
    name: 'instruct_scan_depth',
    label: '@@instruct_scan_depth N',
    signature: '@@instruct_scan_depth N',
    category: 'search',
    summary: 'Instruct scan depth (unsupported)',
    description:
      'Intended for instruct mode scan depth. Upstream explicitly returns false.',
    examples: [],
    supportLevel: 'unsupported',
  },
  {
    name: 'is_user_icon',
    label: '@@is_user_icon',
    signature: '@@is_user_icon',
    category: 'activation',
    summary: 'User icon condition (TODO)',
    description:
      'Intended for user icon conditional logic. Currently a TODO in upstream and returns false.',
    examples: [],
    supportLevel: 'unsupported',
  },
];

// ── Build spec map with deterministic sortPriority ──────────────────

const DECORATOR_MAP = new Map<string, LorebookDecoratorSpec>();

{
  // Group by support level for stable sort ordering
  const groups: Record<LorebookDecoratorSupportLevel, RawDecorator[]> = {
    active: [],
    partial: [],
    uncertain: [],
    unsupported: [],
  };

  for (const raw of RAW_DECORATORS) {
    groups[raw.supportLevel].push(raw);
  }

  const order: LorebookDecoratorSupportLevel[] = [
    'active',
    'partial',
    'uncertain',
    'unsupported',
  ];

  let sortIndex = 0;
  for (const level of order) {
    for (const raw of groups[level]) {
      const spec: LorebookDecoratorSpec = {
        name: raw.name,
        label: raw.label,
        signature: raw.signature,
        category: raw.category,
        summary: raw.summary,
        description: raw.description,
        examples: raw.examples,
        supportLevel: raw.supportLevel,
        sortPriority: sortIndex,
        ...(raw.aliases ? { aliases: raw.aliases } : {}),
        ...(raw.insertText ? { insertText: raw.insertText } : {}),
      };
      DECORATOR_MAP.set(raw.name, spec);
      sortIndex++;
    }
  }
}

// ── Exported helpers ────────────────────────────────────────────────

/**
 * normalizeLorebookDecoratorName.
 * Strips `@@` prefix, trims whitespace, and lowercases a decorator name
 * for consistent registry lookups.
 *
 * @param name - Raw decorator name, with or without `@@` prefix
 * @returns Normalized lowercase name without `@@` prefix
 */
export function normalizeLorebookDecoratorName(name: string): string {
  let normalized = name.trim().toLowerCase();
  if (normalized.startsWith('@@')) {
    normalized = normalized.slice(2);
  }
  return normalized;
}

/**
 * getLorebookDecoratorSpec.
 * Looks up full decorator metadata by name (with or without `@@` prefix).
 *
 * @param name - Decorator name to look up, case-insensitive
 * @returns The full spec, or `undefined` if unknown
 */
export function getLorebookDecoratorSpec(
  name: string,
): LorebookDecoratorSpec | undefined {
  return DECORATOR_MAP.get(normalizeLorebookDecoratorName(name));
}

/**
 * listLorebookDecoratorSpecs.
 * Returns all registered decorator specs in deterministic order
 * (active first, unsupported last), sorted by sortPriority.
 *
 * @returns All decorator specs sorted by support level then registration order
 */
export function listLorebookDecoratorSpecs(): LorebookDecoratorSpec[] {
  return Array.from(DECORATOR_MAP.values());
}

/**
 * Check whether a decorator name starts with a given prefix.
 * Also checks aliases if present.
 */
function nameStartsWith(spec: LorebookDecoratorSpec, prefix: string): boolean {
  if (spec.name.startsWith(prefix)) return true;
  if (spec.aliases) {
    for (const alias of spec.aliases) {
      if (alias.startsWith(prefix)) return true;
    }
  }
  return false;
}

/**
 * Derive insertText for a decorator spec.
 * Uses spec.insertText if present, otherwise derives from signature:
 * if the signature contains a space (has arguments), appends a trailing space.
 */
function deriveInsertText(spec: LorebookDecoratorSpec): string {
  if (spec.insertText) return spec.insertText;
  // Signature like "@@depth N" has a space => argument decorator, add trailing space
  const hasArgs = spec.signature.includes(' ');
  return hasArgs ? `${spec.signature.split(' ')[0]} ` : spec.signature;
}

/**
 * Convert sortPriority (number) to deterministic sortText string for LSP/Monaco.
 */
function toSortText(priority: number): string {
  return String(priority).padStart(4, '0');
}

/**
 * getLorebookDecoratorCompletionCandidates.
 * Returns completion candidates optionally filtered by a partial name prefix.
 * Filtering is prefix-only on normalized name and aliases (not substring/includes).
 * Active/common decorators sort before unsupported entries.
 *
 * @param prefix - Optional name prefix to filter by (without `@@`)
 * @returns Filtered and sorted completion candidates
 */
export function getLorebookDecoratorCompletionCandidates(
  prefix?: string,
): LorebookDecoratorCompletionCandidate[] {
  const all = listLorebookDecoratorSpecs();
  const normalizedPrefix = prefix ? normalizeLorebookDecoratorName(prefix) : '';

  const filtered = normalizedPrefix
    ? all.filter((spec) => nameStartsWith(spec, normalizedPrefix))
    : all;

  return filtered.map((spec) => ({
    label: spec.signature.split(' ')[0],
    name: spec.name,
    detail: spec.summary,
    documentationMarkdown: formatLorebookDecoratorMarkdown(spec.name),
    documentationPlain: formatLorebookDecoratorPlain(spec.name),
    insertText: deriveInsertText(spec),
    sortText: toSortText(spec.sortPriority),
    supportLevel: spec.supportLevel,
  }));
}

// ── Formatting imports from format.ts ───────────────────────────────
// Circular-safe: format.ts imports only types, not this module.

import { formatLorebookDecoratorMarkdown, formatLorebookDecoratorPlain } from './format';
