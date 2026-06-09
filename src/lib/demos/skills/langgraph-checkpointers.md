---
name: langgraph-checkpointers
description: Add persistence to a LangGraph by compiling with a checkpointer (MemorySaver / SqliteSaver / Postgres) — and get three things from one line: memory across turns scoped by thread_id, a queryable checkpoint history via getStateHistory, and time travel (resume from a past checkpoint_id to fork a run). Worked example: a rewindable chat that remembers earlier turns and can branch from any point. Use whenever a graph must survive across calls, remember a conversation, recover from a crash, or be rewound/forked for debugging or A/B branches.
---

# Checkpointers & time travel

A checkpointer makes the runtime save a **checkpoint** after every super-step. That single fact gives one graph three superpowers, all from the same primitive:

- **Memory** — invoke with a `thread_id` and only the *new* input; the checkpointer reloads the thread's prior state, so the model remembers without you resending the transcript.
- **History** — `getStateHistory(thread)` walks every saved checkpoint; each has a `checkpoint_id`.
- **Time travel** — resume `invoke` from a past `checkpoint_id` with a different input and the run **forks**: a new branch grows from that point, the original stays intact.

Worked example: a **rewindable chat** — one `chat` node over `MessagesAnnotation`, compiled with a `MemorySaver`.

## When to use this

- A graph must persist across separate calls: multi-turn chat, a workflow resumed later, crash recovery.
- You want to inspect, replay, or rewind a run (debugging, time-travel, A/B branches).
- It's also the substrate for `interrupt()` (pause/resume) and is required for human-in-the-loop.
- Skip it only for pure one-shot, stateless runs.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic`
- A model + key (e.g. `ANTHROPIC_API_KEY`) for the chat node.

## 1 · Compile with a checkpointer

It's one extra line. Nothing about the graph changes — persistence is added at compile time.

```ts
import { StateGraph, MessagesAnnotation, MemorySaver, START, END } from '@langchain/langgraph';

const graph = new StateGraph(MessagesAnnotation)
  .addNode('chat', async (s) => ({ messages: [await model.invoke(s.messages)] }))
  .addEdge(START, 'chat')
  .addEdge('chat', END)
  .compile({ checkpointer: new MemorySaver() });   // ← the whole trick
```

`MemorySaver` is in-memory (great for demos/tests). Production swaps in `SqliteSaver` or a Postgres saver — same interface.

## 2 · Threads — memory for free

Every call passes a `thread_id`. The checkpointer reloads that thread's latest state first, so you send only the new message:

```ts
const cfg = { configurable: { thread_id: 'user-42' } };
await graph.invoke({ messages: [new HumanMessage("Hi, I'm Neo.")] }, cfg);
await graph.invoke({ messages: [new HumanMessage("What's my name?")] }, cfg);  // → "Neo"
```

Threads are isolated: a different `thread_id` on the same saver shares nothing. Two users = two thread ids; the runtime keeps them apart.

## 3 · Inspect the history

`getStateHistory` yields every checkpoint for a thread (newest first). Each snapshot carries its address and lineage:

```ts
for await (const snap of graph.getStateHistory({ configurable: { thread_id: 'user-42' } })) {
  console.log(
    snap.config.configurable.checkpoint_id,        // this checkpoint's id
    snap.parentConfig?.configurable.checkpoint_id, // its parent (for building a branch tree)
    snap.next,                                      // nodes it would run next ([] = turn complete)
    snap.values                                     // the state at this point
  );
}
```

## 4 · Time travel — resume from a past checkpoint to fork

Pass a `checkpoint_id` in `configurable` and the run resumes from THAT checkpoint instead of the latest. Give it a different input and it branches:

```ts
// Resume from an earlier point with a different message → a new branch.
await graph.invoke(
  { messages: [new HumanMessage('Actually, call me Mr. Anderson.')] },
  { configurable: { thread_id: 'user-42', checkpoint_id: pastId } }
);
// The original branch is untouched; getStateHistory now shows both.
```

To edit state at a checkpoint *before* resuming (rather than just appending input), use `updateState(configWithCheckpointId, partialValues)` — it writes a new child checkpoint you then resume from.

## Gotchas

- **Resume needs the same `thread_id` AND the same checkpointer instance.** A fresh `MemorySaver` has no memory of prior runs.
- **`checkpoint_id` selects the branch point.** Omit it and you continue the thread's latest; include a past one and you fork from there.
- **`MemorySaver` is in-memory only** — it vanishes on reload/restart. Use `SqliteSaver` / Postgres to persist for real.
- **Concurrent writes still need reducers.** Persistence doesn't change the merge rules (see the conditional-edges lesson); a field two nodes write in one super-step still needs a reducer.
- **Don't resend the whole transcript on each turn.** Send only the new message; the checkpointer supplies the rest. Resending duplicates history.

## Verify

- Two `invoke`s on the same `thread_id`: the second answer uses a fact from the first (memory works).
- A different `thread_id` on the same saver does NOT see that fact (threads are isolated).
- `getStateHistory` returns one or more checkpoints with distinct `checkpoint_id`s after a turn.
- Resuming `invoke` with an earlier `checkpoint_id` produces a reply consistent with the SHORTER history, and the original branch is still retrievable from history (the run forked, nothing was overwritten).
