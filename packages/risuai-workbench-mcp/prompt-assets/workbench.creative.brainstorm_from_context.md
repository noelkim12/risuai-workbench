# Brainstorm from context

Target: {{target}}
Context: {{context}}

## Focus

Generate bounded creative ideas from supplied workspace context while separating evidence from assumptions.

## Workflow

Workflow:

1. Gather and cite the current context first.
2. Create concise ideas with evidence, assumptions, candidate mutation types, and next actions.
3. Do not create files; selected ideas must go through ranking, red-team review, and patch preview before any gated mutation tool.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
