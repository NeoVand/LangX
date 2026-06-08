---
name: langgraph-graph-as-program
description: Build a LangGraph workflow that is a real program, not a chat loop — typed state with reducers, parallel Send fan-out, conditional edges that branch on state, an interrupt() human-approval gate, and checkpoint-based resume. Worked example: a fact-checker that audits a company blurb against live SEC EDGAR. Use when the loop isn't the right shape and you need branching, parallelism, pausing, or memory.
---

# LangGraph: a graph is a program, not a loop

`createAgent` gives you one fixed shape — model ⇄ tools. LangGraph is the runtime underneath it, exposed directly: you wire **nodes** (plain functions — some call a model, some are ordinary code) with **edges** (static or conditional) over a shared, typed **state**. That buys you the things a loop can't express: branching, parallel fan-out, pausing for a human, and resuming from a checkpoint.

This skill builds one end-to-end: **an EDGAR Statement Auditor** that fact-checks a paragraph about a public company against its live SEC filings.

```
START → resolve_company → extract_claims → Send ⇉ verify×N → triage
      → [contradictions?] → propose_edits → ⏸ human_gate → apply_edits → compose_report → END
      → [all clear]       → compose_report → END
```

## When to use LangGraph (vs createAgent / Deep Agents)

- **createAgent** — the loop IS the shape you want. Quick, ergonomic.
- **LangGraph** — you need explicit control flow: branches, loops with real exits, parallelism, human-in-the-loop, persistence, time-travel. (This skill.)
- **Deep Agents** — open-ended, long-horizon work bottlenecked by context discipline, not by the absence of a custom graph.

## Prerequisites

- Node 20+, TypeScript. `npm i @langchain/langgraph @langchain/core zod langchain @langchain/anthropic`
- A tool-calling model + key (e.g. `ANTHROPIC_API_KEY`) — the verify/extract nodes use `withStructuredOutput`.

## 1 · Typed state with reducers

State is the graph's shared memory. A **reducer** says how concurrent writes merge — critical for the parallel verifiers, which each append one verdict.

```ts
import { Annotation } from '@langchain/langgraph';

const AuditState = Annotation.Root({
  statement: Annotation<string>(),
  cik:       Annotation<string>(),
  company:   Annotation<CompanyFacts | null>({ reducer: (_, b) => b, default: () => null }),
  claims:    Annotation<Claim[]>({ reducer: (_, b) => b, default: () => [] }),
  // parallel writes MUST have a reducer, or the last writer wins:
  verdicts:  Annotation<Verdict[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  edits:     Annotation<Edit[]>({ reducer: (_, b) => b, default: () => [] }),
  decisions: Annotation<Decision[]>({ reducer: (_, b) => b, default: () => [] }),
  report:    Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
});
```

Nodes return **partial** updates — never mutate and return the whole state.

## 2 · The live ground truth (a code node)

A node is just a function. This one does no LLM work at all — it fetches live data. Only the EDGAR *submissions* endpoint is reachable from a browser (CORS-clean, no key); the XBRL number endpoints are not, so this stays in the identity + filing-history lane.

```ts
async function fetchCompanyFacts(cik: string): Promise<CompanyFacts> {
  const pad = cik.replace(/\D/g, '').padStart(10, '0');
  const res = await fetch(`https://data.sec.gov/submissions/CIK${pad}.json`);
  if (!res.ok) throw new Error(`EDGAR ${res.status}`);
  const j = await res.json();
  return {
    name: j.name, tickers: j.tickers, exchanges: j.exchanges,
    sicDescription: j.sicDescription, fiscalYearEnd: j.fiscalYearEnd,
    stateOfIncorporation: j.stateOfIncorporation,
    latest10K: j.filings.recent.filingDate[j.filings.recent.form.indexOf('10-K')],
    // …keep a compact `digest` string of these for the verifier
  };
}
```

## 3 · Parallel fan-out with Send

Return one `Send(node, input)` per item from a **conditional edge**. Each spawns an independent branch of `verify`; their writes merge through the `verdicts` reducer.

```ts
import { Send } from '@langchain/langgraph';

