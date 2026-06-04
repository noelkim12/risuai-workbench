# `.risumodule` LLM authoring template

Use this guide when a module workspace contains a root `.risumodule` marker. `.risumodule` identifies the module root and owns structured module metadata.

## Canonical location

- Path: `<module-root>/.risumodule`
- Target: `module`
- Format: JSON marker/metadata file
- CBS: none; do not scan as a CBS-bearing artifact.

## Metadata fields

| Field | Meaning |
| --- | --- |
| `$schema` | Schema URL for editor validation. |
| `kind` | Must identify this as `risu.module`. |
| `schemaVersion` | Marker schema version. |
| `id` | Module identifier. |
| `name` | Module name; may influence target-name based artifact filenames. |
| `description` | Module summary. |
| `image` | Optional workspace-relative thumbnail path or `null`. |
| `namespace` | Optional module namespace. Scaffold only writes it when provided. |
| `cjs` | Optional CommonJS payload metadata when present upstream. |
| `lowLevelAccess` | Low-level access flag; preserve carefully. |
| `hideIcon` | UI visibility flag. |
| `mcp` | Model Context Protocol configuration object when present. |
| `createdAt`, `modifiedAt` | ISO timestamp or `null`. |
| `sourceFormat` | `risum`, `json`, or `scaffold` depending on origin. |

## Copy-paste template

```json
{
  "$schema": "https://risuai-workbench.dev/schemas/risumodule.schema.json",
  "kind": "risu.module",
  "schemaVersion": 1,
  "id": "example-module",
  "name": "Example Module",
  "description": "Example module description",
  "image": null,
  "namespace": "example",
  "lowLevelAccess": false,
  "hideIcon": false,
  "createdAt": null,
  "modifiedAt": null,
  "sourceFormat": "scaffold"
}
```

## LLM editing rules

1. Do not put module payloads here; use `lorebooks/`, `regex/`, `lua/`, `toggle/`, `variables/`, and `html/` files.
2. Do not add `customModuleToggle` to `.risumodule`; module toggle payload belongs in `toggle/*.risutoggle`.
3. Do not fall back to `metadata.json` as the module metadata owner; `.risumodule` is canonical.
4. Keep `image` as a path pointer only. Packaging actual image assets is controlled by asset metadata, not this field alone.
