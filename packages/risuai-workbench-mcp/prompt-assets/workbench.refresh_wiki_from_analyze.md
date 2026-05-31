# Refresh wiki from analyze

Target: {{target}}
Context: {{context}}

## Focus

Plan generated wiki refresh from analyze outputs.

## Workflow

Workflow:

1. Read analyze graph and current wiki resources.
2. Ask for a generated wiki refresh preview.
3. Require confirmation and generated-only policy before any refresh tool call outside the prompt.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
