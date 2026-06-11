---
name: deepagents-todos
description: Make a deep agent plan well with write_todos — replace-the-whole-list semantics (pending/in_progress/completed, one in_progress at a time), recitation (the board re-read every turn defeats goal drift), plan mode (draft → human reviews and EDITS the board → execute), live replanning when verification surfaces the unplanned, and mechanical board-discipline ([system-reminder] injection when the board goes stale). Worked example - the Data Janitor: an agent profiles a dirty dataset, drafts its cleaning plan, stops for review, executes the human-revised board step by step, and replans mid-run when validation finds rows no transform can fix. Use whenever an agent runs long enough to forget its own goal, or whenever a human should approve the shape of the work before it starts.
---

# The plan board (`write_todos`)

Long agent runs fail by forgetting, not by lacking skill: the goal scrolls out of recent attention, summarization flattens the milestones, and the agent drifts. The fix is a plan that lives in **state**, not in the model's head. `TodoListMiddleware` is layer #1 of the deep-agents stack — planning is installed before files, subagents, or anything else.

## 1 · The tool's semantics (deliberately crude)

```ts
write_todos(todos: { content: string; status: "pending" | "in_progress" | "completed" }[])
```

- **Replace, not patch.** Every call replaces the entire list. No item-level API.
- **Exactly one `in_progress`** at a time; finished steps stay on the board as `completed`.
- Plan, progress, and replan are therefore the *same operation*: keep what's done, insert what's new, write the list whole.
- Replace-semantics is a feature: the model restates its full understanding of the job every time it touches the board — **recitation** — which keeps the goal physically inside the recent context window every turn.

## 2 · Plan mode (the Claude Code pause)

The cheapest gate in agent design: reviewing a six-line plan takes seconds; reviewing six wrong actions takes an afternoon. Protocol:

1. **Draft phase** — prompt: "profile/research first, then `write_todos` a plan, then reply with one sentence asking for review and STOP. Execute nothing before approval."
2. **Human review** — because the plan is a state object, the gate is *editable*: reword, reorder, delete, add steps.
3. **Execute phase** — same thread, new turn: "I approve your plan as written" or "I revised it; the approved plan is now: 1… 2… Call write_todos with EXACTLY these steps, then execute."

Guard the draft phase: if the turn ends without a board, send one corrective nudge on the same thread.

## 3 · Replanning is just the next write_todos

Pair the plan with real verification (a validate/test tool). When verification surfaces something the plan didn't anticipate, the prompt rule is:

```text
If validation reveals problems the plan didn't anticipate, REPLAN: write_todos
the full updated list — completed steps stay, new recovery steps go where they
belong.
```

This also makes the system robust to *bad human edits*: delete a necessary step at the gate, and verification catches the damage and the agent plans the step back in. The board is the contract; verification is the law.

## 4 · Keeping the board honest (mechanical, not rhetorical)

Models agree to keep the board current, then don't — prompt advice loses to the task under pressure. Enforce it in the loop: count tool rounds since the last `write_todos`, and past a threshold append to the **last tool result** the model reads:

```text
[system-reminder] The plan board is stale — call write_todos with the FULL
updated list (finished steps marked completed, the current one in_progress)
before continuing.
```

Reminders that arrive inside the loop, attached to data the model is already reading, get acted on; preamble rules don't. (Same trick Claude Code uses.)

## 5 · Prompt lines that make plans work

- "profile/inspect FIRST — plan from evidence, never from guesses."
- "Before each step, write_todos with the FULL list — the current step in_progress, finished steps completed."
- "Exactly ONE step is in_progress at any moment."
- "validate is the gate before the report/deliverable."
- "The board is the contract with the human watching it: keep it current."

## 6 · Gotchas

- Don't gate every `write_todos` call behind HITL — status updates would pause the run constantly. Gate the *phase* (draft → approve), or gate real side-effect tools instead.
- When injecting a human-revised plan, say "EXACTLY these steps" — otherwise the model merges your edits with its old draft.
- A plan that never shows `completed` statuses means the agent is batch-updating at the end — that's a log, not a plan. The stale-board reminder fixes it mechanically.
- Keep plans 5–7 steps. Two-step plans don't need a board; twenty-step plans need subagents.
