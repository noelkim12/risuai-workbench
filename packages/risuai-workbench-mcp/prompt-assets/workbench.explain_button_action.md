# Explain button action

Target: {{target}}
Context: {{context}}

## Focus

Explain button action declaration and usage.

## Workflow

Workflow:

1. Read analyze graph context for button action ids.
2. Summarize declaration, usage, and related Lua handlers.
3. Report unknowns honestly.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
