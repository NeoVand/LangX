---
name: langgraph-stategraph
description: Hand-build the agent⇄tools ReAct loop from raw LangGraph StateGraph primitives — a typed message state, a model node, a prebuilt ToolNode, and the one conditional edge that loops while the model asks for tools and exits when it answers. This is exactly the graph createAgent compiles to, written out by hand. Use when you want to understand or customise the loop createAgent hides, or as the smallest possible StateGraph to learn nodes, edges, and shared state.
---

# Hand-build the agent⇄tools loop with StateGraph

`createAgent` hands you a finished ReAct loop. `StateGraph` is the runtime one level down — wire the *same* loop yourself out of three primitives and you can see (and change) every part of it:

```
START → agent → (tool_calls?) ── yes ──▶ tools ──▶ agent → …
                      └────────── no ───▶ END
```

- **`agent`** is a **model node**: it hands the whole message list to a tool-bound model and appends the reply.
- **`tools`** is a **code node**: a prebuilt `ToolNode` that runs whatever tool calls the model asked for and appends the results.
- A **conditional edge** after `agent` reads the last message — loop to `tools` while there are tool calls, route to `END` once the model answers in plain text.

That's the whole ReAct loop. `createAgent` *is* this graph with a nicer front door.

## When to use this

- You want to understand what `createAgent` actually builds, or you need to customise the loop it hides (extra nodes, different routing, a side-channel into state).
- You're learning LangGraph and want the smallest real graph: one model node, one tool node, one conditional edge, one shared state.
- Reach for `createAgent` instead when the plain loop is all you want — hand-roll it to *learn* it, then graduate to richer graphs (branching, fan-out, interrupts) like the EDGAR auditor.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core @langchain/anthropic zod`
- A tool-calling model + key (e.g. `ANTHROPIC_API_KEY`) — the `agent` node calls `bindTools`.

## 1 · State — a typed message list with a built-in reducer

The state is the graph's shared memory; every node reads it and returns a **partial** update that the runtime merges. For a chat-shaped loop you don't need to define it by hand — `MessagesAnnotation` is a prebuilt state of `{ messages: BaseMessage[] }` whose reducer **appends** (and dedupes by id). So each node just returns the *new* message(s); it never rebuilds the array.

```ts
import { MessagesAnnotation } from '@langchain/langgraph';
// MessagesAnnotation === { messages: Annotation<BaseMessage[]>({ reducer: appendMessages, default: () => [] }) }
```

## 2 · The model node and the tool node

A node is just a function `state → partial update`. The `agent` node binds the tools to the model so it *can* emit tool calls, then appends the reply. The `tools` node is the prebuilt `ToolNode` — it reads the tool calls off the last `AIMessage`, runs them, and appends one `ToolMessage` per call.

```ts
import { StateGraph, MessagesAnnotation, START, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

const model = await getModel({ temperature: 0 });
const bound = model.bindTools!(tools);     // the model can now ask for these tools
const toolNode = new ToolNode(tools);      // runs whatever it asks for

const builder = new StateGraph(MessagesAnnotation)
  .addNode('agent', async (state) => {
    const ai = await bound.invoke(state.messages); // sees the whole history
    return { messages: [ai] };                     // PARTIAL update — the reducer appends
  })
  .addNode('tools', toolNode);
```

## 3 · Edges — the conditional one is the loop

Two static edges and one conditional edge close the loop:

```ts
const graph = builder
  .addEdge(START, 'agent')
  // the loop's brain: look at the last message, decide where to go next
  .addConditionalEdges('agent', (state) => {
    const last = state.messages.at(-1) as AIMessage;
    return last.tool_calls?.length ? 'tools' : END; // tools requested? loop. else finish.
  })
  .addEdge('tools', 'agent') // after running tools, ALWAYS go back to the model
  .compile();
```

The routing is **code, not a prompt** — it reads the merged state and returns the next node's name (or `END`). `tools → agent` is a plain static edge: tools never decide where to go, they always report back to the model, and the model decides again next turn. That single conditional edge is the entire difference between "answer now" and "use a tool and reconsider."

## 4 · Run it — and watch each node fire

`graph.stream(input, { streamMode: 'updates' })` yields one chunk per node as it runs — perfect for a live view of the loop.

```ts
const config = { configurable: { thread_id: 'sg-1' } };
const stream = await graph.stream(
  { messages: [new HumanMessage("What's the weather in Tokyo? One sentence.")] },
  { ...config, streamMode: 'updates' }
);
for await (const chunk of stream) {
  console.log(Object.keys(chunk)); // ['agent'] → ['tools'] → ['agent'] …
}
```

`updates` never emits the `START`/`END` boundary nodes — if your UI needs them, synthesise a frame before the stream and one after it (that's what the lesson's `runGraphTurn` helper does, so the START/END pills light up and playback stays in sync).

## Gotchas

- **Return a partial update, never the whole state.** `return { messages: [ai] }` — the `MessagesAnnotation` reducer appends it. Returning the full array (or mutating `state.messages`) fights the reducer and duplicates history.
- **The conditional must read the *last* message.** Cast it to `AIMessage` and check `tool_calls?.length`; an empty/absent array means "answer, exit."
- **`tools → agent` is static, not conditional.** The model owns the decision; the tool node just reports results. Don't add a conditional edge out of `tools`.
- **Conditional return values must be real node names (or `END`).** Add the node before you route to it.
- **`bindTools` requires a tool-calling model**, and you must bind on the same instance the node invokes — bind once, outside the node.
- **`ToolNode` needs the matching `tools` array** (same objects you bound). It maps each `tool_call.name` to a tool; an unknown name throws.
- **Browser vs Node import.** In a browser app import from `@langchain/langgraph/web` (it ships a web-compatible async context); in Node use `@langchain/langgraph`. The graph code is otherwise identical.

## Verify

- Streaming with `'updates'` yields node names that cycle `agent` ↔ `tools` and finish at `agent` (then your synthetic `__end__`).
- A one-tool question (`weather`) makes a single `tools` pass; add a second tool (e.g. a calculator) and a two-part question makes the loop run twice before it answers.
- The final `AIMessage` has text content and **no** `tool_calls`.
- This is the same node sequence `createAgent` produces (`model_request`/`tools`) — you've just built it by hand.
