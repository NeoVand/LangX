---
name: deepagents-permissions
description: Guard a deep agent's filesystem with declarative permission rules — { operations, paths, mode } evaluated first-match-wins in declaration order, default-allow when nothing matches, three verbs (allow, deny, interrupt — the third routes the operation to a human and checkpoints the whole run), closed-posture catch-alls, glob semantics (** crosses directories, * doesn't), readable refusals the agent can adapt to, and subagent inheritance (inherited; REPLACED if the subagent declares its own). Worked example - the New Hire: an intern agent works a real first-day task against a four-rule badge it was never shown — tidy writes land, the /secrets read bounces and the agent adapts, and the /config write pauses for human approval. Use whenever an agent must touch a filesystem it could damage, or whenever "please don't" needs to become "can't, without sign-off."
---

# Filesystem permissions (deep agents)

The security stance, verbatim from the docs: *"the agent can do anything its tools allow — enforce boundaries at the tool and sandbox level, not by expecting the model to self-police."* Prompts carry intent; rules carry physics.

## 1 · The rule shape

```ts
const permissions: FilesystemPermission[] = [
  { operations: ['read','write'], paths: ['/secrets/**'],           mode: 'deny'      },
  { operations: ['write'],        paths: ['/config/**'],            mode: 'interrupt' },
  { operations: ['write'],        paths: ['/docs/**', '/notes/**'], mode: 'allow'     },
  { operations: ['write'],        paths: ['**'],                    mode: 'deny'      }
];
```

- **First match wins, in declaration order.** A rule only matches if BOTH its operation and one of its globs match; otherwise evaluation falls through.
- **No match → allowed.** The default posture is open. End with `{ operations: ['write'], paths: ['**'], mode: 'deny' }` to flip it closed: nothing writes unless explicitly granted.
- Glob semantics: `**` crosses directory boundaries, `*` stays within one segment, `?` is one character.
- Reads are guardable too — a `deny` with `operations: ['read']` makes even `read_file` bounce (secrets, payroll, PII).

## 2 · The three verbs

| mode | what happens |
| --- | --- |
| `allow` | the operation simply runs |
| `deny` | the tool returns a readable error — *"Denied by rule […]"* — the agent sees it in the ToolMessage and can adapt |
| `interrupt` | the operation neither runs nor fails: the **whole run checkpoints** and waits for a human, exactly like a HITL tool gate |

Resume an interrupt with the standard decisions: `approve` (run it as proposed), `edit` (run with modified args), `reject` / `respond` (don't run it; the agent reads your message and continues). `interrupt` is the precision setting between "may edit config" and "may never edit config": the agent may *propose*, with the full content on the table.

## 3 · Design patterns

- **Closed posture for production:** specific denies → interrupt gates → specific allows → catch-all deny. Order top-down by how much you distrust the path.
- **Protect ground truth from the agent that's judged by it:** read-only test suites (an agent must not "fix" the spec), untouchable source datasets, ledger files writable only via deterministic tools (deny `write` on the file; mutate inside a tool that talks to the backend directly).
- **Don't tell the agent the rules — tell it refusals are normal.** Prompt line that works: *"A refused read or write returns an error — that is normal here. NEVER retry a refused path; note it, adapt, and move on."* Agents that expect refusals route around them gracefully; agents that don't will loop.
- **Errors must be readable.** The refusal message is model-facing UX: include the operation and the matched rule so the agent can reason about the boundary.

## 4 · Gotchas

- **Order is policy.** An `allow **` above your denies silences every rule below it — the most common way a badge dies. Audit by reading top to bottom and asking "what falls through?"
- **Subagents inherit the parent's permissions — but a subagent that declares `permissions` gets a full REPLACEMENT, not a merge** (same sharp edge as subagent `tools`).
- Permission rules guard the six filesystem tools. They do not contain `execute()` — shell access needs a sandbox backend, not globs.
- Browser/graph constraint: interrupt-mode gating must be decided synchronously before any tool executes (the same first-pass rule as HITL tool gates), so every sibling tool call still gets exactly one ToolMessage.
- Default-allow surprises people. If you remember one thing: **no rule matched means YES.**
