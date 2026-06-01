---
name: langchain-tools
description: Give a LangChain v1 (TypeScript) chat model the ability to take actions — define typed tools with tool(), bind them with bindTools, and run the tool-calling loop (model → tool_calls → ToolMessage → model) until it answers. Use when a model needs to look things up, query a database, call an API, or change state, rather than only generating text. Includes the hand-written loop you can paste into any project.
---

# Give a model tools (and run the loop)

A chat model can only produce text. A **tool** lets it act: look something up, query a database, hit an API, change state. You describe the tool with a typed schema; the model decides when to call it and with what arguments; your code runs it and hands back the result. That round-trip, repeated, is the agent loop — and it's the foundation of every agent in LangGraph and Deep Agents.

## When to use this

- The answer depends on data the model doesn't have (a database, an API, the current time).
- The model should *do* something — create a record, send a message, update state.
- You want it to chain steps: look up X, then use X to fetch Y.

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/core zod @langchain/anthropic` (swap the provider package).
- An API key in the environment. Use a model with solid tool-calling support — small local models often miss or malform calls.

## Define a tool

```ts
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const getOrders = tool(
  async ({ customerId, status }) => {
    const rows = db.orders.filter(o => o.customerId === customerId && (!status || o.status === status));
    return JSON.stringify(rows); // return a string or an object the model can read
  },
  {
    name: 'get_orders', // snake_case — most reliable across providers
    description: "Get a customer's orders by id, optionally filtered by status.",
    schema: z.object({
      customerId: z.number().describe('The customer id from find_customers.'),
      status: z.enum(['paid', 'pending', 'refunded']).optional()
    })
  }
);
```

**The description and schema are the model's user manual.** A precise description, `snake_case` name, narrow `z.enum`s, and a `.describe()` on each ambiguous field are what make the model call the right tool with the right arguments.

## Bind and call

```ts
const model = (await getModel()).bindTools([findCustomers, getOrders]);
const ai = await model.invoke(messages);
// ai.tool_calls === [{ name: 'find_customers', args: { name: 'Ada' }, id: 'call_…' }]
```

The model replies with either content (it's answering) or `tool_calls` (it wants you to run something).

## The loop (paste-ready)

```ts
import { AIMessage, ToolMessage } from '@langchain/core/messages';

async function runToolLoop(model, tools, messages, maxTurns = 6) {
  const byName = new Map(tools.map(t => [t.name, t]));
  for (let i = 0; i < maxTurns; i++) {
    const ai = await model.invoke(messages);          // 1. ask the model
    messages.push(ai);
    if (!ai.tool_calls?.length) return messages;       // 2. no calls → it answered
    for (const tc of ai.tool_calls) {                  // 3. run each requested call
      const result = await byName.get(tc.name).invoke(tc.args);
      messages.push(new ToolMessage({                  // 4. feed the result back…
        tool_call_id: tc.id,                           //    linked by tool_call_id
        name: tc.name,
        content: typeof result === 'string' ? result : JSON.stringify(result)
      }));
    }                                                  // 5. loop — the model sees results
  }
  return messages;
}
```

A successful run grows like: `Human → AI(tool_calls) → Tool → AI(tool_calls) → Tool → AI(final answer)`. The model can request several calls in one turn (parallel tool calls) — run them all before looping.

## Things to get right

- **`tool_call_id` must match.** Each `ToolMessage` answers exactly one tool call; the id links them. Skip it and the model loses track.
- **Cap the turns.** A `maxTurns` guard prevents a runaway loop if the model keeps calling tools.
- **Return useful results.** Return JSON the model can read; for read tools include just the fields it needs. Errors are fine to return as text — the model will react to them.
- **Purpose-built tools beat raw SQL.** Narrow tools (`find_customers`, `get_orders`) are safer and easier for the model than a free-form `run_sql`. Let the model do the arithmetic from the rows.
- **System prompt sets the rules.** State what data exists and tell the model to use the tools rather than invent — "never make up customers or numbers."

## When to reach for createAgent

This hand-written loop is the whole mechanism. Once you want retries, streaming, memory, human-in-the-loop, or branching, graduate to `createAgent` (LangChain) or build it as a graph in LangGraph — but it's the same loop underneath.

## Verify

- The conversation ends on an `AIMessage` with content and no `tool_calls`.
- Each `ToolMessage.tool_call_id` matches a `tool_call` id from the preceding `AIMessage`.
- The model's tool arguments respect your schema (enums are always in range).
