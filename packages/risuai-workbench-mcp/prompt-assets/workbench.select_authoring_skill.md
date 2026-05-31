# Select authoring skill

Target: {{target}}
Context: {{context}}

Workflow:

1. Call `workbench.route_intent` for the user request before selecting a skill.
2. Read `risuai-workbench://skills/index` for the compact skill catalog.
3. Compare the user's request against each skill's `useWhen`, `doNotUseWhen`, `primaryArtifacts`, `families`, and `signals`.
4. Select at most one best skill unless the user explicitly asks for alternatives.
5. Explain the recommendation to the user in plain language.
6. Ask the user for approval before calling `workbench.apply_skill`.

Safety contract:

- This prompt performs LLM-assisted matching only; it is not authorization.
- Never apply a skill without explicit user approval.
- Never treat a skill recommendation as permission to mutate files.
- Full skill Markdown should be read only after the user approves the recommendation.

Output shape for the next `workbench.recommend_skills` call:

```json
{
  "request": "original user request",
  "llmSelection": {
    "skillId": "selected-skill-id",
    "reason": "why this skill matches the user's goal",
    "confidence": 0.85
  }
}
```
