# risu-workbench

The VSCode creator IDE for RisuAI projects.

It imports or scaffolds bot settings, modules, character cards, and analysis-ready project structure, then provides dedicated tooling for CBS, Lua, lorebook, and other RisuAI-specific authoring elements before exporting back to valid RisuAI formats.

It is not a replacement for the full RisuAI app. It is the developer-focused workbench for essential artifacts and workflows that are painful to manage in raw files or ad-hoc web flows.

## Workflow Priority

Edit/analyze > Import/scaffold > Export fidelity > Runtime simulation

## First-Class Artifacts

Bot settings, modules, character cards, analysis outputs, project scaffold

## RisuAI-Specific

- CBS tooling
- Lua analysis
- Lorebook domain logic
- Strict export contracts
- Runtime simulation without model invocation

## Repository Layout

| Path | Role |
|------|------|
| `packages/core/` | Core engine -- card processing, analysis, runtime |
| `packages/vscode/` | VSCode extension |
| `docs/` | Architecture, product, and research documents |

## Development

```bash
npm install
npm run --workspace packages/core build
npm run --workspace packages/core test
npm run --workspace packages/vscode build
```

## License

MIT
