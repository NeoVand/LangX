# LangX — Diagram Prompt Catalog (GPT-image)

These prompts are for **explanatory concept diagrams**, not banner art. They are square or
portrait so the constituents stay large in the top-to-bottom reading column (the same constraint
that drives the in-app SVG diagrams). Generate them with the OpenAI GPT image model and drop the
WEBP into `static/diagrams/<id>.webp`.

> The app already ships hand-built **animated SVG diagrams** for every lesson (see
> `src/lib/diagrams/`). Use these generated plates where you want a richer, illustrated "big
> picture" that an SVG can't match — chapter openers, the landing page, slide backdrops. For
> step-by-step mechanics, prefer the live SVG (it is crisp, themeable, and animated).

---

## How to use

1. Pick a prompt, paste the **style block** + the **per-diagram block**.
2. Generate at the stated size (square `1024×1024`, portrait `1024×1280`).
3. Save to `static/diagrams/<id>.webp`.
4. A `<DiagramImage id="…" />` placeholder shows a tinted frame until the file exists, so nothing
   ever looks broken.

---

## Style block (paste at the top of every prompt)

```
A clean, modern explanatory DIAGRAM in a refined editorial-infographic style — think a science
museum wall panel crossed with a Swiss knowledge graphic. Flat vector shapes with crisp 1.5px
strokes, generous negative space, soft long shadows for gentle depth, rounded rectangles and
circles as the building blocks, thin directional arrows showing flow. Restrained palette: a deep
near-black background (#101012), warm off-white nodes, hairline neutral strokes, and ONE chapter
accent color used sparingly to mark the most important element. Subtle dotted connector lines for
secondary relationships. NO photorealism, no 3D render, no glossy glow, no neon. Composition is
balanced and centered, comfortable margins on all sides, nothing cropped or touching the edge.
Minimal or NO text — use small abstract glyph icons instead of words (the app overlays its own
labels). Calm, scholarly, precise. High legibility at small sizes.
```

Accent per chapter (use ONLY this one accent in the diagram):

- **LangChain** — warm gold / ochre `#C9A24B`
- **LangGraph** — cobalt / petrol blue `#3E6DB5`
- **Deep Agents** — muted violet / brass `#9B6FC9`

Default size: **square 1024 × 1024**, unless a prompt says portrait.

---

## Chapter big-picture plates (square 1024 × 1024)

### `overview-langchain` — Compose primitives into apps

> Centered composition. On the left, three small rounded-rectangle "primitive" cards stacked
> vertically inside a faint dashed container — each marked with a different abstract glyph (a
> speech bubble, a microchip, a funnel). Thin dotted lines lead from all three into a single
> highlighted gold node in the center marked with a chain-link glyph. From the center node two
> solid arrows fan out to the right to two destination cards: one marked with a small robot glyph,
> one marked with a magnifier glyph. The gold accent appears only on the central composing node.
> Conveys "small parts → composed chain → finished apps." Editorial-infographic style.

### `overview-langgraph` — State flowing through a graph (portrait 1024 × 1280)

> A small directed graph read top-to-bottom. A start marker at the top (triangle glyph) flows down
> into a diamond-ish router node (a forking-branch glyph) rendered in dashed outline. The router
> splits with two dotted arrows to a left node and a right node (both plain rounded cards with a
> cube glyph). Both side nodes connect down into a central muted cylinder marked with a database
> glyph labeled conceptually as "shared state". From the cylinder, one solid cobalt arrow flows
> down to an end marker (flag glyph). The cobalt accent marks only the shared-state path. Clean,
> branch-and-converge structure, lots of breathing room.

### `overview-deepagents` — An agent loop wrapped in capabilities

> A hub-and-spoke layout. A single prominent violet-accented circle/rounded-square in the dead
> center marked with a robot glyph ("agent loop"). Four satellite cards arranged around it (top,
> left, right, bottom), each a neutral rounded card with one glyph: a checklist (planning), a
> folder (filesystem), a sparkle (skills), stacked layers (subagents). Thin dotted connectors join
> each satellite to the hub. Only the central hub uses the violet accent. Symmetric, calm,
> orbital. Conveys "the model loop is surrounded by middleware capabilities."

---

## Phase 1 — LangChain (gold accent)

### `dgm-runnables` — LCEL pipe (portrait 1024 × 1280)

> A vertical pipeline of five rounded cards connected top-to-bottom by short arrows, each card a
> single glyph: an input triangle, a speech bubble (prompt), a microchip (model, gold-accented),
> a funnel (parser), an output flag. Small "droplet" tokens sit on the connectors to suggest a
> value flowing downward. Only the model card uses the gold accent.

### `dgm-tools` — Model choosing tools

> A central model card (microchip glyph, gold) with thin dotted lines reaching out to a small
> pegboard of distinct tool glyphs around it: a wrench, a tiny calculator grid, a cloud (weather),
> a magnifier. One tool is highlighted as "selected" with a solid line back to the model. Conveys
> "the model picks a tool, gets a result back."

### `dgm-rag` — Retrieve then generate (portrait 1024 × 1280)

> Top: a query card (speech-bubble glyph). An arrow down to a retrieval node (magnifier glyph,
> gold). To its side, a muted cylinder (database glyph) sends a dotted "index" line into the
> retrieval node. From retrieval, an arrow carries three small "chunk" rectangles down into a
> model card (microchip), then a final arrow to an answer card (flag). Grounded-answer flow.

### `dgm-agent` — The ReAct loop

