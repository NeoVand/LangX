---
name: deepagents-skills
description: Give a deep agent expertise without spending standing context — skills as backend directories (SKILL.md frontmatter + body, scripts/, references/, assets/) following the Agent Skills standard, three-level progressive disclosure (catalog line → manual via read_file → resources on demand), keyword-rich descriptions as activation triggers, deterministic scripts instead of improvised math, and the inheritance/override rules. Worked example - the Support Desk: one refund question to three identical agents (no skills / everything crammed into the prompt / a five-line catalog); the skilled one reads exactly one manual, runs its prorate script, and passes a deterministic inspector at a fraction of the crammed clerk's per-round token rent. Use whenever an agent must follow procedures too numerous or too long to keep in the prompt.
---

# Skills (deep agents)

The wardrobe principle: an agent's behavior is its context, but procedure does not
have to LIVE there. A skill is knowledge stored on the filesystem, advertised by one
line, loaded only when the task matches.

## 1 · The shape (Agent Skills standard)

```
/skills/refund-policy/SKILL.md             ← frontmatter + the procedure
/skills/refund-policy/scripts/prorate.js   ← deterministic helpers
/skills/refund-policy/references/…         ← detail too bulky for the manual
/skills/refund-policy/assets/…             ← templates the agent uses, not reads
```

```ts
createDeepAgent({ model, backend, skills: ['/skills/'] }); // paths, not objects
```

Frontmatter rules: `name` ≤64 chars and **must exactly match the directory name**
(mismatches are silently skipped); `description` ≤1024 chars. Keep the body <~5k
tokens; reference supporting files **one level deep** from SKILL.md.

## 2 · Progressive disclosure — three levels

| level | what | cost |
| --- | --- | --- |
| 1 catalog | `{name, description}` injected into the system prompt | a line per skill, every round |
| 2 manual | the agent `read_file`s SKILL.md when a task matches | body tokens, once, in conversation |
| 3 resources | scripts/references/assets, as the manual directs | only what's actually used |

**There is no `load_skill` tool.** The filesystem is the disclosure mechanism —
which is why skills compose with backends (a store-backed `/skills/` route survives
threads), permissions (`deny`/`interrupt` writes on `/skills/**` for a curated
shelf), and even self-extension (an agent can WRITE a skill mid-run; the catalog
rescan picks it up next round — the skill-creator pattern).

## 3 · Descriptions are activation triggers

The agent opens a manual based on the catalog line alone. Write what the skill does
AND when to use it, with the keywords a real task would contain: "Use whenever a
customer asks to cancel, requests a refund, or asks how much money comes back"
beats "Helps with refunds". Overlapping descriptions = the model opens none, or all.

## 4 · Scripts: don't improvise math

Deterministic logic (money, dates, checksums, format linting) goes in `scripts/`,
and the manual's instruction is "run it, quote its numbers". Officially scripts
execute in sandbox backends, or as interpreter skills (`metadata.entrypoint:
scripts/index.ts` → `await import("@/skills/<name>")` inside QuickJS `eval`).
A model asked to prorate a refund WILL produce a confident wrong number — the
worked example's bare clerk invents one to the cent.

## 5 · The three-wardrobe comparison (when to choose what)

- **No skills**: fine when the model's general knowledge suffices. Fails silently —
  and confidently — the moment company-specific procedure matters.
- **Everything in the prompt**: works, and is right for 1–2 short, always-relevant
  procedures. The cost is RENT: every procedure, every round, forever — and it
  crowds out the conversation as the shelf grows.
- **Skills**: a few hundred tokens of catalog, manuals on demand. The default once
  procedures number more than a couple or exceed a few hundred tokens each.

## 6 · Gotchas

- Frontmatter `name` ≠ directory name → the skill silently never appears.
- Custom subagents inherit NO skills — each needs its own `skills` list; only the
  auto general-purpose subagent gets the parent's.
- Same skill name from two sources: **last source wins** (deliberate override path).
- Bodies >10 MB are skipped; bodies >~5k tokens defeat the point — split into
  references.
- The description is part of your prompt budget: five skills ≈ a few hundred tokens.
  Worth it at five; audit it at fifty.
