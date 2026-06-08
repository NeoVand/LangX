# LangX — Image Prompt Catalog

## Pipeline

1. The user picks a prompt and runs it through their image model.
2. Save the resulting WEBP (or PNG) into `static/images/<id>.png` (preferred) or `static/heroes/<id>.webp`.
3. Components like `<HeroImage id="..." />` automatically pick the file up from `static/images/` first; if no file exists, a tinted placeholder shows instead so lessons never look broken.

**Chapter intro pages** use the `chapter-*-hero` banner IDs (`chapter-langchain-hero`, `chapter-langgraph-hero`, `chapter-deepagents-hero`). The `intro-*` IDs are alternate intro artwork variants.

---

## Style block (paste at the top of every prompt)

The LangX house style is an **ornate Victorian steampunk knowledge plate** — the same
world as the `Naive RAG` diagram, the `Runnable Family` cabinet, the `Three Levels of
Streaming` and `Middleware & Hooks` posters, and `create-agent-anatomy`. NOT flat, NOT
mid-century, NOT text-free: these plates are richly rendered and they DO carry readable
engraved labels.

```
Ornate Victorian steampunk infographic plate, richly detailed and painterly with
dramatic chiaroscuro lighting. Everything is built from polished brass, bronze, and
aged copper machinery — riveted plates, interlocking gears, pressure gauges with real
needles, valves, levers, and segmented pipes — set against a deep near-black background
(or aged sepia parchment for full step-by-step process diagrams) with soft vignetting.
Warm tungsten key light; glowing accents in just two hues: cyan/teal glass vials, lenses
and displays, and warm amber/orange furnace light. Fine engraving and etched filigree,
faint blueprint linework in the dark margins, wisps of steam. An ornate engraved
brass-and-wood TITLE PLAQUE across the top, and each component sits on its own small
engraved nameplate — readable text on the plates is wanted (a title plus short labels),
set in a decorative serif. High detail, semi-photographic painterly render, gears in the
corners. Cohesive as one matched series of plates.
```

Per-chapter accent (brass always dominates; just shift the glow):
- **LangChain**: warm amber/gold glow with a little teal.
- **LangGraph**: cooler — favor cyan/cobalt glass over amber.
- **Deep Agents**: oxblood/leather tones with brass.

Two exceptions to the dark steampunk plate:
- **Chapter-intro heroes** (`chapter-*-hero`) use an antique cartographer's-MAP treatment
  (aged parchment, aerial map of nodes + paths, compass rose, minimal corner title).
- **Per-lesson hero banners** (`l1-*`, `l2-*`) are the steampunk style but stay (mostly)
  TEXT-FREE with a calmer lower third, because the lesson title is overlaid in HTML.

---

## Anchor prompts

### `landing-hero` — landing page banner (1600 × 900)

> A scholar's desk seen from above, mid-century editorial illustration. On the desk, three small, distinct mechanical models sit in a row: (1) a brass plumbing diagram of pipes joining and branching, (2) a graph of nodes and arrows etched into a paper map with two cycles, (3) an open ledger book with miniature drawers, ladders, and a tiny library on its pages. A green parrot perches on the spine of the ledger, head tilted in curiosity. Overhead, a hairline grid of constellations connects the three models. Heavy paper grain, soft warm spotlight, dominant cream background. Negative space top-right for the LangX wordmark.

### `chapter-langchain-hero` — Level 1 hero, TEXT-FREE, portrait 2:3

> A tall, dark, ornate steampunk still-life in warm brass, copper, and amber against near-black — the exact materials, lighting, and mood as the LangX home-hero mechanical parrot. The subject: a vertical column of intricate polished brass pipes, valves, pressure gauges, and dials that rise, branch apart, and recombine down the full height of the frame, with luminous amber fluid and a single teal stream visibly flowing through transparent glass sections of the piping — like data moving through a composable pipeline. Tiny pilot flames and glowing filaments light the metal from within. Deep chiaroscuro, a single warm key light from the upper right, rich shadows, fine mechanical detail, photographic with shallow depth of field. CRITICAL: absolutely no text, letters, numbers, words, or labels anywhere in the image. The machinery fills the top two-thirds; the bottom third stays darker, calmer, and less busy to leave room for a title overlaid in HTML; all edges gently vignette toward pure black. Portrait 2:3 aspect ratio (e.g. 1024 × 1536). Save as `static/images/chapter-langchain-hero.png`.

