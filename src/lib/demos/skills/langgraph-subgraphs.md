---
name: langgraph-subgraphs
description: Compose LangGraph graphs by nesting them — a compiled graph becomes ONE node of a parent graph. Two patterns - shared state keys (add the compiled graph directly to addNode) and different schemas (invoke it inside a node function, translating state at the boundary). Covers checkpointer inheritance (interrupts and time travel keep working inside subgraphs), the three subgraph checkpointing modes, namespaced streaming with subgraphs:true ([namespace, mode, data] chunks identify which subgraph and which parallel branch is speaking), inspecting nested state with getState({subgraphs:true}), and combining subgraphs with Send fan-out. Worked example - a research bureau: N investigator subgraphs work live Wikipedia in parallel, a synthesis subgraph composes a cited dossier, and the thread can be forked from a past checkpoint. Use to structure multi-agent systems where each agent is its own graph.
---

# Subgraphs (graphs as nodes)

A compiled graph is a Runnable — so it can be a **node in another graph**. From outside: one box. Inside: loops, branches, private state, its own conditional edges. This is the encapsulation primitive multi-agent systems are built on (a "subagent" is a subgraph with a persona).

```
parent:  START → plan → ⏸ gate → worker(SUBGRAPH ×N) → gather → compose(SUBGRAPH) → END
worker:  START → frame → act → assess ──thin?──▶ frame   (its own loop, invisible outside)
                                  └──────────▶ distill → END
```

## When to use this

- A node has grown into a workflow (retry loops, multiple model calls, private bookkeeping).
- Orchestrator-worker systems where each worker needs more than one step.
- Teams shipping graphs independently that must compose into one product.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic`

## 1 · Shared keys — the compiled graph IS the node

When the subgraph's channels are a subset of the parent's, pass it straight to `addNode`. It reads and writes the shared channels automatically:

```ts
const synthesist = synthBuilder.compile(); // channels: question, notes, headline, sections
parent.addNode('synthesize', synthesist);  // no wrapper function
```

**Echo gotcha:** the subgraph's output is its final state, so channels it merely *read* are written back to the parent. Overwrite-reducer channels are unaffected (same value), but accumulating channels (concat) would duplicate — make their reducer **idempotent**:

```ts
notes: Annotation<Note[]>({
  reducer: (a, b) => { const out = [...a]; for (const n of b) if (!out.some((x) => same(x, n))) out.push(n); return out; }
})
```

## 2 · Different schemas — transform at the boundary

When schemas differ (or the input is a `Send` payload), invoke the subgraph inside a node function and translate both ways. **Pass `config` through** — that's what inherits the checkpointer and keeps the stream namespaced:

```ts
parent.addNode('investigate', async (payload: { angle: string }, config) => {
  const out = await investigator.invoke({ angle: payload.angle }, config);
  return { notes: out.notes }; // map the subgraph's output to parent channels
});
```

This composes perfectly with `Send` — a conditional edge can dispatch N payloads and each runs the whole subgraph in parallel:

```ts
.addConditionalEdges('gate', (s) => s.angles.map((a) => new Send('investigate', { angle: a })), ['investigate'])
```

## 3 · Persistence: subgraphs inherit the checkpointer

Compile only the PARENT with a checkpointer; subgraphs inherit it per-invocation. `interrupt()` keeps working inside a subgraph, and the whole nested run participates in the thread's history. Three modes when compiling a subgraph:

| compile option | behavior |
|---|---|
| (default / `checkpointer: null`) | fresh per invocation; inherits parent for interrupts — right for workers |
| `checkpointer: true` | subgraph state accumulates across calls on the same thread |
| `checkpointer: false` | no checkpointing at all — plain function call |

## 4 · X-ray streaming: `subgraphs: true`

Stream the parent with `subgraphs: true` and chunks become **three-tuples** — the namespace path says which graph (and which parallel branch) emitted it:

```ts
for await (const [ns, mode, data] of await graph.stream(input, {
  streamMode: ['updates', 'custom'],
  subgraphs: true
})) {
  // ns = []                       → the parent
  // ns = ['investigate:9f31…']    → inside one investigate branch (id = task)
  // ns = ['synthesize:6d14…']     → inside the synthesis subgraph
}
```

`config.writer(...)` events from inside a subgraph surface on the `custom` lens with the same namespacing — carry your own ids in the payload to map branches to UI.

Inspect nested state the same way: `(await graph.getState(config, { subgraphs: true })).tasks[0].state`.

## 5 · Time travel still works (forks)

The parent's history covers the nested run. To fork a past decision, don't re-resume the old checkpoint with a new `Command({ resume })` — **the first resume value is recorded there and replays**. Edit state instead and continue:

```ts
const branch = await graph.updateState(
  { configurable: { thread_id, checkpoint_id: pastCheckpointId } },
  { angles: differentAngles },
  'gate' // attribute the write to this node, so ITS outgoing edges fire next
);
await graph.invoke(null, branch); // same thread, second future
```

## Gotchas

- **A node name may not equal a channel name** — `outline` the node vs `outline` the channel throws at compile.
- **`Annotation.Root` defaults run at module init** — declare constants the defaults reference ABOVE the state (TDZ).
- **Pass `config` into `subgraph.invoke(...)`** in the transform pattern, or you lose checkpointer inheritance, interrupts, and stream namespacing.
- **The echo:** shared-keys subgraphs write back channels they read — idempotent reducers for accumulators.
- **Static discovery:** viewing subgraph state requires the subgraph to be added as a node or called inside a node (not constructed dynamically per call).
- **Forking ≠ re-resuming:** a past interrupt checkpoint replays its recorded resume value; fork with `updateState(…, asNode)` + `invoke(null)`.

## Verify

- The parent sees ONE `investigate` node; streaming with `subgraphs: true` shows N distinct `investigate:<task>` namespaces running interleaved.
- An `interrupt()` in the parent pauses the whole product; resume continues into the subgraphs.
- `updateState` at a past checkpoint + `invoke(null)` produces a second timeline on the same thread — both visible in `getStateHistory`.
