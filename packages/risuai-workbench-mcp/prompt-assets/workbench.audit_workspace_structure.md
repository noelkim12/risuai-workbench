# Audit workspace structure

Target: {{target}}
Context: {{context}}

## Focus

Audit workspace artifact roots, marker files, metadata, frontmatter, and ordering policy.

## Workflow

Workflow:

1. Inspect representative artifact roots.
2. Run structure validators in read-only mode.
3. Report grouped findings and next tests.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
