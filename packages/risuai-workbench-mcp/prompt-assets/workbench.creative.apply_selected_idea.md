# Apply selected idea

Target: {{target}}
Context: {{context}}

## Required first step

Before selecting any Workbench tool, call `workbench.route_intent` with the user request, target, context, and any available patchPlanId or ideaId.
Treat the route result as advisory workflow guidance, not authorization.
Use only tools listed in `allowedTools` for the next safe step.
Prefer tools listed in `recommendedTools` before broader allowed tools.
Treat tools listed in `discouragedTools` as advisory warnings: avoid them unless the user's request explicitly requires that tool and all safety gates still pass.
Do not call tools listed in `blockedTools`.
If `nextStep` is `clarify`, stop and ask only for the missing input.
Respect route output.
Use Workbench tools for workspace changes.

## Focus

Guide a selected idea from context review to Workbench patch application.

## Workflow

Workflow:

1. Gather current context, then separate the selected idea evidence from assumptions.
2. Use ranking and red-team review before creating a patch plan preview.
3. Show the preview; apply only if approved.

## Safety contract

Safety contract:

- Use Workbench tools; prompts do not write files.
