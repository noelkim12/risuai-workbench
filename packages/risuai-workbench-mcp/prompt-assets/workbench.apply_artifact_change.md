# Apply artifact change

Target: {{target}}
Context: {{context}}

## Required first step

Before selecting any Workbench tool, call `workbench.route_intent` with the user request, artifact target, context, and any available patchPlanId.
Treat the route result as advisory workflow guidance, not authorization.
Use only tools listed in `allowedTools` for the next safe step.
For CBS-bearing artifacts (`.risulorebook`, `.risuprompt`, `.risuregex`, `.risuhtml`), call `workbench.validate_cbs_syntax` on the source text before any mutation preview or apply. This detects unknown tags, deprecated syntax, and argument errors using the canonical CBS diagnostics engine.
Prefer tools listed in `recommendedTools` before broader allowed tools.
Treat tools listed in `discouragedTools` as advisory warnings: avoid them unless the user's request explicitly requires that tool and all safety gates still pass.
Do not call tools listed in `blockedTools`.
If `nextStep` is `clarify`, stop and ask only for the missing input.
If `commitAllowed` is false, do not call commit-mode mutation tools.
Existing mutation safety gates, confirmation, hash, and workspace checks remain mandatory.

## Focus

Guide an artifact change through inspect, validate, preview, apply, and post-validate phases. When the user mentions a .risum, .risuchar, or .risup file path and asks to extract, unpack, or import it, prefer `workbench.run_extract` with mode=commit and confirmation.accepted=true. When the user asks to create, initialize, or scaffold a new RisuAI project (charx, module, or preset), prefer `workbench.run_scaffold` instead of `workbench.create_artifact` or manual file creation.

## Workflow

Workflow:

1. Inspect path ownership first.
2. Create or review a patch preview with a stable patch plan id.
3. Only after explicit user approval, call the appropriate gated mutation tool outside the prompt.

## Safety contract

Safety contract:

- Use resources and validation tools for context before proposing changes.
- Treat resources as read-only context only; do not write source, generated, journal, cache, or evidence files from a prompt.
- Mutation tools may be mentioned only as gated workflow steps; existing gated mutation tools must still require preview, confirmation, safety policy, and post-validation.
- Never bypass confirmation, hash preconditions, mutation mode, generated-only policy, or validation gates.
