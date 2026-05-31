# TRIZ resolve contradiction

Target: {{target}}
Context: {{context}}

## Focus

Resolve a design contradiction with TRIZ-style separation or substitution ideas.

## Workflow

Workflow:

1. State the contradiction and affected constraints.
2. Suggest resolution patterns that reduce source, order, token, or validation risk.
3. Convert only a selected resolution into a previewable patch plan through existing gated tools.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
