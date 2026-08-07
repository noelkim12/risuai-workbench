## Release policy

This repository uses Changesets as the source of truth for versioning and changelog generation.

### Registry prerequisites

- The npm account or organization must own the `@risuai-workbench` scope.
- GitHub Actions must provide an npm automation token through the `NPM_TOKEN` secret.
- Scoped packages must remain public through `publishConfig.access: public`.
- The publish job keeps `id-token: write` and `NPM_CONFIG_PROVENANCE: true` so npm provenance can be attached.

### Public packages

- `@risuai-workbench/core`
- `@risuai-workbench/cbs-language-server`
- `@risuai-workbench/lua-analyzer-wasm`
- `@risuai-workbench/mcp`

The release train follows `lua-analyzer-wasm -> core -> cbs-language-server -> mcp`. A package may release independently only when every internal dependency range already exists on npm. If a change requires a new internal runtime contract, include changesets for every affected package so Changesets publishes dependencies before consumers.

### Private workspace packages

- `risu-workbench-vscode`
- `risu-workbench-webview`

These packages are ignored by Changesets because they are private workspace consumers and not part of the npm publish surface.

### Channels

- `latest` — stable releases from `main`
- `next` — prerelease validation channel for upcoming semver changes
- `canary` — short-lived snapshot channel for branch or hotfix validation

Manual `next` / `canary` dispatches create an ephemeral patch changeset in the workflow before `changeset version --snapshot`. The generated fragment exists only in the Actions checkout and never schedules a stable version bump.

### Changelog policy

- Every user-visible behavior change for a public package needs a changeset.
- Patch: fixes, compatibility/documentation clarifications, non-breaking CLI/runtime/operator improvements.
- Minor: new LSP features, new standalone CLI/report/query surfaces, new product-level runtime capabilities.
- Major: breaking CLI flag changes, agent contract/schema breaks, exported API removals, compatibility floor changes.

### Smoke policy

Before publish, CI packs all four public packages, installs the tarballs into isolated temporary projects, and verifies the LSP CLI plus the MCP `tools/list` / `workbench.smoke` handshake. After publish, CI repeats smoke checks against the exact npm versions before the release job is considered complete.
