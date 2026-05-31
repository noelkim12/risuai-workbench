# Review prompt chain

Target: {{target}}
Context: {{context}}

## Focus

Review prompt dependency chains and conflicts.

## Workflow

Workflow:

1. Read prompt chain analyze resource.
2. Summarize upstream/downstream dependencies.
3. Flag conflicts and focused validation steps.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
