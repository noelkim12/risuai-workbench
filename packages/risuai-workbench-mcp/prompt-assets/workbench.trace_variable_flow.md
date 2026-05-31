# Trace variable flow

Target: {{target}}
Context: {{context}}

## Focus

Trace variable readers, writers, and diagnostics.

## Workflow

Workflow:

1. Read analyze graph or query variable-flow tools.
2. Summarize readers, writers, and missing-edge diagnostics.
3. Recommend validation or tests; do not edit variables from the prompt.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
