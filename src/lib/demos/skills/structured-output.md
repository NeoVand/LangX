---
name: langchain-structured-output
description: Make a LangChain v1 (TypeScript) chat model return validated, typed data instead of prose — define a Zod schema and call model.withStructuredOutput(schema). Use when extracting fields from free text, classifying/routing, producing tool arguments, or any handoff from an LLM to typed code, instead of asking for JSON in the prompt and parsing it by hand.
---

# Get typed, validated output from a model

Models speak prose; your code wants records. **Structured output** is the bridge: you declare the exact shape you want as a schema, and the provider's tool/function-calling API forces the model to fill it. You get back a typed object — no regex, no `JSON.parse`, no praying.

## When to use this

- Extracting fields from free text (events, contacts, tickets, invoices).
- Classification / routing where the label must be one of a fixed set.
- Producing arguments for a tool or the next step of an agent.
- Any boundary where an LLM hands data to typed code.

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/core zod @langchain/anthropic` (swap the provider package as needed).
- An API key in the environment, e.g. `ANTHROPIC_API_KEY`.

## Don't do this (the naive way)

```ts
const msg = await model.invoke('Reply with JSON: { sentiment, recommend, reason }');
const data = JSON.parse(msg.content); // 🙈 content may be a string wrapped in ```json,
                                      // prefixed with prose, missing a field, or wrong-typed
```

You get a **string**. You strip code fences, `JSON.parse`, and still have no guarantee the fields or types are right.

## Do this instead

```ts
import { z } from 'zod';

const Review = z.object({
  sentiment: z.enum(['positive', 'neutral', 'negative']),
  recommend: z.boolean().describe('Would the writer recommend it?'),
  reason: z.string().describe('One short sentence explaining the call.')
});

const classifier = model.withStructuredOutput(Review, { name: 'classify_review' });
const result = await classifier.invoke('Two days in and I am blown away.');
// result is typed as z.infer<typeof Review> — { sentiment, recommend, reason }
```

`result.sentiment` is one of exactly three strings; `result.recommend` is a real boolean. The shape is **validated**, not hoped for.

## How it works

`withStructuredOutput` registers your schema as a tool (the same mechanism as `bindTools`) and asks the model to call it; the call's arguments are parsed back into your validated object. Field `.describe(...)` text becomes part of the tool definition, so it guides the model.

```ts
// See the mechanism: includeRaw returns the parsed value AND the raw AIMessage
// (with tool_calls and usage_metadata).
const extractor = model.withStructuredOutput(Review, { includeRaw: true });
const { raw, parsed } = await extractor.invoke(text);
raw.tool_calls?.[0];      // { name, args } — the tool call the model emitted
raw.usage_metadata;       // token counts
```

## Schema building blocks (what a schema can enforce)

- `z.string()`, `z.number().min(0).max(1)` — types and numeric ranges.
- `z.enum(['low', 'high'])` — a closed set of choices; the model can't invent a new label.
- `z.array(z.string()).max(5)` — bounded lists.
- `z.boolean()` — a real boolean, not the word "yes".
- `z.object({...})` — nest records; `.optional()` / `.nullable()` for maybe-absent fields.
- `.describe('…')` on any field — guides the model toward the right value.

## Options

- `name` — names the underlying tool (shows up in traces).
- `method` — `'functionCalling'` (default for tool-capable providers), `'jsonSchema'` (native structured output where supported), or `'jsonMode'`.
- `includeRaw` — return `{ raw, parsed }` instead of just the parsed value.

## Things to get right

- **Prefer narrow enums over open strings** — they remove a whole class of "the model said 'Hgh' instead of 'high'" bugs.
- **`.describe()` earns its keep** — a one-line description per ambiguous field markedly improves accuracy.
- **Pair with `.withRetry({ stopAfterAttempt: 3 })`** for resilience against transient provider errors.
- **The result is validated to the schema's shape**, but semantic correctness is still the model's job — keep schemas tight and add an enum/range wherever you can.

## Verify

- `result` has every field, each with the declared type (no `JSON.parse`, no fence-stripping in your code).
- An out-of-set value never appears for an enum field.
- With `includeRaw: true`, `raw.tool_calls[0].args` matches the parsed object.
