---
name: langchain-create-agent
description: Build a production agent in LangChain v1 (TypeScript) with createAgent — a model, tools, and a system prompt compiled into a ReAct loop on LangGraph. Use when you want a tool-using agent without hand-writing the loop, and want to stream it node-by-node, return structured output, add memory, or slot in middleware. This is the standard way to build agents in LangChain v1.
---

# Build an agent with createAgent

`createAgent` is the standard LangChain v1 way to build a tool-using agent. You give it a model, some tools, and instructions; it compiles the **ReAct loop** (reason → act → reason …) onto a LangGraph and hands you something you can `invoke` or `stream`. You no longer hand-write the loop — but it's the same loop underneath (model → tool calls → tool results → model → … → answer).

## When to use this

- You want a tool-using agent and don't want to maintain the loop yourself.
- You want to stream the agent's progress, return typed output, add memory, or intercept the loop with middleware.
- Basically: the default for agents in LangChain v1. (Hand-roll the loop only to learn it; build with `createAgent`.)

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/core zod @langchain/anthropic` (swap the provider package).
- An API key, e.g. `ANTHROPIC_API_KEY`. Use a model with solid tool-calling.

## The smallest real agent

```ts
import { createAgent } from 'langchain';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const getWeather = tool(async ({ city }) => `${city}: 21°C, clear`, {
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  schema: z.object({ city: z.string() })
});

const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5', // a "provider:model" string, or a model instance
  tools: [getWeather],
  systemPrompt: 'You are a concise assistant. Use tools when they help.'
});

const result = await agent.invoke({
  messages: [{ role: 'user', content: 'Weather in Tokyo?' }]
});
console.log(result.messages.at(-1)?.content);
```

`agent.invoke({ messages })` runs the whole loop and returns the final state (the full message list). The last message is the answer.

## Stream it — watch the loop

`streamMode` decides what each chunk contains:

- `'updates'` — one chunk per **node** that fires (`model_request`, then `tools`, then `model_request` …). Best for showing the loop's control flow.
- `'messages'` — token-by-token model output, for a live typing effect.
- `'values'` — the full state after each step.

```ts
for await (const step of await agent.stream(
  { messages: [{ role: 'user', content: 'Compare Tokyo and London.' }] },
  { streamMode: 'updates' }
)) {
  console.log(Object.keys(step)); // ['model_request'] → ['tools'] → ['model_request'] → …
}
```

## It compiles to a graph

`createAgent` builds a LangGraph `StateGraph` with two nodes — `model_request` (calls the model) and `tools` (runs the tool calls) — joined by a conditional edge: if the model asked for tools, go to `tools`, then back to `model_request`; otherwise end. That's why streaming with `'updates'` shows `model_request → tools → model_request → __end__`. Everything in LangChain v1 is a graph underneath — which is exactly what Level 2 (LangGraph) opens up.

## What you can configure

- `model` — a `"provider:model"` string or a chat-model instance.
- `tools` — the array of `tool()`s the agent may call.
- `systemPrompt` — the agent's standing instructions.
- `responseFormat` — a Zod schema to make the agent return **structured output** (see the structured-output skill).
- `middleware` — hooks that run before/around/after the model and tool calls (approval gates, logging, summarisation). The big lever for production agents.
- `checkpointer` — persistence so the agent can resume a conversation across turns (Level 2).

## Things to get right

- **`createAgent` lives in the `langchain` package**, not `@langchain/langgraph`. The older `createReactAgent` from `@langchain/langgraph/prebuilt` is deprecated in v1.
- **Seed with a message list**, not a bare string: `{ messages: [{ role: 'user', content }] }`.
- **The final answer is `result.messages.at(-1)`** after invoke, or the last `model_request` chunk when streaming.
- **Reach for middleware before forking the graph.** Most "I need the agent to also do X" needs are a middleware, not a custom graph.

## Verify

- Streaming with `'updates'` yields node names that cycle `model_request` ↔ `tools` and end at `__end__`.
- A single-tool question makes one `tools` pass; a multi-part question can make several (and parallel tool calls within one).
- The final message has content and no `tool_calls`.