### `chapter-langgraph-hero` — Phase 2 banner (1600 × 900)

> A topographic map of an imaginary city, mid-century editorial illustration. Nodes are small temple-like structures connected by walking paths. Two cycles loop back through a central plaza. A river of cobalt cuts diagonally; bridges cross at marked checkpoints. Faded olive land tones, ink contour lines. A small footprint trail shows a recent walker pausing at one node. Negative space lower-right.

### `chapter-deepagents-hero` — Phase 3 banner (1600 × 900)

> A scholar's library at night, mid-century editorial cutaway. Three floors visible: ground floor a tiny workshop with planning notes pinned to a corkboard; middle floor a row of identical study carrels (subagents) each with a different colored lamp; top floor a single archive with locked cabinets labeled with hairline padlock icons. A green parrot supervises from the chandelier. Oxblood walls, brass fittings, candlelight glow. Negative space upper-left.

### `parrot-study` — about/setup mascot card (800 × 1000, portrait)

> Botanical-style study sheet of a green parrot, four poses around a central labeled diagram: standing on branch, mid-flight, head tilted, asleep on a rolled scroll. Hand-drawn ink lines, soft watercolor wash, cream paper, faded specimen labels in faux Latin (illegible loops, NOT readable). Restrained, scholarly. Aspect 4:5.

### `presentation-backdrop` — generic slide background (3840 × 2160)

> Very subtle paper texture with hairline grid faintly visible. A single ornamental flourish in the lower-right (faded brass, art-deco geometric). 95% empty space. Cream background. Aspect 16:9. Use as a near-empty backdrop; should never compete with overlaid type.

---

## Chapter intros

### `intro-langchain` — Phase 1 intro page (1600 × 900)

> Mid-century editorial illustration of a single brass pipe being assembled from labeled segments laid out on a workbench. Each segment is one component (prompt, model, parser, retriever) drawn as an ornamental fitting. A diagram in the corner shows them connected end-to-end. Warm ochre dominates, paper grain, hand-drawn line work.

### `intro-langgraph` — Phase 2 intro page (1600 × 900)

> A surveyor's plan view of a small fortified town, mid-century editorial. Walls form a graph of nodes; gates are conditional edges. A central well marked "state". Two routes loop through a marketplace and back. Faded olive, cobalt accent on the well, ink contours.

### `intro-deepagents` — Phase 3 intro page (1600 × 900)

> Cutaway of a Renaissance-era astronomer's observatory, mid-century editorial. Concentric ring shelves of books labeled with archetypes (PLAN, FILE, TASK, MEMORY) — labels stylized into glyphs only, no readable text. A central scholar at a desk delegates to three smaller scholars at side desks. Oxblood walls, brass instruments, candlelight.

---

## Per-lesson hero prompts

> Aspect 16:9, layered over the editorial style block above.

### Phase 1 — LangChain (chapter palette)

- **`l1-runnables`** — Runnables & LCEL
  > A factory line where small ornate brass machines pass an ochre-glowing object hand-to-hand. Each machine has a different shape (funnel, lens, bellows). Side panel shows the same chain folded into a single pipe. Restrained palette, mid-century illustration.

- **`l1-streaming`** — Streaming
  > A water clock dripping into a cascade of nested copper basins. Each basin emits a small puff of steam labeled with abstract glyphs (representing token / chunk / event). Warm ochre fluid, petrol blue steam highlights.

- **`l1-structured-output`** — Structured output
  > A printer's typecase tray (composing stick) with hand-set metal type arranged into a perfect rectangular form. A loose pile of unsorted glyphs sits at the side, with a hand placing them carefully into their compartments. Mid-century cutaway.

- **`l1-tools`** — Tools
  > A scholar at a desk reaching toward a wall of pegboard tools — a hammer, a magnifier, a pair of calipers, a tiny abacus, a spyglass. Each tool casts a labeled shadow with a hairline outline of its purpose. Editorial illustration.

- **`l1-rag`** — RAG
  > A library reading room shown in cutaway. A scholar consults three books open at once; thin dotted lines connect specific paragraphs to a single sentence being written on a fresh page. Index cards float between the books like small kites. Calm warm tones.

