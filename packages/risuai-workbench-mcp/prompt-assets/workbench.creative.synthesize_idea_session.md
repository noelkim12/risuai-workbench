# Synthesize idea session

Target: {{target}}
Context: {{context}}

## Focus

Summarize an idea session into decisions, candidates, and next safe workflow steps.

## Workflow

Workflow:

1. Group ideas by method, evidence, assumptions, and status.
2. Highlight selected ideas, rejected risks, and patch-plan readiness.
3. Mention that session saving or source mutation occurs only through explicit tools and user-requested actions.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
