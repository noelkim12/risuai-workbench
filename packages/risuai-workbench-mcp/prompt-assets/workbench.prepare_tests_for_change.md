# Prepare tests for change

Target: {{target}}
Context: {{context}}

## Focus

Select focused tests for a planned artifact change.

## Workflow

Workflow:

1. Inspect the changed path and artifact kind.
2. Read relevant rule/schema resources.
3. Suggest the smallest reliable test set and build checks.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