> A compact cycle. A start triangle flows into an "agent" card (robot glyph, gold). A downward
> arrow labeled by a wrench glyph leads to a "tools" card; a curved return arrow loops back up to
> the agent (the loop is the hero of the image). A separate arrow exits the agent to an end flag
> marked "done". Emphasize the circular nature of the loop.

---

## Phase 2 — LangGraph (cobalt accent)

### `dgm-stategraph` — Nodes over shared state (portrait 1024 × 1280)

> A vertical spine: start triangle → node A (cube) → node B (cube) → end flag, the two nodes
> wrapped in a faint dashed "graph" container. To the right, a cylinder (database glyph, the shared
> state) receives dotted lines from both nodes. Cobalt accent on the two nodes only.

### `dgm-conditional-edges` — Router fan-out

> A single router node on the left (forking-branch glyph, cobalt) with three dotted arrows fanning
> out to the right to three stacked destination cards (each a plain cube glyph). Conveys "one
> function chooses which node runs next."

### `dgm-checkpointers` — Snapshots per step

> Three step cards stacked vertically on the left (cube glyphs, cobalt), each connected by a short
> arrow to the next. To the right, a single clock/disk node receives a dotted "snapshot" line from
> every step. Conveys "state is saved after each step, keyed by thread."

### `dgm-interrupts` — Pause, ask, resume

> A vertical flow: a running node (microchip) → a pause node (two-bar pause glyph, marked as a
> stop) → a side human figure card (dotted "ask" line) → a resume node (play triangle, cobalt)
> that continues downward. Conveys a graph pausing for a human and continuing.

### `dgm-send-fanout` — Map / fan-in

> A "map" node on the left (paper-plane glyph, cobalt) with three dotted "Send" arrows to three
> worker cards in the middle column (cube glyphs); three solid arrows converge from the workers
> into a single "reduce" node on the right (merge glyph). Symmetric fan-out then fan-in.

### `dgm-subgraphs` — A graph as a node (portrait 1024 × 1280)

> A vertical flow: start → parent node → a node drawn as a small nested mini-graph inside a dashed
> "subgraph" frame (cobalt) → end. Conveys recursion: a compiled graph dropped in as one node.

---

## Phase 3 — Deep Agents (violet accent)

### `dgm-harness` — Layered system prompt (portrait 1024 × 1280)

> Three wide horizontal bands stacked and wrapped in a dashed "assembled prompt" frame: BASE
> (book glyph, muted), MIDDLEWARE (stacked-layers glyph, violet — the hero), USER (person glyph).
> Short downward arrows show them merging into one. Conveys "three sources, one prompt."

### `dgm-virtual-fs` — A filesystem the agent edits

> A folder/tree of small file cards on the left; an agent card (robot glyph, violet) on the right
> with read/edit arrows to specific files. One file shows a small before/after split to suggest a
> diff. Conveys "the agent works against a virtual filesystem."

### `dgm-todos` — A living plan

> A clipboard card containing four checklist rows rendered as pictographs only: one checked
> (done), one with a half-fill (in progress, violet), two empty (pending). Conveys task state
> transitions, not words.

### `dgm-backends` — Composite routing

> A file-tools node on the left (folder glyph, violet) → a central router (forking-branch glyph,
> dashed) → two destinations on the right: a wiped-chalkboard node (ephemeral state) and an
> engraved-vault cylinder (durable store). Dotted lines labeled by glyphs for two path prefixes.

### `dgm-permissions` — Gated tools

> A row of small doors set in a wall, each with a distinct glyph and a tiny padlock; an agent
> figure consulting a small rulebook before approaching one door (violet highlight on the gate
> being checked). Conveys allow / ask / deny.

### `dgm-subagents` — Isolated delegation

> A parent agent card on the left (robot glyph, violet) → a "task()" connector (paper-plane glyph,
> dashed) → a subagent card inside a dashed "isolated context" frame on the right; a single return
> arrow brings back one small report card. Conveys "spawn isolated worker, get only a summary."

### `dgm-skills` — Progressive disclosure (portrait 1024 × 1280)

> Three stacked wide cards: top shows a list of tiny labels only (names + one-line descriptions,
> as abstract ticks); middle a "load_skill" connector (sparkle glyph, violet); bottom a fully open
> book card (the full skill body) revealed on demand. Conveys "only names ship; bodies load later."

### `dgm-compaction` — Shrinking context

> On the left a tall stack of many small message rectangles marked "over budget"; two branches in
> the middle — a scissors glyph (evict) and a book glyph (summarize) — feeding a single small,
> tidy card on the right marked "under budget" (violet). Conveys compressing a long history.

### `dgm-hitl` — Human approval

> A small agent figure presenting a brief at a judge's-bench card; a calm human figure beside two
> stamps — an "approve" check and a "deny" cross. The approve stamp is violet-highlighted.
> Conveys a human gate in the loop.

### `dgm-capstone-research` — Parallel research → one brief

> Three subagent cards across the top each pulling from a small stack of reference cards; thin
> arrows route their findings down into a central editor node assembling one report card at the
> bottom (violet). Conveys parallel research fanning into a single synthesized brief.

### `dgm-capstone-data-science` — Analyze → chart → report

> A dataset cylinder → a sandboxed "code" node (bracketed-box glyph, violet, inside a dashed
> "sandbox" frame) → a small chart card (tiny bar/line glyph) → a final report card. Conveys
> "the agent writes code in a sandbox, produces a chart, and reports."
