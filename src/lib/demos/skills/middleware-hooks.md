---
name: langchain-middleware-hitl
description: Add middleware and lifecycle hooks to a LangChain v1 (TypeScript) createAgent, and gate a sensitive tool behind human approval with humanInTheLoopMiddleware. Use when an agent can take irreversible actions (spend money, send mail, delete data) and a person must approve, edit, or reject the call before it runs — or when you want to log, redact, retry, cap cost, or summarize around the loop without rewriting it.
---

# Middleware & hooks (with human-in-the-loop)

Middleware changes a `createAgent` loop's behavior **as configuration** instead of forking the loop: you pass a list of layers and the agent threads every model and tool call through them. Each middleware implements up to six **hooks**.

## When to use this

- An agent can do something irreversible (refund, email, delete, deploy) and you need a human to **approve / edit / reject** first.
- You want to log, redact PII, retry, fall back, cap cost, or compact history around the loop — without rewriting it.

## Prerequisites

- Node 20+, TypeScript.
- `npm i langchain @langchain/langgraph @langchain/core zod @langchain/anthropic` (swap the provider package).
- An API key, e.g. `ANTHROPIC_API_KEY`, on a model with solid tool-calling.

## The six hooks

| Hook | When | Use it to |
| --- | --- | --- |
| `beforeAgent(state)` | once, before the loop | seed state, load a profile/budget |
| `beforeModel(state)` | before each model call | validate; short-circuit with `jumpTo: 'end' \| 'tools' \| 'model'` |
| `wrapModelCall(request, handler)` | *around* the model call | retry, cache, swap model/tools/systemPrompt, fall back |
| `afterModel(state)` | after each model reply | log, count tokens, enforce policy |
| `wrapToolCall(request, handler)` | *around* each tool call | authorize, monitor, intercept, **pause for a human** |
| `afterAgent(state)` | once, after the loop | final logging, cleanup |

Node hooks (`before*`/`after*`) read state and return state updates (or nothing). Wrap hooks (`wrap*`) get a `handler` and decide whether/how to call it — they nest like onion layers (first middleware = outermost).

```ts
import { createMiddleware } from 'langchain';

// A custom middleware is just a name + the hooks you care about.
const logging = createMiddleware({
  name: 'logging',
  beforeModel: (state) => console.log('→ model,', state.messages.length, 'messages'),
  afterModel: (state) => console.log('← model,', state.messages.at(-1)?.content),
  wrapToolCall: async (request, handler) => {
    console.log('tool:', request.toolCall.name);
    return handler(request); // call through — or short-circuit and return your own result
  }
});
```

## Human-in-the-loop: a complete, runnable example

`humanInTheLoopMiddleware` gates named tools: when the model calls one, the run **interrupts** (its state held by a checkpointer) and waits for a decision. Below is a full script — paste it, set `ANTHROPIC_API_KEY`, and `npx tsx` it.

```ts
import { createAgent, humanInTheLoopMiddleware } from 'langchain';
import { MemorySaver, Command } from '@langchain/langgraph';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

const ORDERS: Record<string, { customer: string; item: string; total: number }> = {
  A1024: { customer: 'Maya Chen', item: 'Aurora Espresso Machine', total: 149 }
};

const lookupOrder = tool(
  async ({ order_id }) => JSON.stringify(ORDERS[order_id] ?? { error: 'not found' }),
  { name: 'lookup_order', description: 'Look up an order by id.', schema: z.object({ order_id: z.string() }) }
);

const issueRefund = tool(
  async ({ order_id, amount, reason }) =>
    `Refunded $${amount.toFixed(2)} for ${order_id} (${reason}). Email sent.`,
  {
    name: 'issue_refund',
    description: 'Issue a refund. Moves money and cannot be undone.',
    schema: z.object({ order_id: z.string(), amount: z.number(), reason: z.string() })
  }
);

const agent = createAgent({
  model: 'anthropic:claude-haiku-4-5',
  tools: [lookupOrder, issueRefund],
  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        issue_refund: { allowedDecisions: ['approve', 'edit', 'reject'] }, // gate the write
        lookup_order: false // reads are safe — auto-approve
      }
    })
  ],
  checkpointer: new MemorySaver() // REQUIRED: holds the paused state between turns
});

// Resume the SAME thread with one decision per pending action, in order.
const config = { configurable: { thread_id: 'support-1' } };

let result: any = await agent.invoke(
  { messages: [{ role: 'user', content: 'My order A1024 arrived with a cracked carafe — refund please.' }] },
  config
);

while (result.__interrupt__) {
  const { actionRequests } = result.__interrupt__[0].value;
  const decisions = actionRequests.map((action: { name: string; args: Record<string, unknown> }) => {
    console.log('PAUSED — agent wants:', action.name, action.args);
    // Pick one. (Wire these to your real UI / approval queue.)
    return { type: 'approve' as const };
    // return { type: 'edit', editedAction: { name: action.name, args: { ...action.args, amount: 50 } } };
    // return { type: 'reject', message: 'Policy: damaged items are replaced, not refunded.' };
  });
  result = await agent.invoke(new Command({ resume: { decisions } }), config); // same config!
}

console.log('FINAL:', result.messages.at(-1)?.content);
```

