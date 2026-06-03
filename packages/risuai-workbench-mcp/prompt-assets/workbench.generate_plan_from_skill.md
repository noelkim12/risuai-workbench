# Generate plan from approved authoring skill

Target: {{target}}
Context: {{context}}

Workflow:

1. Confirm that the user already approved the selected authoring skill.
2. Read the full skill resource URI included in the `workbench.apply_skill` plan preview bundle.
3. Generate a Korean planning document preview using the selected skill's Build Recipe, Common Pitfalls, and Acceptance Gate.
4. Include the selected skill id, recommendation reason, and source resource URI in the plan preview.
5. Do not write files automatically. If the user wants to save the plan, use the existing Workbench mutation workflow.

Plan preview format:

```markdown
---
project: <project-or-target-name>
type: authoring-skill-plan
status: preview
skill: <skill-id>
created: <date>
tags: []
---

## Overview

## User Goal

## Applied Skill

## Artifact Role Split

## Implementation Plan

## Acceptance Gates

## Risks and Mitigations

## Next Steps
```
