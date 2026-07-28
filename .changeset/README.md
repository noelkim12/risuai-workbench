## Release policy

This repository uses Changesets as the source of truth for versioning and changelog generation.

### Public packages

- `@risuai-workbench/core`
- `@risuai-workbench/cbs-language-server`

Both packages use semver and can release independently, but `@risuai-workbench/cbs-language-server` must depend on a published `@risuai-workbench/core` range. If a `@risuai-workbench/cbs-language-server` change requires a new `core` runtime contract, include changesets for both packages in the same pull request so publish order can release `core` before `@risuai-workbench/cbs-language-server`.

### Private workspace packages

- `risu-workbench-vscode`
- `risu-workbench-webview`

These packages are ignored by Changesets because they are private workspace consumers and not part of the npm publish surface.

### Channels

- `latest` — stable releases from `main`
- `next` — prerelease validation channel for upcoming semver changes
- `canary` — short-lived snapshot channel for branch or hotfix validation

### Changelog policy

- Every user-visible behavior change for `core` or `@risuai-workbench/cbs-language-server` needs a changeset.
- Patch: fixes, compatibility/documentation clarifications, non-breaking CLI/runtime/operator improvements.
- Minor: new LSP features, new standalone CLI/report/query surfaces, new product-level runtime capabilities.
- Major: breaking CLI flag changes, agent contract/schema breaks, exported API removals, compatibility floor changes.

### Smoke policy

After publish, CI installs the exact published `@risuai-workbench/cbs-language-server` version from npm and verifies `--version`, `--help`, and server-module import surface before the release job is considered complete.
