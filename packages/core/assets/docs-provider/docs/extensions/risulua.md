# `.risulua` LLM authoring template

Use this guide when a scaffolded or extracted `charx` or `module` workspace contains RisuLua source. `.risulua` files are raw Lua source; there is no YAML frontmatter and no section marker syntax.

## Canonical location

- Extension: `.risulua`
- Targets: `charx`, `module`
- Unsupported target: `preset`
- Single-file development: `lua/<targetName>.risulua`
- Modular development: `lua/main.risulua` plus `lua/**/*.risulua`, bundled into generated `dist/<targetName>.risulua`

## Frontmatter

`.risulua` has no frontmatter. The whole file is Lua source and is treated as one CBS-aware analysis surface by the workbench.

Do not add `---` metadata blocks, manifests, or `@@@` sections to Lua files.

## Modular development rules

- `lua/main.risulua` is the only composition root.
- `require("common.variables")` resolves to `lua/common/variables.risulua`.
- Only static dot-notation require IDs are allowed.
- Generated `dist/*.risulua` files are pack artifacts; edit source files under `lua/` instead.
- No Lua manifest is used in the first implementation: no `risulua.json`, no `lua/manifest.json`.

## Copy-paste template

```lua
local variables = require("common.variables")

function onInput()
  if variables.enabled() then
    return "success"
  end
  return "fallback"
end
```

## LLM editing rules

1. In modular workspaces, read `docs/risulua-split-report.md` and related sidecars before moving or renaming symbols.
2. Never edit `dist/*.risulua` as the source of truth; rebuild it from `lua/`.
3. Do not introduce dynamic `require`, slash paths, `.risulua` suffixes in require IDs, `dofile`, `loadfile`, or `package.path` mutation.
4. Preserve host-visible function names and callback signatures unless explicitly asked to change runtime behavior.
