# risu-workbench

A VS Code-based creator workbench for RisuAI projects.

It extracts `.charx` / `.risum` / `.risup` artifacts into an editable canonical workspace, provides dedicated tooling to edit, analyze, and simulate RisuAI-specific authoring elements — CBS, Lua, lorebooks, assets — and packs everything back into valid RisuAI formats. It is not a replacement for the RisuAI app; it is the developer-focused workbench for artifacts and workflows that are painful to manage in raw files or web UIs.

## Key Features

### Card Extract / Pack (Round-trip)

- Extract `.charx`, `.risum`, `.risup` artifacts into a workspace project structure (`Risu Workbench: Extract Card`)
- Repack edits into the original format (`Pack Card`) — includes a webview pack flow with progress and completion dialogs
- Strict round-trip contracts: embedded recovery-manifest restore, collision archive/restore hardening

### Custom Editors

Webview-backed Monaco editors handle RisuAI-specific file types.

- **Lorebook editor** (`*.risulorebook`) — `@@` decorator semantics, activation-link navigation (CodeLens)
- **Regex editor** (`*.risuregex`) — dry-run validation via the regex simulator
- **Prompt editor** (`*.risuprompt`)
- **HTML editor** (`*.risuhtml`)
- **Marker editor** — edits `.risuchar` / `.risumodule` root marker artifacts

Syntax highlighting is provided for all workbench file types, including `risulua`, `risuvar`, `risutoggle`, and `risutext`.

### CBS Language Support (LSP)

The independently published `cbs-language-server` provides, for CBS (Curly Braced Syntax):

- Diagnostics, completion, hover, signature help, definition/references/rename, formatting, code actions
- Semantic tokens, folding, symbols, inlay hints, lorebook CodeLens
- A JSON `report/query` adapter and a LuaLS companion proxy (Lua diagnostics/hover/completion)

### CBS Preview / Simulator

Side webview panels that dry-run CBS with a local evaluator — no model invocation. Includes `{{raw::}}` asset resolution for previews close to the real render. See [CBS_SIMULATOR_SUPPORT_MATRIX.md](./CBS_SIMULATOR_SUPPORT_MATRIX.md) for coverage.

### Asset Manager

A dedicated asset-management webview app opened from the Artifact Browser.

- Drag-and-drop file addition/replacement, plus a file watcher that auto-detects changes
- Catalog / manifest / combo asset matrix views — axis-exclusion filters, 2- and 3-slot cross-compare, summary heatmap
- Display-regex renderer (`{{raw}}` display rendering, `editdisplay` serialization)

### Lua Analysis

- A Rust → WASM lexical analysis kernel (`lua-analyzer-wasm`) rapidly indexes large `.risulua` files: string literals, CBS markers, state keys (`getState`/`setChatVar`, etc.), require aliases, and module exports
- `Analyze Lua` and `Generate LuaLS Stubs` commands for analysis and LuaLS stub generation

### Artifact Browser

The "Risu Workbench" activity-bar sidebar browses card/module artifacts in the workspace and is the entry point to the card panel, marker editor, asset manager, and other tools.

### MCP Server (Agent Integration)

`risuai-workbench-mcp` — a local stdio MCP server that lets AI agents read, validate, and (with approval) patch the canonical workspace. Facade-based tool surface with patch preview/apply safety.

## Repository Layout

An npm-workspaces monorepo.

| Path | Role |
|------|------|
| `packages/core/` | Shared core engine — RisuAI archive/card I/O, canonical artifact contracts, CBS/Lua/lorebook analysis, runtime helpers, the `risu-core` CLI |
| `packages/cbs-lsp/` | Standalone `cbs-language-server` — LSP for CBS/RisuAI artifacts, JSON `report/query`, LuaLS companion |
| `packages/vscode/` | VS Code extension and official CBS LSP client — languages, grammars, commands, views, webview-backed editors |
| `packages/webview/` | Svelte/Vite/Monaco VS Code webview UI — main editor, marker editor, preview, asset manager, LSP UI bridge |
| `packages/lua-analyzer-wasm/` | Rust/WASM analysis kernel for `.risulua` lexical indexing |
| `packages/risuai-workbench-mcp/` | Local stdio MCP server for agent workflows — extraction, validation, analysis queries, safe patch preview/apply |
| `docs/` | Architecture, product planning, custom-extension specs, core/domain docs, MCP docs, research material |

## Development

```bash
npm install
npm run build:core
npm run build:cbs-lsp
npm run build:webview
npm run build:vscode
```

Open the repository root in VS Code and press `F5` to launch the Extension Development Host. This is the local debugging entry point that runs the `packages/vscode` extension in development mode via the monorepo root `.vscode` launch configuration.

For a full extension development build (including WASM):

```bash
npm run build:extension-dev
```

To verify up to the CBS LSP release boundary:

```bash
npm run verify:cbs-lsp-release
```

Use `npm run lint` and `npm run format` for linting and formatting.

## License

GPL-3.0

---

한국어 버전: [README.md](./README.md)
