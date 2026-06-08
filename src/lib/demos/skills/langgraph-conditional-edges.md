---
name: langgraph-conditional-edges
description: Route a LangGraph at runtime with addConditionalEdges and merge concurrent writes with field reducers — the two halves of "what runs next" and "how updates combine". Worked example: a tic-tac-toe game where a referee node + conditional edge decide whether to play or stop, and two tactical scans write the same field in parallel through a concat reducer. Use when the next node depends on live state (branches, loops, games, escalation) and when more than one node can write the same field in one step.
---

# Conditional edges & reducers

A `StateGraph` is two things at once: a **router** (which node runs next?) and a **merge strategy** (how do writes to the same field combine?). This skill builds both into one graph — a game of **tic-tac-toe** where you play ✕ and the graph plays ◯.

```
START → referee → (router reads the board) ─┬─ game over ─────────────────▶ END
                                            ├─ AI's turn ─▶ [scan_win ∥ scan_block] ─▶ decide ─▶ (loop) referee
                                            └─ your turn ─────────────────────────────────────▶ END
```

A game makes the need for a conditional edge unmistakable: the number of turns is unknown at build time, so "keep playing until someone wins, otherwise wait for the human" **cannot** be a static edge — only a function reading the live board can express it.

## When to use this

- The next node depends on runtime state: branching (triage, escalation), loops with a real exit (retry, refine, play), or any "it depends" routing.
- More than one node can write the same state field — fan-out, parallel checks, map-reduce. That's when you need a reducer.
- Reach past this when the routing is the fixed model⇄tools loop (`createAgent`/StateGraph lesson already covers it) — conditional edges are for the shapes that loop doesn't fit.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic zod`
- A model + key (e.g. `ANTHROPIC_API_KEY`) for the one node that calls an LLM.

## 1 · The conditional edge

`addConditionalEdges(source, router, possibleTargets)` calls your **router** with the current state and routes on what it returns: a node name, `END`, or an **array of names to run several nodes at once**.

```ts
import { StateGraph, START, END } from '@langchain/langgraph';

builder.addConditionalEdges(
  'referee',
  (s) => {
    if (s.status !== 'continue') return END;       // someone won, or a draw
    // ◯'s turn → run BOTH scans in parallel; ✕'s turn → hand back to the UI.
    return turnOf(s.board) === 'o' ? ['scan_win', 'scan_block'] : END;
  },
  ['scan_win', 'scan_block', END]   // declared targets, for graph drawing/validation
);
```

The routing is **code, not a prompt** — it reads merged state and returns a destination. The third argument lists the possible targets so the graph can be drawn and validated.

## 2 · Returning an array fans out

When the router returns `['scan_win', 'scan_block']`, both nodes run in the **same super-step**. Join them by pointing both at the next node — it runs once, after both finish:

```ts
builder
  .addEdge('scan_win', 'decide')
  .addEdge('scan_block', 'decide');   // decide waits for BOTH, then runs once
```

(For a *dynamic* number of parallel branches keyed by data, use `Send` — that's the fan-out lesson. A fixed set like this is just an array or parallel static edges.)

## 3 · Reducers — how concurrent writes combine

Because `scan_win` and `scan_block` both write `analysis` in one super-step, that field **must** declare a reducer. Two writes to one channel in one step is ambiguous; LangGraph raises `INVALID_CONCURRENT_GRAPH_UPDATE` rather than silently dropping one. A reducer says how to combine them:

```ts
import { Annotation } from '@langchain/langgraph';

const GameState = Annotation.Root({
  board:    Annotation<Board>({ reducer: (_, b) => b, default: emptyBoard }),         // last-write-wins
  moves:    Annotation<Move[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }), // append
  // scan_win & scan_block write this at the same time — concat, or it throws:
  analysis: Annotation<ScanNote[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  status:   Annotation<Status>({ reducer: (_, b) => b, default: () => 'continue' })
});
```

A field with no explicit reducer is **last-write-wins** across *separate* super-steps — fine for `board` and `status`, illegal for two writers in the *same* step. The built-in `messages` reducer (`MessagesAnnotation`) is exactly this concat pattern. Nodes always return **partial** updates; the reducer merges them.

## 4 · The referee and the loop

Nodes are plain functions. The `referee` is pure code — it reads the board and writes one field; the conditional edge above reads that field. After `decide` plays ◯, a back-edge returns to `referee` so it can judge the new board — that loop is how one graph plays any number of turns:

```ts
builder
  .addNode('referee', (s) => {
    const w = winner(s.board);
    return { status: w ? w : emptyCells(s.board).length === 0 ? 'draw' : 'continue' };
  })
  .addEdge(START, 'referee')
  .addEdge('decide', 'referee');   // loop back; the conditional edge decides when to stop
```

## 5 · Run it — and watch the routing

`graph.stream(input, { streamMode: 'updates' })` yields one chunk per node, so you can watch the path the router chose:

```ts
const stream = await graph.stream({ board }, { configurable: { thread_id: 't1' }, streamMode: 'updates' });
for await (const chunk of stream) console.log(Object.keys(chunk));
// continue + ◯'s turn → ['scan_win'] ['scan_block'] ['decide'] ['referee']
// you just won      → (nothing — referee routed straight to END, the AI is skipped)
```

That last case is the proof the conditional edge does real work: when the board is already terminal, the AI branch never runs.

## Gotchas

- **Concurrent write with no reducer → `INVALID_CONCURRENT_GRAPH_UPDATE`.** Any field two nodes can write in one super-step needs a reducer (e.g. `(a, b) => [...a, ...b]`).
- **Router must return a real target.** A node name that exists, `END`, or an array of those — declare them all in the third argument.
- **Loops need a stop condition.** A conditional edge that can route back to an earlier node must also be able to return `END`, or you'll hit the recursion limit (default 25; raise with `{ recursionLimit }`).
- **Nodes return partial updates.** Return only the fields you changed; the reducers merge them. Don't rebuild and return the whole state.
- **Array fan-out is one super-step.** Returning `['a','b']` runs both before the next step — that's why their shared writes collide without a reducer.

## Verify

- Streaming with `'updates'` shows `referee → scan_win → scan_block → decide → referee → __end__` on a normal turn, and routes straight to `__end__` (no scans/decide) when the incoming board is already won or full.
- Removing the `analysis` reducer makes a real turn throw `INVALID_CONCURRENT_GRAPH_UPDATE` — proof the reducer is load-bearing.
- ◯ never plays an occupied or off-board cell, blocks an obvious ✕ threat, and takes a winning square when one exists.