- **`l1-agent`** — create_agent
  > A small mechanical homunculus seated at a desk, deciding between a stack of tools laid out in front of it. Speech-bubble shapes (empty, no text) rise above its head. The desk has a clear "loop" engraved into its top — an arrow circling back. Mid-century editorial.

### Phase 2 — LangGraph (chapter palette)

- **`l2-overview`** — The whole graph (lesson hero, 16:9, steampunk, mostly TEXT-FREE)
  > A sprawling steampunk "graph runtime" engine spread across a wide near-black plate — a living brass network: many riveted nodes (some round portholes with glowing cyan glass, some boxy modules) wired together by a web of segmented copper pipes. The pipes BRANCH at brass three-way switch-valves with little levers (conditional edges). Two or three nodes are sealed glass domes that reveal a complete miniature brass graph nested inside them (subgraphs). A couple of nodes are tool-shaped — a brass wrench-engine, a magnifier-lens unit — tapped into the mesh (tools). A wave of warm amber furnace-light pulses along one diagonal band of pipes and nodes, lighting that band brightly while the rest sit in cool dim brass with faint cyan pilot-glows (a super-step rippling through the graph). Gears and a pressure gauge in the corners, soft steam wisps, dramatic chiaroscuro. Dense and alive across the upper two-thirds; the lower third stays darker and calmer for a title overlaid later. NO title text or large lettering anywhere (the lesson title is added in HTML); edges vignette to near-black. Wide banner, 16:9 (e.g. 1600 × 900). Save as `static/images/l2-overview.png`.

- **`langgraph-program-poster`** — "Powers of the Graph" specimen plate (portrait 2:3, titled)
  > An ornate steampunk specimen-cabinet poster in the exact style of the "Runnable Family" plate: a tall portrait brass frame with an engraved title plaque across the top reading **POWERS OF THE GRAPH**, and FIVE framed niches (arranged three over two) each holding a distinct brass instrument on its own engraved nameplate. (1) **STATE** — a tall brass reservoir with a sight-glass of glowing cyan fluid (shared memory). (2) **CONDITIONAL EDGE** — a brass railway-switch / Y-junction with a lever throwing the track one way. (3) **SEND · FAN-OUT** — a brass manifold splitting one pipe into many parallel outlets. (4) **INTERRUPT** — a gated valve with a raised lever and a small brass bell, mid-pause. (5) **CHECKPOINT** — a brass press stamping a disc beside a neat stack of saved medallions. Deep near-black ground, polished brass, cyan glass + warm amber glow, gears and filigree in the corners, dramatic chiaroscuro. Readable engraved labels on every nameplate. Portrait 2:3 (e.g. 1024 × 1536). Save as `static/images/langgraph-program-poster.png`.

- **`langgraph-superstep`** — "One Super-step" plate (landscape 16:9, titled)
  > An ornate steampunk plate, near-black background, with an engraved brass title plaque across the top reading **ONE SUPER-STEP**, telling one "tick" left to right. LEFT, on a nameplate **NODES RUN TOGETHER**: a row of identical brass worker-machines all firing at once — gauges spiking, gears spinning, cyan glass aglow — each emitting a small token of amber light. CENTER, on a nameplate **MERGE · REDUCERS**: their pipes pour down into a single large brass merging-manifold / funnel that combines the tokens into one engraved ledger. RIGHT, on a nameplate **CHECKPOINT**: a brass press stamps a numbered medallion beside a neat stack of saved discs. Behind the whole assembly sits a faint, dimmer identical copy with a curved brass arrow looping back into it (the next tick). Polished brass, cyan + amber glow, steam wisps, gears in the corners, dramatic chiaroscuro. Readable engraved nameplates. Landscape 16:9 (e.g. 1600 × 900). Save as `static/images/langgraph-superstep.png`.

> **These three must read as clean, legible LABELED FLOWCHARTS — the exact diagram
> clarity of the existing `create-agent-anatomy` and `react-loop-poster` plates
> (titled brass cartouche nodes + curved arrows carrying small engraved nameplate
> labels), NOT atmospheric machine still-lifes.** The layout IS the teaching: a few
> clearly-connected nodes, bold directional arrows with prominent arrowheads, and
> readable serif text. Keep them uncluttered. LangGraph palette = cyan/cobalt glow,
> brass everywhere, warm amber only as a small accent, near-black ground.

