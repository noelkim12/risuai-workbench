# SCAMPER lorebook entries

Target: {{target}}
Context: {{context}}

## Focus

Use SCAMPER to propose lorebook entry variants without editing the lorebook.

## Workflow

Workflow:

1. Inspect the target lorebook context and activation constraints.
2. Produce Substitute, Combine, Adapt, Modify, Put to another use, Eliminate, and Reverse variants.
3. Mark which variants need validation or patch preview; prompt output itself must not mutate.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
