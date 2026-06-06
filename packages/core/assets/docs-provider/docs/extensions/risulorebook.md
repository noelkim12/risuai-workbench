# `.risulorebook` LLM authoring template

Use this guide when a scaffolded or extracted workspace contains `lorebooks/**/*.risulorebook` files. A `.risulorebook` file is one canonical lorebook entry for `charx` and `module` targets.

## Canonical location

- Directory: `lorebooks/`
- Extension: `.risulorebook`
- Targets: `charx`, `module`
- Ordering: `lorebooks/_order.json` is the source of truth for display/pack order.
- Folder identity: prefer physical paths such as `lorebooks/folder/entry.risulorebook`; `_folders.json` is compatibility support, not the primary authoring surface.

## Frontmatter

The YAML block between the first `---` pair is metadata, not CBS content. Do not put prose that should be injected into the chat in frontmatter.

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Human-facing lorebook entry name. |
| `comment` | yes | Summary/comment shown to creators. |
| `mode` | yes | Activation mode: `normal`, `folder`, `constant`, `multiple`, or `child`. |
| `constant` | yes | Whether the entry is always active. |
| `selective` | yes | Whether secondary-key matching is required. |
| `insertion_order` | yes | Insertion priority/order. |
| `case_sensitive` | yes | Whether key matching is case-sensitive. |
| `use_regex` | yes | Whether keys are interpreted as regex. |
| `folder` | optional | Parent folder reference. Physical path and `_order.json` still define canonical folder identity. |
| `book_version` | optional | Upstream lorebook version metadata. |
| `activation_percent` | optional | Activation probability metadata when available. |
| `id` | optional | Upstream passthrough identifier. Preserve if extracted. |
| `extensions` | optional | Unknown extension metadata. Preserve unless intentionally editing it. |

## Body sections

- `@@@ KEYS`: primary activation keys, one per line.
- `@@@ SECONDARY_KEYS`: optional secondary activation keys, one per line.
- `@@@ CONTENT`: the only CBS-bearing lorebook prose section.

Do not treat `KEYS` or `SECONDARY_KEYS` as YAML frontmatter. They are body sections with lorebook activation data.

## Copy-paste template

```text
---
name: "New Lorebook Entry"
comment: "Short creator-facing summary"
mode: normal
constant: false
selective: false
insertion_order: 100
case_sensitive: false
use_regex: false
folder: null
---
@@@ KEYS
keyword
@@@ CONTENT
Write the lorebook content here. CBS macros may be used in this section.
```

## LLM editing rules

1. Edit `@@@ CONTENT` for story/world knowledge; edit frontmatter only for activation metadata.
2. Preserve unknown optional fields such as `extensions`, `id`, `book_version`, and `activation_percent` when present.
3. When adding/removing/renaming files, update `lorebooks/_order.json` consistently.
4. Do not merge multiple entries into one file unless explicitly asked.
