# Explain analyze diagnostic

Target: {{target}}
Context: {{context}}

## Focus

Explain analyze output diagnostic and evidence.

## Workflow

Workflow:

1. Read diagnostic and analyze graph resources.
2. Tie evidence to source artifacts.
3. Recommend next inspection, validation, or test commands.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
