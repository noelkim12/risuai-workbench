# Explore wiki

Target: {{target}}
Context: {{context}}

## Focus

Explore wiki and rule resources for task context.

## Workflow

Workflow:

1. Read wiki/rule resources by stable URI.
2. Summarize source-of-truth boundaries.
3. Return links and questions; do not mutate.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
