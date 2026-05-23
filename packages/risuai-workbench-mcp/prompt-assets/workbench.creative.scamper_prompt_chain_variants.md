# SCAMPER prompt chain variants

Target: {{target}}
Context: {{context}}

## Focus

Use SCAMPER to vary prompt chain placement, wording, or dependency ideas safely.

## Workflow

Workflow:

1. Read prompt chain evidence and conflicts.
2. Generate compact SCAMPER variants tied to context positions or dependencies.
3. Recommend validation and preview steps before using existing gated mutation tools.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
