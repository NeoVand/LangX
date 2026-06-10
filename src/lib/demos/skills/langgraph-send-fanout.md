---
name: langgraph-send-fanout
description: Dynamic map-reduce inside a LangGraph — a conditional edge returns an array of Send objects, each spawning a parallel branch of a target node with its own private payload as state; reducers merge the parallel writes back (fan-in), and the next node fires once behind a barrier after every branch lands. The docs call the pattern orchestrator-worker. Worked example - a slide-deck factory: one plan node fans out into N slide-builder branches (N decided at runtime), a review node validates the merged deck. Use for parallel research, batched generation/review, judge panels, any "split the work, gather the answers" loop where N isn't known until runtime.
---

# Send & fan-out (orchestrator-worker)

A **conditional edge** can return more than a node name — it can return an array of `Send` objects. Each `Send(target, payload)` spawns a **parallel branch** of `target` in the same super-step, with `payload` as that branch's **entire state**. Writes from the branches merge through your channel **reducers**; the node after the fan-out waits behind a **barrier** until every branch lands.

```
START → plan ──Send×N──▶ worker (parallel ×N) ──▶ gather → END
                 ↑ N decided at runtime, by data or by a model
```

## When to use this

- The number of parallel tasks isn't known until runtime (sub-questions, slides, files, leads).
- You're hand-rolling `Promise.all` around LLM calls and losing observability/resumability.
- Orchestrator-worker shapes: research fan-out, batched code review, parallel translation, LLM judge panels.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic`

## 1 · The map step — one `Send` per piece of work

```ts
import { Annotation, StateGraph, Send, START, END } from '@langchain/langgraph';

const State = Annotation.Root({
  topic: Annotation<string>(),
  briefs: Annotation<Brief[]>(),                  // written once by plan
  drafts: Annotation<Draft[]>({                   // written by N branches at once →
    reducer: (a, b) => [...a, ...b],              // REDUCER REQUIRED (the fan-in)
    default: () => []
  })
});

new StateGraph(State)
  .addNode('plan', planNode)
  .addNode('worker', workerNode)
  .addNode('gather', gatherNode)
  .addEdge(START, 'plan')
  .addConditionalEdges(
    'plan',
    (s) => s.briefs.map((brief) => new Send('worker', { brief, theme: s.theme })),
    ['worker'] // declare possible targets so the graph stays drawable
  )
  .addEdge('worker', 'gather')
  .addEdge('gather', END)
  .compile();
```

## 2 · The worker — its state IS the payload

The `Send` payload replaces graph state for that branch. Type the node's first arg as the payload, not the graph state:

```ts
const workerNode = async (s: { brief: Brief; theme: Theme }) => {
  const draft = await makeOne(s.brief, s.theme); // sees ONLY its slice
  return { drafts: [draft] };                    // one element — the reducer concatenates
};
```

Branches run **in the same super-step, in parallel**. Finish order is non-deterministic; the merged array order follows completion, so carry an `idx` in the payload if order matters.

## 3 · The fan-in — reducers + the barrier

- Every parallel write to `drafts` goes through the reducer — without one, parallel writes to the same channel throw an `InvalidUpdateError`.
- `gather` hangs on a plain edge from `worker`, so the runtime won't fire it until **every** branch has landed — then it fires **exactly once**, seeing the fully merged state.
- For uneven multi-step branches (worker chains of different lengths), mark the fan-in node `defer: true` — it then waits until the whole graph has quiesced:

```ts
.addNode('gather', gatherNode, { defer: true })
```

## 4 · Chained fan-outs (map → reduce → map again)

A single fan-in node may itself end in a conditional edge that returns more `Send`s — it runs once, so this is safe. The classic use: a critic that sees the merged results and dispatches a revision wave for the weak ones:

```ts
.addConditionalEdges('review', (s) =>
  s.recs.length
    ? s.recs.map((r) => new Send('revise', { draft: byIdx(s, r.idx), recommendations: r.recommendations }))
    : END,                                  // nothing to fix → finish
['revise', END])
```

Reviewing the *merged* set is the point: a per-branch critic can't see repetition or imbalance across items; the fan-in critic can.

## 5 · Observe the race

Stream `updates` (or `custom`) to watch branches complete one by one:

```ts
for await (const [mode, data] of await graph.stream(input, { streamMode: ['updates', 'custom'] })) {
  if (mode === 'updates') console.log(Object.keys(data)); // ['worker'] per finished branch
}
```

Each finished branch yields its own `updates` chunk. Inside a worker, `config.writer({...})` emits per-branch progress on the `custom` lens (give each event the payload's `idx`).

## Gotchas

- **No reducer → crash.** N parallel writes to one channel require a reducer on that channel.
- **The payload is the branch's whole world.** Workers don't see the rest of the state — pack everything they need (and an `idx`) into the `Send`.
- **Don't fan out from a fanned-out node with another conditional edge** — the branch function runs per completed task, multiplying your Sends. Fan in first, then fan out again from a single node.
- **Name targets in `addConditionalEdges`'s third arg** (`['worker']`) — required for type-safety and graph rendering.
- **`Command.goto` accepts `Send[]` too** — a node can both write state and fan out by returning `new Command({ update, goto: sends })`.
- **Branch state ≠ checkpoint state.** The merged channels are what's checkpointed; per-branch payloads exist only for the branch's lifetime.

## Verify

- A run with 4 briefs spawns 4 `worker` tasks in one super-step (4 separate `updates` chunks).
- `drafts` ends with 4 elements regardless of finish order; `gather` ran once, after all 4.
- Re-running changes the completion order but not the merged result's completeness.
