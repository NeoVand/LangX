---
name: langgraph-streaming-modes
description: Stream a LangGraph run through the right lens — values (full state), updates (per-node deltas), messages (LLM tokens), custom (your own events via config.writer), plus tools and debug — and request several at once by passing an array to streamMode (each chunk becomes a [mode, data] tuple). Worked example: one run streamed four ways at once, where the custom stream paints a picture pixel-by-pixel. Use to build responsive agent UIs: token typing, progress bars, state inspectors, event logs — choosing the projection that fits each surface.
---

# Streaming modes

A LangGraph run is one execution you can **project many ways**. `graph.stream(input, { streamMode })` picks the lens; the chunk shape changes per mode. The modes:

- **`values`** — the entire state after each super-step. For a "current state" inspector.
- **`updates`** — `{ nodeName: delta }` after each super-step. For an event log or server sync.
- **`messages`** — `[messageChunk, metadata]` per LLM token. For chat-style typing; `metadata.langgraph_node` says which node spoke.
- **`custom`** — whatever you emit with `config.writer(obj)` inside a node. Progress, telemetry, even render instructions.
- **`tools`** — tool-call lifecycle events (`on_tool_start`/`event`/`end`/`error`).
- **`debug`** — everything, for introspection.

Worked example: a graph that **picks a picture (LLM) then paints it** — `messages` streams the caption, `custom` streams one event per pixel.

## When to use this

- Building any live agent UI: token-by-token chat, progress indicators, audit logs, dashboards.
- You need more than tokens — emit your own structured progress with `custom`.
- You want several views of one run without re-running it.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic`
- A model + key for any node whose tokens you want on the `messages` lens.

## 1 · One mode

```ts
for await (const chunk of await graph.stream(input, { streamMode: 'updates' })) {
  for (const [node, delta] of Object.entries(chunk)) console.log(node, delta);
}
```

Chunk shape per mode: `values` → full state; `updates` → `{ node: delta }`; `messages` → `[chunk, metadata]`.

## 2 · Several modes at once → `[mode, data]` tuples

Pass an **array**. Now each chunk is tagged with its mode:

```ts
for await (const [mode, data] of await graph.stream(input, {
  streamMode: ['values', 'updates', 'messages', 'custom']
})) {
  if (mode === 'messages')     { const [chunk] = data; type(chunk.content); }
  else if (mode === 'custom')  paintPixel(data);     // your own events
  else if (mode === 'updates') logDelta(data);       // { node: delta }
  else if (mode === 'values')  syncState(data);      // full state
}
```

## 3 · `messages` — stream LLM tokens

`messages` surfaces tokens from **any LLM call inside any node**. Filter by source node or tag:

```ts
for await (const [chunk, meta] of await graph.stream(input, { streamMode: 'messages' })) {
  if (chunk.content && meta.langgraph_node === 'agent') process.stdout.write(chunk.content);
}
```

Add `tags: ['nostream']` to a model to keep its tokens OUT of the stream.

## 4 · `custom` — emit your own events

Inside a node (or tool), call `config.writer(obj)`. The object streams straight to the consumer on the `custom` lens — it can be anything:

```ts
const paint = async (state, config) => {
  for (const px of pixels) config.writer({ type: 'pixel', ...px });  // → custom lens
  return { painted: true };
};
```

Consumer: `for await (const data of await graph.stream(input, { streamMode: 'custom' })) { … }` — or read the `custom` tuples from an array stream as in §2.

## Gotchas

- **Array mode changes the chunk shape.** A single mode yields the raw chunk; an array yields `[mode, data]` tuples — handle both forms deliberately.
- **`messages` needs an LLM call inside a node.** Pure code nodes emit nothing on it.
- **`custom` needs `config.writer` AND the mode requested.** The node receives `config` as its second arg; `config.writer(obj)` only surfaces if you asked for `'custom'`.
- **`messages` chunks are tuples** `[messageChunk, metadata]` — don't forget the metadata holds `langgraph_node` and `tags`.
- **`nostream` tag** excludes a model's tokens — useful when a background model shouldn't appear in the UI.

## Verify

- A single-mode `'updates'` stream yields `{ node: delta }` per super-step.
- An array `streamMode` yields `[mode, data]` tuples; you can route each to a different UI surface from ONE run.
- `'messages'` yields token chunks tagged with `langgraph_node`; `'custom'` yields exactly the objects you passed to `config.writer`.
- The same run feeds all of them — no re-execution.
