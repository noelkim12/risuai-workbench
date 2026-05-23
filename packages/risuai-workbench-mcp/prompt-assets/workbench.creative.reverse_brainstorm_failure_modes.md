# Reverse brainstorm failure modes

Target: {{target}}
Context: {{context}}

## Focus

Find failure modes, then invert them into safer creative options.

## Workflow

Workflow:

1. List plausible failure modes and missing evidence.
2. Invert failures into mitigations, validation checks, or smaller ideas.
3. Do not mutate; require explicit selection and preview before any apply step.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
