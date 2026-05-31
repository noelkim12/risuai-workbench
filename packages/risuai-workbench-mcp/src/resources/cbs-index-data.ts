/**
 * Bundled CBS semantic reference snippets for MCP resources.
 * These snippets are derived from docs/reference/CBS_FOR_LLM.md and intentionally
 * kept small so the default resource path is an index, not a raw document dump.
 * @file packages/risuai-workbench-mcp/src/resources/cbs-index-data.ts
 */

export const CBS_SYNTAX_MARKDOWN = `# CBS syntax quick reference

CBS uses curly-braced tags in text fields.

\`\`\`text
{{tag}}                           - nullary tag
{{tag::arg}}                      - one argument
{{tag::arg1::arg2::...::argN}}    - multiple arguments separated by ::
{{#block}} ... {{/block}}         - block construct
{{#block::operator::arg}} ... {{/block}} - block with operator chain
\`\`\`

Rules:
- Escape a literal colon inside an argument with \`{{:}}\`.
- Parsing is recursive and inside-out: \`{{upper::{{user}}}}\` resolves \`{{user}}\` first.
- Most values are strings; booleans are usually \`"1"\` and \`"0"\`.
- Use \`risuai-workbench://cbs/index\` first to choose a category or tag detail resource.
`;

export const CBS_BLOCKS_MARKDOWN = `# CBS block constructs

Common blocks:

- \`{{#when::condition}}...{{/when}}\` - conditional content. Prefer this over deprecated \`#if\`.
- \`{{#when::cond}}{{:else}}fallback{{/when}}\` - conditional with fallback.
- \`{{#each array as item}}...{{/each}}\` - iterate array-like values.
- \`{{#pure}}...{{/pure}}\` - protect inner content from recursive parsing.
- \`{{#escape}}...{{/escape}}\` - escape inner CBS syntax.
- \`{{#func::name::arg}}...{{/func}}\` - reusable macro-style block.

Whitespace inside blocks is trimmed by default. Use the \`keep\` operator where preserving whitespace matters.
`;

export const CBS_PATTERNS_MARKDOWN = `# CBS patterns and recipes

Use these patterns as retrieval hints, then inspect tag/category detail resources before editing.

## Variable lifecycle
- Read: \`{{getvar::name}}\`
- Write: \`{{setvar::name::value}}\`
- Increment: \`{{addvar::name::1}}\`
- Related category: \`risuai-workbench://cbs/category/variable\`

## Conditional prompt text
- Use \`{{#when::condition}}...{{/when}}\` for conditional content.
- Related category: \`risuai-workbench://cbs/category/block\`

## Character/user identity
- Use \`{{char}}\`, \`{{user}}\`, and \`{{persona}}\` for identity/persona context.
- Related categories: \`identity\`, \`prompt\`
`;

export const CBS_PITFALLS_MARKDOWN = `# CBS authoring pitfalls

- Do not invent tags. Unknown \`{{...}}\` tags remain literal text.
- Display-only tags are not prompt-shaping tools; avoid them in prompt logic.
- \`#if\` is deprecated. Prefer \`#when\`.
- Mutating tags such as variable setters can no-op in preview/tokenization contexts.
- Random tags can be deterministic depending on chat/message context.
- Always validate edited CBS with \`workbench.validate_cbs_syntax\`.
`;

export const CBS_COMMON_PATTERNS = [
  {
    detailUri: 'risuai-workbench://cbs/patterns',
    id: 'variable-lifecycle',
    tags: ['getvar', 'setvar', 'addvar', 'setdefaultvar'],
    title: 'Variable lifecycle',
  },
  {
    detailUri: 'risuai-workbench://cbs/blocks',
    id: 'conditional-content',
    tags: ['#when', ':else', '#if'],
    title: 'Conditional content',
  },
  {
    detailUri: 'risuai-workbench://cbs/category/identity',
    id: 'identity-context',
    tags: ['char', 'user', 'persona'],
    title: 'Identity context',
  },
] as const;