## The three decisions

```ts
type ReviewDecision =
  | { type: 'approve' }                                              // run the tool as proposed
  | { type: 'edit'; editedAction: { name: string; args: object } }  // run it with these args instead
  | { type: 'reject'; message?: string };                           // skip it; message goes back to the model
```

- **approve** — runs the tool unchanged.
- **edit** — runs the tool with `editedAction.args` (include the full args object, e.g. a smaller `amount` for a partial refund). Always pass `name` too.
- **reject** — the tool never runs; `message` becomes the tool result, so the model changes course (e.g. offers a replacement).

## Things to get right

- **Packages:** `createAgent`, `createMiddleware`, and the built-in middleware are in `langchain`. `MemorySaver` and `Command` are in `@langchain/langgraph`.
- **A checkpointer is mandatory** — no checkpointer, nowhere to hold the paused state, and resume fails.
- **Resume on the SAME `config`** (same `thread_id`) you invoked with.
- **`interruptOn` is an object**, not an array: `{ toolName: true | false | { allowedDecisions, description } }`. `true` = pause with all decisions; `false` = auto-approve.
- **`decisions` line up 1:1 with `actionRequests`**, in order. Loop until `result.__interrupt__` is gone (an interrupted result has `__interrupt__` *instead of* a final answer).
- **Tell the model to confirm the actual result.** After an `edit`, the model can otherwise echo the amount it originally requested. A line like "state the exact amount the refund tool reports" keeps the reply truthful.

## Running in the browser

`interrupt()` reads the run config from an async-context store. Node has it (`node:async_hooks`); browsers don't, and native `await` can't be intercepted — so the middleware's interrupt (which fires after an `await`) throws **"Called interrupt() outside the context of a graph"** in the browser. To run HITL client-side:

1. Install a synchronous async-context shim once at startup:
   ```ts
   import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons';
   class SyncALS { #s; getStore(){return this.#s} run(s,cb,...a){const p=this.#s;this.#s=s;try{return cb(...a)}finally{this.#s=p}} enterWith(s){this.#s=s} }
   AsyncLocalStorageProviderSingleton.initializeGlobalInstance(new SyncALS());
   ```
2. Wire the gate as an explicit graph whose `tools` node calls `interrupt()` **synchronously at the top** (before any `await`) — the shim only carries context through a node's synchronous prefix, which is all `interrupt()` needs. This is exactly what `humanInTheLoopMiddleware` compiles to; the LangX demo runs this version so the pause happens live in the browser.

In Node (e.g. this demo's downloadable project under `tsx`), the middleware version above works as-is — no shim needed.

## Other built-in middleware (all from `langchain`)

`summarizationMiddleware` (compact long history), `piiMiddleware` (redact/mask/block PII in or out), `modelFallbackMiddleware` + `toolRetryMiddleware` + `modelRetryMiddleware` (reliability), `modelCallLimitMiddleware` + `toolCallLimitMiddleware` (cost / loop guards), `llmToolSelectorMiddleware` (pre-filter a big toolbox), `contextEditingMiddleware` (clear stale tool output), `todoListMiddleware` (planning). A **Deep Agent** is `createAgent` plus a stack of these.

## Verify

- Asking for a refund pauses: `result.__interrupt__` is set and there's no final answer yet.
- **Approve** runs `issue_refund`; the final message confirms it.
- **Edit** changes what the tool receives (partial refund); **Reject** skips it and the model offers an alternative.
- Reads (`lookup_order`) never pause.
