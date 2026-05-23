# Plan structure migration

Target: {{target}}
Context: {{context}}

## Focus

Plan a canonical structure migration without applying it.

## Workflow

Workflow:

1. Inventory affected artifacts and order files.
2. Read rule catalog and schema resources.
3. Return a migration checklist and required previews; do not mutate.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
