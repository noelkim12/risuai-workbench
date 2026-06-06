# `_order.json` LLM authoring template

Use this guide for ordering sidecars that accompany multi-file canonical RisuAI surfaces. `_order.json` is not a `.risu*` payload file, but it is part of the canonical authoring contract for several extensions.

## Canonical locations

| Path | Owns order for |
| --- | --- |
| `lorebooks/_order.json` | `lorebooks/**/*.risulorebook` entries |
| `regex/_order.json` | `regex/*.risuregex` rules |
| `prompt_template/_order.json` | `prompt_template/*.risuprompt` items |
| `character/alternate_greetings/_order.json` | alternate greeting `.risutext` files |

## Format

The file is a JSON string array. Entries must refer to files in the corresponding artifact directory.

```json
[
  "first_entry.risulorebook",
  "folder/second_entry.risulorebook"
]
```

## Extension-specific rules

- Lorebook order may include relative paths for nested folder layouts.
- Regex order should list regex rule files in execution/display order.
- Prompt-template order is strict: list `.risuprompt` basenames only, keep every actual prompt file listed exactly once, and do not include paths.
- Alternate greeting order controls only greeting files; missing files referenced by `_order.json` are pack errors.

## LLM editing rules

1. Update `_order.json` whenever adding, deleting, or renaming ordered files.
2. Do not use comments, trailing commas, or non-string entries.
3. Do not invent order sidecars for singleton surfaces such as `.risuvar`, `.risutoggle`, or `.risuhtml`.
4. Preserve existing relative path style for lorebook folders.
