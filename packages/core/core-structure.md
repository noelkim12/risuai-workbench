# `packages/core` Structure

## Purpose

`packages/core` is the reusable engine layer for the RisuAI workbench monorepo. It packages:

- a browser-safe root API for types and pure domain helpers,
- a separate Node-only entry for filesystem and PNG/card I/O,
- a CLI surface built on top of those layers.

The intended public contract is enforced by tests such as `tests/root-entry-contract.test.ts` and `tests/domain-node-structure.test.ts`.

## Top-Level Layout

```text
packages/core/
|- assets/        Static package assets (`rpack_map.bin` for pack workflow)
|- bin/           Published CLI binary shim (`risu-core`)
|- dist/          TypeScript build output
|- src/           Source of truth
|- tests/         Vitest contract and workflow tests
|- .tmp/          Local sample outputs / scratch artifacts
|- package.json   Package exports, scripts, bin mapping
|- tsconfig.json  TypeScript build config
`- vitest.config.ts
```

## Entry Points

### Root package entry

- `src/index.ts`
- Re-exports only `src/types` and `src/domain`
- Intentionally excludes Node-specific helpers to keep the root import browser-safe

### Node-specific entry

- `src/node/index.ts`
- Re-exports filesystem helpers, PNG chunk helpers, `parseCharxFile`, and the compat alias `parseCardFile`
- Published as the `./node` subpath export in `package.json`

### CLI entry

- `bin/risu-core.js`
- Loads `dist/cli/main.js` and delegates to its exported `run()` function in-process
- `src/cli/main.ts` dispatches subcommands: `extract`, `pack`, `analyze`, `build`

## Source Layering

### `src/types/`

This directory contains the structural TypeScript contracts exported from the root package.

- `src/types/charx.ts` defines core data shapes such as `CharxData`, `CardData` (compat alias), `RegexScript`, `LorebookEntry`, and `Variable`
- `src/types/index.ts` is a small barrel used by `src/index.ts`

This layer has no runtime behavior.

### `src/domain/`

This is the pure logic center of the package. It should remain free of Node.js I/O.

- `src/domain/charx/`
  - `data.ts`: reads useful fields from unknown card-shaped input
  - `cbs.ts`: extracts CBS variable reads/writes from text
  - `filenames.ts`: filename sanitization
  - `asset-uri.ts`: asset URI resolution and mime/extension inference
- `src/domain/lorebook/`
  - `folders.ts`: folder ID to folder name mapping utilities
  - `structure.ts`: lorebook structure analysis, keyword overlap stats, lorebook CBS collection
- `src/domain/regex/scripts.ts`
  - regex script CBS extraction and default variable parsing
- `src/domain/analyze/`
  - `constants.ts`: report constants, token heuristics, and analysis pipeline phases
  - `correlation.ts`: unified CBS graph building and lorebook/regex correlation
  - `token-budget.ts`: heuristic token budget estimation across analyzer sources
  - `variable-flow.ts`: pipeline-aware variable read/write flow analysis
  - `dead-code.ts`: dead code detection for variables, lorebook, and regex
  - `composition.ts`: multi-artifact compatibility/conflict analysis
  - `prompt-chain.ts`: ordered prompt/template chain dependency analysis
  - `lua-helpers.ts`: Lua AST utility helpers shared by analysis flows
- `src/domain/index.ts`
  - the public barrel for all pure domain helpers

Practical rule: if a function can operate on in-memory values without touching the filesystem, it belongs here.

### `src/node/`

This directory is the platform adapter layer for Node.js runtime concerns.

- `fs-helpers.ts`: `ensureDir`, `writeJson`, `writeText`, `writeBinary`, `uniquePath`
- `png.ts`: PNG text chunk parsing, character JSON decoding, text chunk stripping
- `charx-io.ts`: parses `.json` and `.png` character inputs from disk
- `index.ts`: explicit Node-only export surface

This layer depends on Node built-ins and is intentionally separated from the root package export.

### `src/shared/`

`shared/` acts mostly as a compatibility and convenience facade. It re-exports a mix of domain and node helpers for internal callers that still want one import path.

- `shared/risu-api.ts`: combined Risu-specific helpers
- `shared/extract-helpers.ts`: convenience bridge used by extract workflow
- `shared/analyze-helpers.ts`: re-exports analyze-domain helpers
- `shared/uri-resolver.ts`: compatibility re-export for asset URI utilities
- `shared/index.ts`: barrel over the above

Important nuance: `shared/` is useful internally, but it is not the primary external contract. The package-level contracts are the root entry and `./node` entry.

### `src/cli/`

This is the application layer. Each command has a tiny command module plus a workflow-oriented implementation.

- command wrappers
  - `extract.ts`
  - `pack.ts`
  - `analyze.ts`
  - analysis is routed through `analyze.ts`
  - `build.ts`
- dispatcher
  - `main.ts`
- command-specific workflow folders
  - `extract/`
    - `workflow.ts`: orchestrates the full extraction pipeline
    - `phases.ts`: concrete extraction phases for lorebooks, regex, Lua, assets, HTML, variables, and character card fields
    - `parsers.ts`: low-level CharX and module parsing helpers
  - `pack/`
    - `workflow.ts`: reconstructs output cards from extracted components and assets
  - `analyze/`
    - `workflow.ts`: top-level analyze router for lua/charx/module/preset/compose
    - `lua/`: script-level Lua analysis workflow
    - `charx/`: character-wide analyzer
    - `module/`: module-wide analyzer, collectors, reporting
    - `preset/`: preset-wide analyzer, collectors, reporting, prompt-chain integration
    - `compose/`: explicit composition analyzer for multi-artifact compatibility
    - `shared/`: visualization contract, HTML shell, analyzer view-model helpers
  - `analyze/charx/`
    - `workflow.ts`: end-to-end charx analysis orchestrator
    - `collectors.ts`, `reporting.ts`, `reporting/htmlRenderer.ts`, `types.ts`
  - `build/`
    - `workflow.ts`: emits export JSON from `regex/` and `lorebooks/`

The CLI layer composes:

- pure helpers from `src/domain/`,
- Node adapters from `src/node/`,
- compatibility helpers from `src/shared/` where legacy or convenience imports still exist.

## Architectural Rules Visible in Code

### 1. Public API is intentionally split

- Root import: pure types + domain only
- `./node` import: filesystem and binary/parsing helpers
- CLI: separate executable surface, not part of the root library API

This split is tested directly in `tests/root-entry-contract.test.ts` and `tests/domain-node-structure.test.ts`.

### 2. Workflows own orchestration

The command files are deliberately thin. Real behavior lives in workflow files such as:

- `src/cli/extract/workflow.ts`
- `src/cli/pack/workflow.ts`
- `src/cli/analyze/workflow.ts`
- `src/cli/analyze/charx/workflow.ts`
- `src/cli/analyze/module/workflow.ts`
- `src/cli/analyze/preset/workflow.ts`
- `src/cli/build/workflow.ts`

This keeps command dispatch simple and makes orchestration logic easier to test and evolve.

### 3. Domain stays reusable

Files under `src/domain/` work on data structures and analysis primitives instead of files on disk. That makes them suitable for reuse from the VS Code extension and from tests.

### 4. Generated output is not source of truth

- `dist/` is generated by `tsc`
- `.tmp/` holds local outputs/samples
- `node_modules/` is package-local dependency state

The authoritative implementation lives in `src/` and `tests/`.

## Test Coverage Shape

The `tests/` directory focuses on package boundaries and workflow contracts.

- entry/contract tests
  - `root-entry-contract.test.ts`
  - `node-entry.test.ts`
  - `domain-node-structure.test.ts`
- CLI behavior tests
  - `cli-main-dispatch.test.ts`
  - `cli-smoke.test.ts`
  - `smoke.test.ts`
- workflow-specific regression tests
  - `lorebook-folder-layout.test.ts`
  - `pack-character-roundtrip.test.ts`
  - `analyze-card-lorebook-manifest.test.ts`
  - `domain-phase1-extraction.test.ts`
  - `token-budget.test.ts`
  - `variable-flow.test.ts`
  - `dead-code.test.ts`
  - `composition-analysis.test.ts`
  - `prompt-chain.test.ts`

## Build and Publish Notes

- `package.json`
  - publishes `dist/`, `bin/`, and `assets/rpack_map.bin`
  - exposes `.` and `./node`
  - defines `risu-core` binary
- `tsconfig.json`
  - `rootDir: ./src`
  - `outDir: ./dist`
  - declaration output enabled
- `vitest.config.ts`
  - runs `tests/**/*.test.ts`

## Mental Model for Changes

When editing this package, use this decision rule:

- update `src/types/` when the public data model changes
- update `src/domain/` for pure transformations, analysis, and reusable business rules
- update `src/node/` for file/buffer/runtime adapters
- update `src/cli/` when command behavior or workflow orchestration changes
- update `src/shared/` only when compatibility or convenience exports need to move with the new structure

That model matches the current package contract and the existing test suite.