// node: one verdict per claim (some deterministic, some via the model)
const verify = async (s: { claim: Claim; digest: string }) => {
  if (s.claim.field === 'financial')
    return { verdicts: [{ ...s.claim, status: 'unverifiable', truth: '' }] };
  const v = await verifyModel.invoke(`Use ONLY these facts:\n${s.digest}\n\nClaim: "${s.claim.text}"`);
  return { verdicts: [{ id: s.claim.id, ...v }] };
};

builder.addConditionalEdges('extract_claims',
  (s) => s.claims.map((c) => new Send('verify', { claim: c, digest: s.digest })),
  ['verify']);
```

## 4 · Branch on state with a conditional edge

Routing is code, not a prompt. Read the merged state and return the next node's name.

```ts
builder.addEdge('verify', 'triage');
builder.addConditionalEdges('triage',
  (s) => s.verdicts.some((v) => v.status === 'contradicted') ? 'propose_edits' : 'compose_report',
  ['propose_edits', 'compose_report']);
```

## 5 · Pause for a human with interrupt()

`interrupt(payload)` stops the run, checkpoints it, and surfaces the payload. Resuming with `Command({ resume })` returns that resume value from `interrupt`. Call it at the **top** of the node (before any await) so the run context is intact.

```ts
import { interrupt } from '@langchain/langgraph';

const human_gate = (s) => {
  const { decisions } = interrupt({ type: 'review_edits', edits: s.edits });
  return { decisions };
};
```

> Browser note: `interrupt()` reads an AsyncLocalStorage that doesn't exist in browsers. In a static web app, install a synchronous shim and call `interrupt()` synchronously at node entry. In Node it just works.

## 6 · Compile with a checkpointer, run, and resume

A checkpointer saves state every super-step — that's what makes the pause/resume (and time-travel) possible. Keep the same `thread_id` across the pause.

```ts
import { StateGraph, MemorySaver, Command, START, END } from '@langchain/langgraph';

const graph = builder
  .addEdge(START, 'resolve_company')
  .addEdge('resolve_company', 'extract_claims')
  .addEdge('propose_edits', 'human_gate')
  .addEdge('human_gate', 'apply_edits')
  .addEdge('apply_edits', 'compose_report')
  .addEdge('compose_report', END)
  .compile({ checkpointer: new MemorySaver() });

const config = { configurable: { thread_id: 'audit-1' } };

// 1) run until it pauses
let state = await graph.invoke({ statement, cik: '0000320193' }, config);
if (state.__interrupt__) {
  const edits = state.__interrupt__[0].value.edits;
  const decisions = edits.map((e) => ({ id: e.id, action: 'accept' })); // or reject/edit
  // 2) resume from the checkpoint with the human's decisions
  state = await graph.invoke(new Command({ resume: { decisions } }), config);
}
console.log(state.report);
```

To drive a live UI, swap `invoke` for `graph.stream(input, { ...config, streamMode: 'updates' })` — each chunk is one node firing; the interrupt arrives as a `{ __interrupt__: [...] }` chunk.

## Gotchas

- **Forgot a reducer on a list** written by parallel branches → last write wins, results vanish. Add `(a, b) => [...a, ...b]`.
- **`interrupt()` after an await** in the browser → "called outside the context of a graph." Call it first.
- **Static edge + `Command(goto)`** both fire — don't mix them unless you mean to.
- **Route to a node that exists** — conditional-edge return values must be real node names (add the node first).
- **Resume needs the same `thread_id`** and the same checkpointer, or it starts fresh.

## The payoff

Five primitives — typed state + reducers, conditional edges, Send fan-out, interrupts, checkpoints — turn an opaque model call into an inspectable, resumable, branchable program. These are exactly what Deep Agents (planning, delegation, memory, steering) is assembled from.
