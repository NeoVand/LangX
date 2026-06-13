---
name: deepagents-compaction
description: Keep a long-horizon agent coherent when its context window fills — the four-tier compaction pipeline (evict oversized tool results to files, trim repeated arguments, summarize the older middle turns, raise on overflow), the official numbers (summarization at ~85% of max_input_tokens, ~10% recent preserved, ~20k-token tool-output offload threshold, 170k/keep-6 fallback), structured summaries (session intent · artifacts · next steps), the needle-in-a-haystack faithfulness test, and how compaction rides the filesystem so nothing is lost. Worked example - the Incident Room: an SRE agent reads several huge logs (each evicted to disk) to find a 503 root cause; the early brief (scope + a 14:00 deadline) summarizes out of the window but must survive to the final report. Use whenever an agent reads large tool outputs, runs many turns, or must remember an early constraint after the context has churned.
---

# Context compaction (deep agents)

The window is finite; useful runs aren't. Compaction keeps the *relevant* past
available without paying for the whole transcript — and the key idea is that
nothing is deleted, it's **relocated to the filesystem**.

## 1 · The principle: don't drop the oldest, relocate it

Naïve "evict the oldest messages" causes **goal drift**: the opening
instructions scroll out, and the agent substitutes a goal that fits what it can
still see. Good compaction always keeps three things — the system prompt, the
most recent exchanges, and a faithful summary of the middle — and pushes the raw
material onto disk, still retrievable.

## 2 · The four tiers (cheapest first, before each model call)

| tier | what | where the bulk goes |
| --- | --- | --- |
| 1 · evict (offload) | tool result over the size threshold → path + preview | `/large_tool_results/<id>.txt` |
| 2 · trim args | repeated tool argument → `<as before>` | (nothing; just shrinks) |
| 3 · summarize | older middle turns → one structured summary card | `/conversation_history/<ts>.md` |
| 4 · overflow | still too big → **raise**, never silently truncate | — |

## 3 · The official numbers (match these in production)

- **Summarization** fires at **~85% of the model's `max_input_tokens`** and
  preserves roughly the most recent **10%**. No model profile? Fallback is a
  **170,000-token** trigger, keep the last **6 messages**.
- The summary is **structured**: *session intent · artifacts created · next
  steps* — keeping the intent is what prevents goal drift.
- **Tool-output offloading** kicks in around **20,000 tokens**: the output is
  written to the backend and replaced by a file path + the **first 10 lines**.
- Tool **inputs** (e.g. a giant `write_file`) get pointer-replaced as the window
  nears 85%. **Images are preserved** in the replacement message, not compressed.
- On a `ContextOverflowError`, the agent falls back to summarize-and-retry.

## 4 · The needle-in-a-haystack test

Prove compaction is faithful: plant a small critical fact early, bury it under
context, force compaction, then check the agent can still act on it — from the
summary card or by reading `/conversation_history/`. In the Incident Room the
needle is the brief's scope ("api-gateway only") and the 14:00 rollback
deadline; the haystack is the logs; the proof is whether the final report still
honors both.

## 5 · Design patterns

- **Write findings down (recitation onto disk).** Don't trust a fact to stay in
  context — append it to `/notes/findings.md` as you go. Survives any tier.
- **Let big reads be big.** Don't pre-truncate tool outputs by hand; eviction is
  built for exactly this and keeps the full text one `read_file` away.
- **Tell the agent refusals/evictions are normal.** Prompt line that works: "a
  result that says it was evicted to /large_tool_results/… is normal; read_file
  the path if you need the detail again."
- **Memory (AGENTS.md) is the opposite of a skill:** always loaded, no
  progressive disclosure — use it only for facts every turn truly needs.

## 6 · Gotchas

- Summarization that drops the task-critical constraint *is* goal drift — judge
  summaries by whether intent survives, not by length.
- Never split a tool_calls / ToolMessage pair across the summary boundary, or the
  next request 400s (orphaned tool result). Move the boundary earlier instead.
- Overflow should raise, not silently drop the system prompt — a quiet truncation
  that erases who the agent is looks like success and isn't.
- Compaction thresholds are about the model's window, not a fixed number; a
  bigger model compacts later for the same transcript.
