# Review relationship network

Target: {{target}}
Context: {{context}}

## Focus

Review relationship graph communities and edges.

## Workflow

Workflow:

1. Read relationship network analyze resource.
2. Identify surprising edges and affected artifacts.
3. Return review questions and tests.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
