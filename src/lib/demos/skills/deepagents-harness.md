---
name: deepagents-harness
description: Assemble a deep agent with createDeepAgent — the batteries-included agent harness from LangChain (npm deepagents; deepagents/browser for the browser). Covers the full option surface (model, systemPrompt, tools, subagents, skills, memory, backend, permissions, interruptOn, responseFormat, stateSchema, checkpointer, store), the fixed 13-layer middleware stack, the built-in tools (write_todos, ls/read_file/write_file/edit_file/glob/grep, task, execute, eval), USER→BASE→SUFFIX prompt assembly, and the verify-iterate work ethic of the base prompt. Worked example - the Toymaker: one factory call wires planning + virtual filesystem + designer/critic subagents + a real test tool + a publish approval gate, and a brief becomes a playable browser game. Use whenever you want a long-horizon agent that plans, works in files, delegates, self-verifies, and pauses for approval — without building any of that yourself.
---

# The deep-agent harness (`createDeepAgent`)

A deep agent = an ordinary tool-calling model + a **harness**: planning, a filesystem, subagents, context management, and human gates, bundled and pre-tuned. Deep Agents is LangChain's open-source harness — *"inspired by Claude Code: an attempt to identify what makes it general-purpose, and push that further."* The stack: LangGraph (runtime) → `createAgent` (minimal harness) → **Deep Agents** (opinionated harness).

```ts
import { createDeepAgent } from "deepagents"; // Node — or "deepagents/browser"
```

## When to use this

- Multi-step work that outlives one context window: build, research, refactor, organize.
- You want Claude-Code-like behavior (plan → files → delegate → verify → ask) on YOUR tools.
- You'd otherwise hand-wire todos, virtual FS, subagents, and summarization in LangGraph.

## Prerequisites

- Node 20+ (or a browser via `deepagents/browser`). `npm i deepagents @langchain/anthropic`

## 1 · One factory call

```ts
const agent = createDeepAgent({
  model: "anthropic:claude-sonnet-4-6",   // string or chat-model instance
  systemPrompt: "You are the Toymaker…",  // YOUR section of the prompt (see §3)
  tools: [testGame, publishGame],         // joins the built-ins
  subagents: [designer, critic],          // { name, description, systemPrompt, tools?, model? }
  interruptOn: { publish_game: true },    // HITL gate per tool
  checkpointer,                           // required for HITL pauses
});
const result = await agent.invoke({ messages: [new HumanMessage("Build this game: …")] });
```

The return value is a **compiled LangGraph graph** — stream it, checkpoint it, time-travel it like any other. Other options: `skills` (paths to SKILL.md directories), `memory` (AGENTS.md paths, always loaded), `backend` (where files live — state, disk, store, composite…), `permissions` (glob allow/deny per filesystem op), `responseFormat`, `stateSchema`, `contextSchema`, `store`.

## 2 · What the harness installs (built-ins)

- **Planning** — `write_todos`: the agent externalizes its plan and keeps statuses current.
- **Filesystem** — `ls`, `read_file`, `write_file`, `edit_file`, `glob`, `grep` against the configured backend (`read_file` is multimodal — images/PDF come back as content blocks).
- **Delegation** — `task(subagent_type, description)`: run a subagent in its own context; only its summary returns. Every agent also gets an automatic `general-purpose` subagent.
- **Context management** — summarization at ~85% of the model's input budget (keeps the most recent ~10%); tool outputs >20k tokens are offloaded to files with a 10-line preview.
- With the right extras: `execute` (shell backends/sandboxes) and `eval` (QuickJS code interpreter via `createCodeInterpreterMiddleware`).

Under the hood these are a **fixed middleware stack** (TodoList → Skills → Filesystem → SubAgent → Summarization → PatchToolCalls → … → Memory → HITL). Your custom middleware gets a reserved slot; ordering is deterministic on purpose.

## 3 · The prompt is assembled, not written

Composition order: **USER (your `systemPrompt`) → BASE → SUFFIX (per-model profile)** — your instructions outrank the harness's. The BASE prompt is a work ethic, not a persona: *"Don't say 'I'll now do X' — just do it"*, *"Your first attempt is rarely correct — iterate"*, *"Verify — check your work against what was asked, not against your own output."*

## 4 · Give the agent a real verify tool

The harness brings the discipline; you bring a way to CHECK the work. The Toymaker pattern — a tool that actually executes the build and reports failures:

```ts
const testGame = tool(async () => {
  const html = await backend.read("/game/index.html");
  return await probeInSandboxedIframe(html); // runtime errors? canvas present? → text report
}, { name: "test_game", description: "Run the build; report errors. Use after every change.", schema: z.object({}) });
```

With a verify tool in hand, the base prompt's "iterate until clean" actually has teeth — the agent writes, tests, reads the errors, edits, and tests again.

## 5 · The human gate

```ts
interruptOn: { publish_game: true }   // or { allowedDecisions: ["approve","edit","reject","respond"] }
// the run pauses INSIDE the graph; resume with a decisions array:
await agent.invoke(new Command({ resume: { decisions: [{ type: "approve" }] } }), config);
// "edit" replaces the tool args; "reject" blocks with a message; "respond" answers the agent instead of running the tool
```

## Gotchas

- **`systemPrompt`, not `instructions`** — and it lands BEFORE the base prompt, not instead of it.
- **HITL needs a checkpointer** — a pause is a saved state; resume is `Command({ resume: { decisions: [...] } })` (an array).
- **Custom subagents inherit almost nothing** (no tools, no skills, no prompt) — and a subagent's `tools` REPLACES the parent's list. Only the auto `general-purpose` subagent inherits.
- **The model never sees your UI** — anything you want it to act on (test results, critiques) must come back as a tool result or a file.
- **Don't fight the built-ins**: prompt the workflow ("test after every change"), not re-explanations of how `write_todos` works — the middleware already teaches each tool.
- Browser entrypoint (`deepagents/browser`) excludes Node-only backends (`FilesystemBackend`, `LocalShellBackend`); `StateBackend`/`StoreBackend` work everywhere.

## Verify

- One `createDeepAgent` call yields an agent that, from a one-line brief: writes todos, creates files, calls `task` at least once, runs your verify tool, fixes a reported failure, and pauses at the gated tool.
- After `resume` with `{ decisions: [{ type: "approve" }] }`, the run completes and the artifact exists in the backend.
- After `{ type: "reject", message }`, the agent receives the message as the tool result and adapts instead of crashing.
