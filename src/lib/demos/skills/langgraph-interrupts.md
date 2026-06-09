---
name: langgraph-interrupts
description: Pause a LangGraph mid-run for a human with interrupt(), surface a payload (a proposed action/edit/plan), then continue with Command({ resume }) carrying the human's decision. Build approval gates, plan editors, and confirmation steps as a first-class graph feature instead of a side-channel hack. Worked example: an AI crest designer that proposes each trait and pauses for approve / shuffle / edit. Use whenever an agent must get human sign-off before a consequential or irreversible action, or whenever a human should steer a generative step.
---

# Interrupts & human-in-the-loop

`interrupt(payload)` turns any node into a "wait for the human" gate: it pauses the whole run, checkpoints the exact state, and surfaces `payload` to your app. The run only continues when you call `invoke` again with `Command({ resume: decision })` — and that `decision` becomes the value `interrupt()` returns. Two functions are the entire pause/resume API.

Worked example: an **AI crest designer** that proposes a trait (palette → pattern → emblem → motto), pauses at each one, and lets you **approve**, **shuffle** (re-roll), or **edit**.

## When to use this

- An agent is about to do something consequential or irreversible (spend money, send a message, deploy, delete) and needs explicit human approval first.
- A human should review or steer a generative step (edit a plan, pick among options, correct a draft).
- You're tempted to build an approval queue / confirmation dialog with a side-channel — `interrupt()` is the built-in version.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic`
- A **checkpointer is required** — the pause is a saved checkpoint. `compile({ checkpointer: new MemorySaver() })`.
- A model + key for any node that generates proposals.

## 1 · Pause inside a node

Call `interrupt()` synchronously at the **top** of the node (before any `await`). It throws a signal the runtime catches to checkpoint and pause.

```ts
import { interrupt } from '@langchain/langgraph';

.addNode('gate', (s) => {
  const decision = interrupt(s.proposal);   // ⏸ pauses the run, surfaces s.proposal
  // …code below only runs AFTER the human resumes (see §3)
  if (decision.action === 'shuffle') return { proposal: null };           // re-propose
  return { [s.proposal.trait]: decision.value ?? s.proposal.value, step: s.step + 1 };
})
```

## 2 · The pause surfaces on `__interrupt__`

Run normally; if the graph hit an interrupt, the result carries the payload:

```ts
const cfg = { configurable: { thread_id: 'crest-1' } };
let out = await graph.invoke({ theme }, cfg);
if (out.__interrupt__) {
  const proposal = out.__interrupt__[0].value;   // exactly what you passed to interrupt()
  // …show it to the human
}
```

(Streaming `streamMode: 'updates'` yields the pause as an `{ __interrupt__: [...] }` chunk — that's what the lesson's `runGraphTurn` driver keys on.)

## 3 · Resume with a decision

Re-invoke with `Command({ resume })`. The node **re-runs from the top**, and this time `interrupt()` returns your decision instead of pausing:

```ts
import { Command } from '@langchain/langgraph';

out = await graph.invoke(
  new Command({ resume: { action: 'approve' } }),   // or { action: 'edit', value }, { action: 'reject' }
  cfg                                                // SAME thread_id
);
```

The resume value's shape is your contract — accept / edit / reject, a chosen option, an edited string, whatever your UI produces.

## 4 · Loop over many approvals

Because the node re-runs on resume, you can keep pausing. Pair the gate with a conditional edge to collect several decisions before finishing:

```ts
.addEdge('propose', 'gate')
.addConditionalEdges('gate', (s) => (s.step >= TRAITS.length ? 'assemble' : 'propose'),
  ['propose', 'assemble']);
// run → pause → resume → pause → … → assemble → END
```

Driver-style: loop `invoke(Command({ resume }))` while `out.__interrupt__` is present.

## Gotchas

- **No checkpointer → `interrupt()` can't pause.** Compile with a saver and resume on the **same `thread_id`**.
- **Call `interrupt()` synchronously at node entry**, before any `await`. (In a browser, native `await` drops the run context; this app installs a sync async-context shim — see `src/lib/runtime/async-context.ts`.)
- **The node re-runs from the top on resume.** Any work before `interrupt()` runs twice — keep it cheap and idempotent, or do the expensive work in a *prior* node (here, `propose` generates; `gate` only interrupts + applies).
- **Resume value shape must match** what the node expects back from `interrupt()`.
- **`Command({ resume })` vs fresh input:** pass the `Command` to continue a paused run; passing fresh input would start over.

## Verify

- First `invoke` returns `out.__interrupt__` with your payload; the graph is paused (not finished).
- Resuming with `Command({ resume: { action: 'approve' } })` advances; `{ action: 'shuffle' }` loops back to the same step with a new proposal; `{ action: 'edit', value }` records your value.
- After the last approval the conditional edge routes to the finalize node and the run reaches `END`.
- A different `thread_id` (or a fresh checkpointer) cannot resume the paused run.
