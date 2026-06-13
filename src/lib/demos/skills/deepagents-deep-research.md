---
name: deepagents-deep-research
description: Build a deep-research agent on the Deep Agents harness — a research lead that decomposes a question into sub-questions, PAUSES for human approval of the plan (interruptOn), fans one subagent out per sub-question to research real sources in isolated context, and synthesizes a fully cited report. Covers the orchestrator-worker architecture, context quarantine via subagents, a shared numbered source registry so every claim is grounded, keyless CORS-clean source reach (the langchain-ai/docs repo behind docs.langchain.com, raw GitHub source/examples, Wikipedia for external concepts), honest degradation on CORS-blocked hosts, and compaction for long runs. Worked example - a research bureau answering questions about LangChain / LangGraph / Deep Agents with docs, code, and concepts researchers. Use to build any plan→approve→research→cite agent over a real corpus.
---

# Deep-research agent (deep agents)

The capstone pattern: one agent that plans, gets your sign-off, researches real
sources in parallel, and writes a report where every claim carries its citation.
It composes the whole harness — planning, subagents, HITL, the filesystem, and
context compaction — into a single, reusable product.

## 1 · Architecture — orchestrator + workers

```
question → [LEAD] plan (write_todos)
                  └─ present_plan ─⏸ HUMAN approves / comments → revise & re-present
                  └─ task × N  → [docs] [code] [concepts]  (parallel, isolated context)
                                     └ each writes cited notes to /research/qN.md
                  └─ read the notes + list_sources → write /report/report.md
```

The lead **delegates; it never researches itself.** That is the point: reading a
dozen pages into one window buries the goal (goal drift). Each subagent
**quarantines** its reading in a fresh context and returns only a tight, cited
summary, so the lead stays clear-headed enough to synthesize.

## 2 · The plan gate (human-in-the-loop)

A research run is expensive — gate the plan, not every fetch.

```ts
interruptOn: { present_plan: { allowedDecisions: ['approve', 'respond', 'reject'] } }
```

The lead calls `present_plan({ title, plan })`; the run checkpoints; the human
**approves**, or **responds** with comments and the lead revises and re-presents.
No research starts until approval. (Requires a checkpointer.)

## 3 · Source grounding — one numbered registry

Hand every read tool the SAME source registry. The first time a URL is read it
gets a stable number; every subagent and the final report cite it as `[S#]`. The
read tool returns the citation in-band: `"[S3] Title — url … cite as [S3]"`.
This is what makes the report auditable rather than merely plausible.

## 4 · Real, keyless, CORS-clean reach (no API key, no proxy)

| family | source | tool |
| --- | --- | --- |
| official docs | langchain-ai/docs (builds docs.langchain.com) via raw.githubusercontent.com | search_docs → read_doc |
| code & examples | langchain-ai repos via raw.githubusercontent.com | search_code → read_url |
| external concepts | en.wikipedia.org (`origin=*`) — Pregel, BSP, papers | search_web → read_wikipedia |

- A curated **index** of doc pages makes search instant and grounded; the content
  is fetched LIVE so it is never stale.
- `read_url` rewrites a `github.com/.../blob/...` URL to its raw form
  automatically, and **fails honestly** on CORS-blocked hosts so the agent routes
  around them instead of hallucinating.
- Swap this layer for Tavily / your own search and the rest is unchanged.

## 5 · The report — layout is code, prose is the model

The lead writes markdown: a one-paragraph direct answer, a section per
sub-question with inline `[S#]` citations on every claim, and a `## Sources`
bibliography from `list_sources`. The page renders it. Keeping layout out of the
model is what keeps the result reproducible.

## 6 · Patterns & gotchas

- **Lens routing.** Tag each sub-question docs / code / concepts and send it to
  the matching researcher; mixed-source questions get split.
- **Subagents inherit the parent's tools** by default — give the research tools to
  the lead and the researchers get them for free (custom subagents inherit no
  *skills*, though).
- **Compaction matters here.** Reads are large; give the lead a generous
  `maxTokens` and let eviction offload big tool results so synthesis doesn't churn.
- **Don't gate the fetches** — gate the plan. Gating every read trains the human to
  rubber-stamp.
- **Cite or omit.** Prompt the lead that every non-trivial claim needs an `[S#]`;
  a research agent's value is showing its work, not sounding confident.
