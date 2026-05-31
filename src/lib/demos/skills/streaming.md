---
name: langchain-streaming
description: Stream LangChain v1 (TypeScript) output three ways — wait for the final value (invoke), yield output chunks token-by-token (stream), or get one typed event per Runnable boundary (streamEvents v2). Use when adding live token output to a chat UI, measuring time-to-first-token, or building an inspector/audit trail over a chain or agent.
---

# Stream a LangChain chain three ways

Streaming is not a separate API — it is part of the **Runnable** protocol. The same `prompt → model → parser` chain can be consumed at three levels, from coarsest to finest.

## When to use this

- A chat UI should show text as it is generated, not after a long pause.
- You want to measure or reduce **time-to-first-token (TTFT)** — when the user first sees *something*.
- You need an audit trail / inspector: every model call, tool call, retrieval, and parse as a typed event.

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/core @langchain/anthropic` (swap the provider package as needed).
- An API key in the environment, e.g. `ANTHROPIC_API_KEY`.

## The three levels

```ts
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatAnthropic } from '@langchain/anthropic';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a concise tutor.'],
  ['human', 'Explain {topic}.']
]);
const model = new ChatAnthropic({ model: 'claude-haiku-4-5' });
const chain = prompt.pipe(model).pipe(new StringOutputParser());
```

### Level 1 — `invoke()`: the final value

```ts
const text = await chain.invoke({ topic }); // resolves only when complete
```

The user sees nothing until it finishes, so **time-to-first-text == total time**. Use it for batch jobs and back-end calls where no one is watching a cursor.

### Level 2 — `stream()`: output chunks

```ts
for await (const chunk of await chain.stream({ topic })) {
  process.stdout.write(chunk); // string chunks, because the parser streams
}
```

First chunk arrives in a few hundred ms; the rest follow. This is what makes a chat UI feel alive. Measure TTFT by timestamping the first chunk vs. the request start.

> Streaming a **chat model directly** (`model.stream(messages)`) yields `AIMessageChunk`s instead of strings — each carries `content`, `tool_call_chunks` for streamed tool calls, and `usage_metadata` (concatenate the chunks with `acc = acc.concat(chunk)` to total it). Piping a `StringOutputParser` on the end turns those chunks into plain text.

### Level 3 — `streamEvents(..., { version: 'v2' })`: one event per boundary

```ts
for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
  // ev.event: on_chain_start | on_prompt_start/end | on_chat_model_start
  //         | on_chat_model_stream | on_chat_model_end | on_parser_* | on_chain_end
  // ev.name:  the Runnable that fired it; ev.data.chunk holds a streamed token
  if (ev.event === 'on_chat_model_stream') process.stdout.write(textOf(ev.data?.chunk?.content));
}
```

Every Runnable announces `*_start`, each token (`*_stream`), and `*_end`. Tools add `on_tool_start/end`, retrievers `on_retriever_start/end`. This is the substrate for inspectors, audit logs, and agent visualisations.

## Things to get right

- **`version: 'v2'` is required and current.** The older `v1` event schema is deprecated — always pass `{ version: 'v2' }`.
- **Name your steps:** `runnable.withConfig({ runName: 'model' })` makes `ev.name` human-readable instead of a class name. Do it per step for a clean event log.
- **Chunks are re-emitted downstream:** one model token also surfaces as a `*_stream` event on the parser and the sequence. Filter to `on_chat_model_stream` for just the model's tokens.
- **`stream()` chunk type follows the last Runnable:** with a `StringOutputParser` you get `string`s; without it you get `AIMessageChunk`s.
- **TTFT is the metric that matters for UX** — not total time. The win of streaming is the first paint, not the last.

## Going further

Agents and LangGraph add `streamMode` (`"values"`, `"updates"`, `"messages"`, `"custom"`) for streaming graph state and per-node tokens — a higher-level layer built on the same idea.

## Verify

- `invoke` returns only when complete; `stream`'s first chunk arrives much sooner (compare timestamps).
- The `stream` output, concatenated, equals the `invoke` result for the same input.
- The `streamEvents` log starts with `on_chain_start` and ends with `on_chain_end`, with `on_chat_model_stream` events carrying tokens in between.
