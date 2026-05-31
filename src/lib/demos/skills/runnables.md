---
name: langchain-runnables-lcel
description: Rebuild a LangChain v1 (TypeScript) pipeline using the Runnable protocol and LCEL — sequential .pipe(), parallel fan-out with RunnableParallel, concurrent .batch(), and streamEvents inspection. Use when composing prompt → model → parser chains in LangChain JS, or when explaining how LCEL composition works.
---

# Build a LangChain Runnables / LCEL demo

Recreate three small chains that show the core idea of LangChain v1: **every piece is a Runnable**, so they all compose with `.pipe()`, and the same chain runs one input (`invoke`), many inputs (`batch`), or streams its lifecycle (`streamEvents`).

## When to use this

- You want to compose `prompt → model → parser` (or any steps) into one chain.
- You need many inputs answered concurrently without writing a loop.
- You want to inspect what a chain actually does, step by step.

## Prerequisites

- Node 18+ and a TypeScript project.
- `npm i langchain @langchain/core @langchain/anthropic` (swap `@langchain/anthropic` for `@langchain/openai` or `@langchain/google-genai` to use a different model).
- An API key in the environment, e.g. `ANTHROPIC_API_KEY`.

## Core idea

A **Runnable** is anything that implements `invoke`, `batch`, `stream`, and `streamEvents` (plus async variants). Because every primitive shares that interface:

- `.pipe()` joins Runnables into a `RunnableSequence`, left to right — **the output type of each step is the input type of the next**. Line the shapes up and composition just works.
- The composed chain is *itself* a Runnable, so it also has `.batch()`, `.stream()`, `.streamEvents()` for free.

The shapes flowing through a `prompt → model → parser` chain:

```
{ topic }  →  ChatPromptValue  →  AIMessage  →  string
```

## Steps

### 1. Sequential pipe (`invoke`)

```ts
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatAnthropic } from '@langchain/anthropic';

const prompt = ChatPromptTemplate.fromMessages([
  ['system', 'You are a concise tutor. Answer in 1 short paragraph.'],
  ['human', 'Explain {topic} simply.']
]);
const model = new ChatAnthropic({ model: 'claude-haiku-4-5', temperature: 0.2 });
const parser = new StringOutputParser();

// LCEL: pipe composes Runnables left-to-right.
const chain = prompt.pipe(model).pipe(parser);

const text = await chain.invoke({ topic: 'why the sky is blue' }); // → string
```

### 2. Parallel fan-out (`RunnableParallel`)

Run several Runnables on the **same** input concurrently and collect a keyed object.

```ts
import { RunnableParallel, RunnablePassthrough } from '@langchain/core/runnables';

const fanout = RunnableParallel.from({
  short: shortChain,                       // prompt → model → parser
  bullets: bulletChain,                    // a different prompt, same shape
  passthrough: RunnablePassthrough.assign({}) // keep the original input
});

const { short, bullets, passthrough } = await fanout.invoke({ topic });
// All branches start together → wall-clock ≈ the slowest branch, NOT the sum.
```

### 3. Batch many inputs (`.batch()`)

The composed chain is a Runnable, so batching is free — no `for` loop.

```ts
const answers = await chain.batch([
  { topic: 'why the sky is blue' },
  { topic: 'how vaccines work' },
  { topic: 'what causes ocean tides' }
]); // → string[], resolved in parallel. Total ≈ slowest input, not the sum.
```

### 4. Inspect with `streamEvents`

Surface the chain's whole lifecycle instead of just the final string.

```ts
for await (const ev of chain.streamEvents({ topic }, { version: 'v2' })) {
  // ev.event:  on_chain_start | on_prompt_start/end | on_chat_model_start
  //            | on_chat_model_stream | on_chat_model_end | on_parser_* | on_chain_end
  // ev.name:   RunnableSequence | ChatPromptTemplate | ChatAnthropic | StrOutputParser
  if (ev.event === 'on_chat_model_stream') process.stdout.write(ev.data?.chunk?.content ?? '');
}
```

## Things to get right

- **Type contract:** each `.pipe()` requires the left side's output to match the right side's input. A model takes messages (a `ChatPromptValue`) and returns an `AIMessage`; `StringOutputParser` turns that `AIMessage` into a plain `string`.
- **Concurrency is real:** `RunnableParallel` and `.batch()` issue their model calls at once. Measure wall-clock and compare to the sum of the parts — the speed-up is the whole point.
- **`streamEvents` re-emits downstream:** each model token also surfaces as a `*_stream` event on the parser and the sequence. Filter to `on_chat_model_stream` if you only want the model's tokens.
- **`batch` vs `map`:** `chain.batch([a, b, c])` takes a *list of inputs*; `chain.map()` makes a new Runnable that applies the chain to *each item of a single list input*.

## Verify

- `invoke` returns a `string` (not an `AIMessage`) once the parser is piped on.
- Running `batch` over N inputs takes roughly one model call's time, not N×.
- The `streamEvents` log starts with `on_chain_start` and ends with `on_chain_end`, with model tokens in between.