- **`l2-stategraph`** — StateGraph (lesson hero, 16:9, mostly TEXT-FREE)
  > A clean, legible steampunk FLOWCHART as one wide plate on a near-black ground — the same brass-and-cyan world and graph clarity as the `create-agent-anatomy` plate, NOT a cluttered machine. It shows the simplest possible graph: three rounded brass node-plaques wired in one tidy loop. A small START capsule at upper-left connects by a bold brass arrow into a square **AGENT** plaque (brass, with a small glass dome over a few gears); a clear directional arrow runs from AGENT to a **TOOLS** plaque (brass, with a little wrench-and-lens emblem); and a second curved arrow loops back from TOOLS to AGENT — one obvious cycle, the two arrows offset so their arrowheads never overlap. Beneath the plaques sits a tall glass reservoir glowing cyan (the shared STATE) with thin tap-lines rising to each node. All arrows are bold and clearly directional with prominent arrowheads. Cool cyan/cobalt glow dominates; warm amber pilot-flames as small accents; soft vignette; gears in the corners. Keep the composition simple and the lower third calmer and darker. NO title text or large lettering anywhere (the lesson title is overlaid in HTML); a couple of tiny engraved node labels are fine. Wide banner 16:9 (1600 × 900). Save as `static/images/l2-stategraph.png`.

- **`stategraph-anatomy`** — "Anatomy of a StateGraph" diagram (landscape 16:9, titled)
  > A clean steampunk INFOGRAPHIC in the exact legible labeled-flowchart style of `create-agent-anatomy` — brass cartouches and engraved nameplates on a near-black ground, readable serif text, NOT a cluttered machine. An engraved brass title plaque across the top reads **ANATOMY OF A STATEGRAPH**. Three clearly separated parts, left to right, each under its own engraved nameplate. (1) **NODES** — two rounded brass plaques labelled “node A” and “node B”, each a tidy box, with a small caption “do the work”. (2) **EDGES** — between/under them, a single BOLD brass arrow with a large clear arrowhead running from node A to node B, on a small nameplate reading “what runs next”. (3) **STATE** — a tall brass reservoir with a sight-glass of glowing cyan fluid, thin tap-pipes connecting up to both nodes, on a nameplate reading “shared memory · every node reads & writes”. Even, legible lighting so every label is sharp and readable; cyan glow, small warm amber accents, gears and filigree only in the far corners. Landscape 16:9 (1600 × 900). Save as `static/images/stategraph-anatomy.png`.

- **`stategraph-loop`** — "The Agent–Tools Loop" diagram (landscape 16:9, titled)
  > A clean steampunk FLOWCHART in the exact style and clarity of `create-agent-anatomy` (titled brass cartouche nodes, curved brass arrows, small engraved nameplate labels ON the arrows, readable serif text, near-black ground, NOT a cluttered machine) — but in the LangGraph cyan/cobalt palette. Engraved brass title plaque across the top: **THE AGENT–TOOLS LOOP**. Lay out FOUR connected nodes clearly: a small **START** capsule at the top; below it a large rounded brass plaque **AGENT** with a smaller subtitle line “calls the model” and a glass-dome-over-gears emblem; to AGENT’s right a large rounded brass plaque **TOOLS** with subtitle “runs tool calls” and a wrench-and-lens emblem; and a small **END** capsule below AGENT. Connect with BOLD, clearly directional brass arrows (large arrowheads) carrying small engraved nameplate labels: START → AGENT (unlabelled); AGENT → TOOLS along the TOP edge, labelled “tool call”; TOOLS → AGENT along the BOTTOM edge, labelled “result” — the two forming one clear loop, vertically OFFSET so their arrowheads never coincide; and AGENT → END labelled “done”. Where the flow leaves AGENT, show a small brass railway-switch lever (the conditional edge) visibly choosing between the loop and the exit. Cyan glass glow in the emblems, small warm amber pilot-flames, even legible lighting, gears only in the corners. Landscape 16:9 (1600 × 900). Save as `static/images/stategraph-loop.png`.

- **`l2-conditional-edges`** — Conditional edges & reducers
  > A railway switch viewed from above, with two parallel lines merging into one. Above the switch, a tiny clerk in a booth holds a ledger marked with abstract sigils. Side panel shows two streams pouring into a single beaker labeled with a merge symbol.

