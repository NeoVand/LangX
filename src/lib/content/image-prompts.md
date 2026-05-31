# LangX — Image Prompt Catalog

## Pipeline

1. The user picks a prompt and runs it through their image model.
2. Save the resulting WEBP (or PNG) into `static/images/<id>.png` (preferred) or `static/heroes/<id>.webp`.
3. Components like `<HeroImage id="..." />` automatically pick the file up from `static/images/` first; if no file exists, a tinted placeholder shows instead so lessons never look broken.

**Chapter intro pages** use the `chapter-*-hero` banner IDs (`chapter-langchain-hero`, `chapter-langgraph-hero`, `chapter-deepagents-hero`). The `intro-*` IDs are alternate intro artwork variants.

---

## Style block (paste at the top of every prompt)

```
Editorial science magazine illustration, mid-century knowledge-graphic style.
Reduced palette: a single warm dominant (cream, ochre, faded gold) with one cool accent
(petrol blue, cobalt, slate) and ink-black linework. Restrained color, high contrast,
hand-drawn imperfections, no UI screenshots, no fake screenshots, no fake logos,
no readable code, no English text in the image, NO PHOTOREALISM, no 3D render,
no glow, no neon. Composition leaves negative space at the right third for typography
overlay. Texture: subtle paper grain, slight risograph misregistration. Aspect 16:9.
Mood: scholarly, calm, intellectually playful.
```

Optional add-ons used per chapter:
- **LangChain**: warm ochre + black + small petrol-blue accent (`#C57A3A` ish, `#1A1A1A`, `#1F4E5F`).
- **LangGraph**: faded olive + black + cobalt accent (`#A6A86C`, `#1A1A1A`, `#2A4F8F`).
- **Deep Agents**: oxblood + black + faded brass accent (`#7A2C2C`, `#1A1A1A`, `#A8884A`).

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

- **`l2-stategraph`** — StateGraph
  > A garden-maze plan view: nodes are gazebos connected by pathways, and a glass jar in the center is labeled "STATE" by glyph. A walker leaves footprints from gazebo to gazebo, occasionally returning to the jar. Olive tones, cobalt accent on the jar.

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
