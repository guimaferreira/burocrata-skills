---
name: burocrata
description: Use this skill when the user wants to emit or consult Brazilian documents and certificates through Burocrata, especially when operating from Claude Code, OpenAI Codex, or similar agents.
---

# Burocrata

Use this skill to operate Burocrata through its agent workflow and CLI helpers.

## Quick start

Install the skill:

```bash
npx skills add guimaferreira/burocrata-skills --skill burocrata
```

If the environment already has the Burocrata CLI available, authenticate it:

```bash
burocrata login --token <token>
```

If the environment does not have the published CLI yet, use the repo-local fallback pattern described below and call the API directly through your local helper.

## Workflow

1. Identify the requested document in natural language.
2. If the exact service is unclear, search first.
3. Inspect required fields before asking follow-up questions.
4. Ask only for missing required fields.
5. Check credits when needed.
6. Execute once all required fields are available.
7. Summarize the result clearly.

## CLI pattern

Preferred commands:

```bash
burocrata search "<user request>" --json
burocrata schema <tool-name> --json
burocrata credits --json
burocrata run <tool-name> --input '{"field":"value"}' --json
```

## Guardrails

- Stay restricted to Brazilian document and certificate workflows supported by Burocrata.
- Never invent fields or unsupported services.
- Never ask again for a value already present in the conversation.
- If credits are insufficient, stop and tell the user to recharge in the Burocrata app.
- If authentication fails, ask the user to re-authenticate.
