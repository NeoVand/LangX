---
name: langchain-call-a-model
description: Call a chat model in LangChain v1 (TypeScript) two ways — raw (model.invoke on a list of messages → one AIMessage carrying content + token usage) and composed (prompt | model | parser as a Runnable, invoked or streamed). Use when wiring an LLM into an app for the first time, or when you need to see the exact messages and metadata a chat model maps in and out.
---

# Call a chat model: raw, then as a Runnable

A chat model does one thing: it maps a list of **messages** to one assistant **message**. Prompt
templates, parsers, and chains are all convenience built on top of that single call.

## When to use this

- You're adding an LLM call to an app and want the simplest correct shape.
- You want to see what a chat model actually returns — `content`, `usage_metadata`,
  `response_metadata` — before prompt templates hide the raw message objects.
- You want to compose the model into a reusable chain (`prompt → model → parser`) and stream it.

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/core @langchain/anthropic` (swap the provider package as needed —
  `@langchain/openai`, `@langchain/google-genai`, …).
- An API key in the environment, e.g. `ANTHROPIC_API_KEY`.

## 1 · The raw call — messages in, one AIMessage out

```ts
import { ChatAnthropic } from '@langchain/anthropic';

const model = new ChatAnthropic({ model: 'claude-3-5-sonnet-latest', temperature: 0.7 });

const reply = await model.invoke([
  { role: 'system', content: 'You are concise. Answer in one sentence.' },
  { role: 'user', content: 'Why is the sky blue?' }
]);

reply.content; // → the text
reply.usage_metadata; // → { input_tokens, output_tokens, total_tokens }
reply.response_metadata; // → finish reason, model name, …
```

`model.invoke(...)` accepts a `BaseMessage[]` (or `{ role, content }` tuples) and returns one
`AIMessage`. That `AIMessage` is what every higher-level abstraction is ultimately producing.

## 2 · The model as a Runnable — prompt | model | parser

```ts
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

const chain = ChatPromptTemplate.fromMessages([['human', 'Explain: {topic}']])
  .pipe(model)
  .pipe(new StringOutputParser());

await chain.invoke({ topic: 'embeddings' }); // → a plain string

// the same chain streams, token by token:
for await (const chunk of await chain.stream({ topic: 'embeddings' })) {
  process.stdout.write(chunk);
}
```

The model is one **Runnable**; piping a prompt before it (to fill `{variables}` safely) and a parser
after it (to pull a plain string out of the `AIMessage`) gives a small reusable program you can
`invoke`, `stream`, or `batch`.

## Notes

- Prefer the prompt-template form in real apps — it separates the wording from the wiring.
- Per-call options use `.withConfig({ ... })`; constructor options (temperature, max tokens) go on
  the model itself.
- Streaming is part of the Runnable protocol, not a separate API — any chain that ends in a model (or
  a string parser) can `.stream()`.
