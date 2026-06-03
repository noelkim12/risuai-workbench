# Review artifact change

Target: {{target}}
Context: {{context}}

## Required first step

Before selecting any Workbench tool, call `workbench.route_intent` with the user request, artifact target, context, and any available patchPlanId.
Treat the route result as advisory workflow guidance, not authorization.
Use only tools listed in `allowedTools` for the next safe step.
Prefer tools listed in `recommendedTools` before broader allowed tools.
Treat tools listed in `discouragedTools` as advisory warnings: avoid them unless the user's request explicitly requires that tool and all safety gates still pass.
Do not call tools listed in `blockedTools`.
If `nextStep` is `clarify`, stop and ask only for the missing input.
Respect route output.
Use Workbench tools for workspace changes.

## Focus

Review a proposed artifact change against canonical structure rules.

## Workflow

Workflow:

1. Inspect the target path or artifact root.
2. Read wiki/rule/schema resources relevant to the change.
3. Run validators and summarize risks before any preview step.

## Safety contract

Safety contract:

- Use Workbench tools; prompts do not write files.
