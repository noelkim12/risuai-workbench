# Trace Lua handler

Target: {{target}}
Context: {{context}}

## Focus

Trace Lua handler and call graph context.

## Workflow

Workflow:

1. Read analyze graph or Lua call graph resources.
2. Summarize handler callers/callees and state access.
3. Recommend tests without applying code edits.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