- **`l2-checkpointers`** — Checkpointers & time travel
  > A grandfather clock with its face open, gears visible. Each gear has a small dot on its rim — the dots align across positions like saved checkpoints. A hand turns one gear backward, lifting a transparent overlay of the prior state. Editorial illustration.

- **`l2-interrupts`** — Interrupts & HITL
  > A scholar pauses mid-stride on a path, raising one finger. From a side door, a human in formal dress steps out holding a sealed envelope. The path resumes after the exchange. Cobalt door, olive landscape.

- **`l2-streaming-modes`** — Streaming modes
  > A three-channel printing press, each channel emitting a different paper ribbon: one with full sheets stacked, one with just diff cards, one with continuous tape. A printer's apprentice compares the three side by side.

- **`l2-send-fanout`** — Send & fan-out
  > A central postmaster's desk fans out an arc of sealed envelopes to several waiting messengers. Each messenger's pouch is a different color. A return arc shows them coming back with answers, which are then bound into a single ledger.

- **`l2-subgraphs`** — Subgraphs
  > A nested set of architectural floor plans. The outer plan shows a building; one of its rooms zooms out into its own complete floor plan — recursively. Hand-drawn lines, soft graph paper grid, olive tones.

### Phase 3 — Deep Agents (chapter palette)

- **`l3-harness`** — The harness
  > An exploded diagram of a riding harness, but the straps are labeled (by glyph only) with PROMPT, MEMORY, FS, TASK, MIDDLEWARE. A small mechanical horse stands ready in the background. Oxblood leather tones, brass buckles.

- **`l3-virtual-fs`** — Virtual filesystem
  > A wall of small wooden file drawers, each labeled with abstract glyphs. A scholar with a brass key opens one drawer; inside is a single folded sheet with looping handwriting. Soft candlelight, oxblood drawers.

- **`l3-todos`** — Planning with write_todos
  > A clipboard with a checklist where each item is rendered as a small pictograph (no readable words). One item is checked, two are pending, one is crossed out. A pencil rests beside the clipboard.

- **`l3-backends`** — Backends
  > A two-room cutaway: the left room is a chalkboard ("State") wiped clean every cycle; the right room is a stone vault ("Store") with engraved rings. A small basket carries a single document between them.

- **`l3-permissions`** — Filesystem permissions
  > A row of small ornate doors set into a stone wall, each with a unique glyph and a tiny padlock symbol. A scholar with a ring of keys consults a written rulebook (illegible, glyphs only) before approaching one door.

- **`l3-subagents`** — Subagents
  > A central scholar gestures toward three smaller assistants seated at flanking desks, each working on a labeled task (by glyph). Dotted lines connect them back to the central desk. A separate "context bubble" hovers above each assistant, showing isolation.

- **`l3-skills`** — Skills (progressive disclosure)
  > A three-tiered apothecary cabinet. Top tier shows tiny labels only (just headers); middle tier shows each label expanded into one detail card; bottom tier shows a fully open book taken from the cabinet. The hand of a scholar reaches for the middle tier.

- **`l3-compaction`** — Context compaction
  > A series of letters being condensed in a printing press: stacks of long pages on the left, a single distilled summary card emerging on the right. A scholar reviews the summary against the originals.

- **`l3-hitl`** — Human-in-the-loop
  > A judge's bench where a small mechanical agent stands awaiting a stamp. The judge — a calm scholar — reads a brief, considers, and either lifts an "approve" stamp or a "deny" stamp from a pair lying on the bench.

- **`l3-capstone-research`** — Capstone — Deep Research
  > A grand reading room with three subagents at separate desks, each pulling from a stack of references. They send their findings via pneumatic tubes to a central editor's desk where a final report is being assembled. Soft candlelight, oxblood walls, brass tubes.

- **`l3-capstone-data-science`** — Capstone — Data Science
  > A scholar's lab with a row of glass beakers labeled by glyph (mean, median, count). A pneumatic chart-press converts beaker contents into a single etched plot pinned on the wall. A small caged sandbox in the corner contains a humming machine — labeled (by glyph) "SANDBOX".

- **`l3-beyond`** — Beyond V1
  > A horizon view: in the foreground, a finished workshop; in the middle distance, a half-built bridge; in the far distance, mountain peaks etched with the silhouettes of larger buildings. Indicates "what we built" → "what's next" → "production-grade peaks ahead". Editorial style, calm.
