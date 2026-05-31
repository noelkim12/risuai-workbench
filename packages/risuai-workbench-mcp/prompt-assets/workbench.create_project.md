# Create a new RisuAI project

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
If `commitAllowed` is false, do not call commit-mode mutation tools.
Existing mutation safety gates, confirmation, hash, and workspace checks remain mandatory.

## Focus

Guide the creation of a new RisuAI project skeleton through the risu-core scaffold workflow. When the user asks to create, initialize, or scaffold a new RisuAI character, module, or preset project, always prefer `workbench.run_scaffold`.

Do NOT use `workbench.create_artifact` for project skeletons — `create_artifact` is only for adding a single artifact file to an existing project.
Do NOT create project skeleton files manually (e.g., direct file writes, mkdir, or write operations).

## Workflow

1. Resolve the project type (charx, module, or preset) from the user request.
2. Determine the project name and optional output directory (`outDir`).
3. Call `workbench.run_scaffold` with `mode=preview` first to generate a command preview.
4. After explicit user approval, call `workbench.run_scaffold` with `mode=commit` and `confirmation.accepted=true`.
5. Post-validate the scaffold output by checking expected marker files (`.risuchar`, `.risumodule`, or `metadata.json`).

## Safety contract

- Use `workbench.run_scaffold` as the only tool for new project skeleton creation.
- Do not bypass the mutation safety gate, confirmation requirement, or workspace boundary checks.
- The default server mutation mode is `preview-only`; actual writes require `enabled` mode plus confirmation.
- Post-validation checks that expected scaffold markers exist in the output directory.
