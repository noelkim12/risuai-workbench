# Six Hats idea review

Target: {{target}}
Context: {{context}}

## Focus

Review one idea through Six Hats perspectives before selection.

## Workflow

Workflow:

1. Separate facts, benefits, risks, feelings, alternatives, and process notes.
2. Tie each risk or benefit to evidence when possible.
3. Return a recommendation for ranking, red-team review, or patch preview without applying anything.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
