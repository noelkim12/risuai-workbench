# `.risuprompt` LLM authoring template

Use this guide when a preset workspace contains `prompt_template/**/*.risuprompt` files. A `.risuprompt` file is one canonical prompt-template item in `botPreset.promptTemplate`.

## Canonical location

- Directory: `prompt_template/`
- Extension: `.risuprompt`
- Target: `preset` only
- Ordering: `prompt_template/_order.json` is the strict source of truth for prompt item order.

## Frontmatter

Every `.risuprompt` starts with YAML frontmatter. Allowed fields depend on `type`; do not mix fields from unrelated prompt variants.

| Prompt type | Required frontmatter | Optional frontmatter | Allowed body sections |
| --- | --- | --- | --- |
| `plain`, `jailbreak`, `cot` | `type`, `type2`, `role` | `name` | `@@@ TEXT` |
| `chatML` | `type` | `name` | `@@@ TEXT` |
| `persona`, `description`, `lorebook`, `postEverything`, `memory` | `type` | `name` | `@@@ INNER_FORMAT` |
| `authornote` | `type` | `name` | `@@@ INNER_FORMAT`, `@@@ DEFAULT_TEXT` |
| `chat` | `type`, `range_start`, `range_end` | `name`, `chat_as_original_on_system` | none |
| `cache` | `type`, `name`, `depth`, `cache_role` | none | none |

Use snake_case in frontmatter for file fields such as `range_start`, `range_end`, `chat_as_original_on_system`, and `cache_role`.

## Body sections

- `@@@ TEXT`: prompt text for `plain`, `jailbreak`, `cot`, and `chatML`.
- `@@@ INNER_FORMAT`: inner-format template for typed prompt items and author notes.
- `@@@ DEFAULT_TEXT`: default author-note text.
- `chat` and `cache` prompt items do not have body sections.

## Copy-paste templates

### Plain prompt

```text
---
type: plain
type2: main
role: system
name: "Core instructions"
---
@@@ TEXT
Write the system prompt here.
```

### Chat range prompt

```text
---
type: chat
range_start: 0
range_end: end
chat_as_original_on_system: false
name: "Recent chat"
---
```

### Cache prompt

```text
---
type: cache
name: "short_term_cache"
depth: 4
cache_role: all
---
```

## LLM editing rules

1. Check the `type` before editing: the valid frontmatter fields and sections are variant-specific.
2. Keep `prompt_template/_order.json` exactly aligned with the `.risuprompt` file set.
3. Do not add empty body sections to `chat` or `cache` items.
4. Preserve creator-facing `name` values unless renaming is part of the task.
