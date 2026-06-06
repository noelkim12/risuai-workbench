# `.risutext` LLM authoring template

Use this guide when a `charx` workspace contains character prose payloads. `.risutext` files are frontmatter-free text bodies.

## Canonical location

- Directory: `character/`
- Extension: `.risutext`
- Target: `charx` only

## Field mapping

| Path | Upstream field |
| --- | --- |
| `character/description.risutext` | `data.description` |
| `character/first_mes.risutext` | `data.first_mes` |
| `character/system_prompt.risutext` | `data.system_prompt` |
| `character/replace_global_note.risutext` | `data.replaceGlobalNote` |
| `character/creator_notes.risutext` | `data.creator_notes` |
| `character/additional_text.risutext` | `data.extensions.risuai.additionalText` |
| `character/alternate_greetings/*.risutext` | `data.alternate_greetings[]` |

## Frontmatter

`.risutext` has no frontmatter. The whole file is the prose value for its mapped field. Do not add YAML blocks, field headers, or `@@@` section markers.

## Copy-paste template

```text
Write the character-facing text here.

CBS macros may be used if the target field expects runtime expansion.
```

## LLM editing rules

1. Use the path to identify which character field you are editing.
2. Preserve file boundaries: do not merge description, first message, and alternate greetings into one file.
3. `character/alternate_greetings/_order.json` owns alternate greeting order; update it when adding/removing/renaming greetings.
4. If both `.risutext` and legacy `.txt` exist for the same field, `.risutext` is canonical.
