# `.risuchar` LLM authoring template

Use this guide when a `charx` workspace contains a root `.risuchar` marker. `.risuchar` identifies the character workspace root and owns structured character metadata.

## Canonical location

- Path: `<character-root>/.risuchar`
- Target: `charx`
- Format: JSON marker/metadata file
- CBS: none; do not scan as a CBS-bearing artifact.

## Metadata fields

| Field | Meaning |
| --- | --- |
| `$schema` | Schema URL for editor validation. |
| `kind` | Must identify this as `risu.character`. |
| `schemaVersion` | Marker schema version. |
| `id` | Character identifier. |
| `name` | Character name; also influences target-name based artifact filenames. |
| `creator` | Creator name. |
| `characterVersion` | Character version string. |
| `createdAt`, `modifiedAt` | ISO timestamp or `null`. |
| `sourceFormat` | Usually `charx` for extract output or `scaffold` for new scaffold output. |
| `image` | Workspace-relative thumbnail path such as `assets/icons/main.png`, or `null`. |
| `tags` | Canonical tag list packed back to the character card. |
| `flags.utilityBot` | RisuAI utility bot flag. |
| `flags.lowLevelAccess` | Low-level access flag; preserve carefully. |

## Copy-paste template

```json
{
  "$schema": "https://risuai-workbench.dev/schemas/risuchar.schema.json",
  "kind": "risu.character",
  "schemaVersion": 1,
  "id": "example-character",
  "name": "Example Character",
  "creator": "Example Creator",
  "characterVersion": "1.0",
  "createdAt": null,
  "modifiedAt": null,
  "sourceFormat": "scaffold",
  "image": null,
  "tags": [],
  "flags": {
    "utilityBot": false,
    "lowLevelAccess": false
  }
}
```

## LLM editing rules

1. Do not put prose payloads here; use `character/*.risutext` for description, first message, notes, and greetings.
2. Do not put lorebook, regex, Lua, variable, or HTML file lists in `.risuchar`.
3. Keep `image` as a path pointer only; do not embed binary data or asset manifests.
4. Preserve security-sensitive flags such as `lowLevelAccess` unless the user explicitly asks to change them.
