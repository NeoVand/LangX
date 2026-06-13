---
name: deepagents-hitl
description: Put a human in the loop for the actions an agent should never take unreviewed — gate any tool with interruptOn, surface the proposed call, and resume on one of the four decisions (approve / edit / reject / respond). Covers risk-tiering tools with allowedDecisions, the mandatory checkpointer, the start→resume host loop on a stable thread_id, batched simultaneous gates, PatchToolCallsMiddleware history repair, per-subagent overrides, and tools calling interrupt() directly. Worked example - the Greenhouse Automaton: a gardener agent proposes plant/water/prune/clear-pests actions, each gated; approve runs it, edit changes the bed or species, reject makes it adapt (pesticide rejected → remove by hand), respond answers its question. Use whenever a tool sends money, deletes data, posts publicly, or does anything irreversible.
---

# Human-in-the-loop (deep agents)

A pause, not a sterner prompt. For tools a model shouldn't fire unreviewed, the
right primitive is to halt the run, show a human the proposal, and continue only
on their decision — and `interruptOn` makes that a property of the harness.

## 1 · Gate by name, tier by risk

```ts
createDeepAgent({
  interruptOn: {
    water: true,                                   // all four verbs offered
    spray_pesticide: { allowedDecisions: ['approve', 'reject'] },  // no editing a dose
    ask_gardener:    { allowedDecisions: ['respond'] }             // a question → answer it
  },
  checkpointer   // REQUIRED — the pause lives in the saved state
});
```

`true` enables all four decisions; `{ allowedDecisions: [...] }` offers only the
verbs that make sense for that tool's risk; `false` (or omission) never gates.

## 2 · The four decisions — genuinely different

| verb | what happens |
| --- | --- |
| `approve` | run the tool with the agent's proposed arguments |
| `edit` | run it with MODIFIED arguments (`{ type: 'edit', args }` / official `editedAction`) |
| `reject` | don't run it; return your message — the agent reads it and ADAPTS |
| `respond` | for ask-user tools only: the tool never runs; your message is its result |

`respond` is for "ask the human" tools — never for side-effecting ones, or the
model may treat your reply as a successful execution. `reject` is the safe refusal
for an action tool: include a domain note ("we're organic — remove by hand") so
the agent knows what to do instead.

## 3 · The host loop

```ts
let res = await agent.start({ input });
while (res.status === 'interrupted') {
  const { tool, args, allowedDecisions } = res.interrupt;
  const decision = await askHuman(tool, args, allowedDecisions);
  res = await agent.resume(decision);   // Command({ resume }) on the SAME thread_id
}
```

- A **checkpointer is mandatory** — the interrupt and resume are two separate
  invocations; without saved state the run can't continue where it paused.
- **Same thread_id** on resume, always.
- Multiple gated calls in one model step **batch together**: one decision each,
  in `actionRequests` order. `PatchToolCallsMiddleware` (auto-added when
  `interruptOn` is set) repairs history if a run is cancelled mid-tool.

## 4 · Patterns

- **Tier by blast radius.** Reversible/cheap → don't gate, or allow all verbs.
  Irreversible/expensive → gate, and often restrict to `['approve']` or
  `['approve','reject']` so there's no fiddling, only a yes/no.
- **Reject is a teaching signal.** A good rejection message turns a refusal into
  a redirect; the agent adapts instead of looping.
- **Per-subagent override.** A subagent can set its own `interruptOn` (e.g. a
  file-manager that gates `delete_file` even though the parent doesn't).
- **Direct `interrupt()`.** A tool can call `interrupt()` itself to request
  approval inline and resume with the host's response value.

## 5 · Gotchas

- No checkpointer → no resume. This is the most common mistake.
- `respond` on a side-effecting tool is a foot-gun — reserve it for ask tools.
- Decision order must match the order the gated calls were proposed.
- Gating everything trains the human to rubber-stamp; gate the dangerous few.
