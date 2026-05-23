# Apply artifact change

Target: {{target}}
Context: {{context}}

## Focus

Guide an artifact change through inspect, validate, preview, apply, and post-validate phases.

## Workflow

Workflow:

1. Inspect path ownership first.
2. Create or review a patch preview with a stable patch plan id.
3. Only after explicit user approval, call the appropriate gated mutation tool outside the prompt.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
