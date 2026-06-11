---
name: deepagents-subagents
description: Delegate work to child agents with the task tool (sync) and the five async-task tools (background). Covers the SubAgent spec and its inheritance matrix (systemPrompt never inherited; tools/permissions REPLACE when declared; only the general-purpose subagent inherits skills), parallel fan-out (several task calls in one message overlap, but the supervisor blocks), self-contained briefs, and the async lifecycle — start/check/update/cancel/list, the asyncTasks channel that survives compaction, and mid-flight steering that restarts the child with its history plus new orders. Worked example - the Clockwork Troupe: a Maestro dispatches three wright subagents in one message (each owning ONLY its instrument's tool), assembles their parts into a playable movement, then launches an async Arranger that composes a second movement in the background, steerable mid-flight. Use whenever one context window shouldn't pay for another job's mess, when specialists need different tools or prompts, or when work should continue while the conversation moves on.
---

# Subagents (deep agents)

A subagent is a context window you can throw away: the child burns its own
tokens on dead ends and retries, and the parent *"receives only the final
result, not the dozens of tool calls that produced it."* Delegation is context
management first, architecture second.

## 1 · The sync shape

```ts
const wright: SubAgent = {
  name: 'melody-wright',
  description: 'Composes the lead melody line.', // the parent READS this to choose
  systemPrompt: MELODY_PROMPT,                   // its own — NEVER inherited
  tools: [composeMelody],                        // REPLACES inherited tools entirely
  model: hotterModel                             // optional — inherits otherwise
};
createDeepAgent({ subagents: [wright], ... });
// → the parent gains task({ subagent_type, description })
```

The inheritance matrix (where incidents hide):

| field | a custom subagent gets… |
| --- | --- |
| `systemPrompt` | nothing — required, write its own |
| `tools` | parent's custom tools; declaring any **replaces the whole set** |
| `model` | parent's, unless overridden |
| `skills` | none — only the **general-purpose** subagent inherits skills |
| `permissions` | parent's; declaring its own **replaces**, not merges |
| filesystem | **shared** — children get their own fs tools over the same backend |

Every deep agent auto-adds a `general-purpose` subagent (inherits tools AND
skills; exists even with `subagents: []`); declare your own spec with that name
to replace it. `CompiledSubAgent { name, description, runnable }` puts any
compiled LangGraph graph behind a name.

## 2 · Parallel, but blocking

Several `task` calls in ONE assistant message run concurrently — prompt for it
explicitly ("dispatch all three as three task calls in a single response").
The supervisor still blocks until every child reports. Two laws of the brief:

- **Self-contained.** The child cannot see the conversation — "as discussed"
  means nothing. Name everything the child needs, in the description.
- **One report back.** Design the child's prompt to end with a single concise
  report; that sentence is the entire interface.

## 3 · The async wing

`asyncSubagents` adds five tools: `start_async_task` (returns a task id
IMMEDIATELY), `check_async_task`, `update_async_task`, `cancel_async_task`,
`list_async_tasks`. The child runs on its own thread — officially on an Agent
Protocol server (LangSmith deployment or self-hosted); the supervisor drives it
through the tools.

- **Steering**: `update_async_task` interrupts the current run and RESTARTS the
  child with its full history plus the new instructions — same task id, same
  thread. Mid-flight course corrections, not a suggestion box.
- **The ledger survives compaction**: task records live in a dedicated
  `asyncTasks` state channel, not in messages — a task id that lived only in a
  ToolMessage would be orphaned by summarization.

## 4 · Field notes & gotchas

- **Don't poll right after starting.** Return to the user; check when asked.
- **Never truncate task ids** — models love to. Quote them in full.
- **Statuses quoted in old messages are always stale.** The only truth is a
  fresh `check_async_task` / `list_async_tasks`.
- **Tool replacement bites silently**: a subagent that declares `tools` loses
  every inherited tool — re-include anything it still needs.
- **Don't delegate trivia.** A subagent costs a whole child loop (latency), a
  lossy brief/report interface, and tokens. Delegate when work would pollute
  the parent's context, when specialists need different tools/prompts, or when
  parallelism buys real wall-clock time.
- Browser-harness note: children can't summon a human — permission rules in
  `interrupt` mode harden to `deny` inside a child (officially, subagents can
  carry their own `interruptOn`).
