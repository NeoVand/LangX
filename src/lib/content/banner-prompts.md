# Lesson banner prompts — consistency pass

Prompts to regenerate the banners that fell short of the house style. Every banner
follows the **gold-standard** set (`l1-model`, `l3-compaction`, `l3-capstone-research`):

- **4:3 landscape** aspect ratio (e.g. 2048 × 1536).
- A continuous **ornate brass frame** around the whole image, with engraved corner
  cartouches, scrollwork and small brass studs (antique certificate / book-plate look).
- A **title plaque** at the top centre (ornate brass cartouche, large engraved serif
  small-caps, warm cream) bearing the **lesson name**, and directly beneath it a smaller
  **brass ribbon** bearing the **subtitle** `LEVEL N · CHAPTER` (small engraved caps,
  middot separator). The text is the only lettering and must be spelled exactly.
- Warm Victorian-steampunk: aged brass + burnished gold, near-black warm ground
  (#0a0805 → #16110b), lit from within by glow. Accent colour per chapter —
  **L1 amber-gold**, **L2 teal-cyan**, **L3 violet**.

The scenes are kept from the existing images (the content is good); only the format,
frame, palette warmth and title/subtitle are brought into line. These are **banners**,
not posters — do not confuse with `model-image-prompts.md`.

Each block below is a complete, copy-paste-able prompt.

---

## 1 · `lc-overview-hero` — Level 1, Lesson 1 (a new image; today it's a placeholder)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold are the hero metal, lit from within by a soft golden glow on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly volumetric light, with a faint cool-cyan data shimmer as the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges like an antique certificate. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "THE WHOLE PICTURE" in large engraved serif small-caps in warm cream, crisp and perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · LANGCHAIN" in smaller engraved small-caps. Spell all lettering EXACTLY as written; no other text anywhere. SCENE (filling the area below the plaques): one magnificent brass "chatbot engine" assembled from clearly distinct modular parts, all wired together into a single working loop by fine brass chain-links and pipes (a nod to LangChain). At its heart a glowing conversational core — a brass speaking-mask orb radiating warm light. Feeding into it: a tall coiled spool of engraved message-cards that loops back on itself (conversation memory); a document hopper stacked with pages, a magnifying lens drawing a few cards forward (retrieval / RAG); and a brass camera-lens plate showing a faint engraved picture (a multimodal image input). A single bright answer-spark rises from the core. Warm gold glow throughout, a faint cyan shimmer on the lens and the document cards. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 2 · `l1-streaming` — Level 1, Lesson 4 (replaces a 16:9, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold are the hero metal, lit from within on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, with cool blue-cyan as the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the word "STREAMING" in large engraved serif small-caps in warm cream, crisp and perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · LANGCHAIN" in smaller engraved small-caps. Spell all lettering EXACTLY as written; no other text anywhere. SCENE (filling the area below the plaques): a tall brass water-clock. From an hourglass reservoir near the top, a continuous stream of glowing golden liquid cascades down a descending staircase of tilted brass basins, spilling from basin to basin in luminous ribbons — tokens arriving one after another. Small glowing cyan glyph-tokens (an approximation sign, a snowflake, little geometric marks) drift upward in wisps of steam beside the cascade. Brass pipes, valves, pressure gauges and rivets frame the apparatus. Warm gold on near-black with cool-blue token accents. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 3 · `l2-overview` — Level 2, Lesson 1 (replaces a 16:9, frameless, too-dark image — same content, warmer)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold are the hero metal, lit from within on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, with teal-cyan as the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "THE WHOLE GRAPH" in large engraved serif small-caps in warm cream, crisp and perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 2 · LANGGRAPH" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): one flowing brass "graph" laid out across a warm brass backplate — every primitive visible at once as round brass node-plates wired together by burnished brass pipes that branch and rejoin into a single readable network. Engrave a small brass name-plate on each node: a "START" valve at one corner; several "LLM" lens-nodes with glowing teal cores; a "HUMAN IN THE LOOP" node (a small porthole with a figure at a lever); a "WEB SEARCH" node showing a glowing globe; a "STORAGE" reservoir of stacked discs; and an "END" node at the far corner. IMPORTANT: keep the node-plates and panels WARM and well-lit in brass and gold — not murky or dark; let teal-cyan glow live only inside the lenses and along the connecting lines. Spell the node labels exactly: START, LLM, HUMAN IN THE LOOP, WEB SEARCH, STORAGE, END. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 4 · `l2-stategraph` — Level 2, Lesson 2 / global #11 (replaces a 16:9, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Render in aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, teal-cyan the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the word "STATEGRAPH" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 2 · LANGGRAPH" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): an ornate top-down garden-maze map — but rendered in the warm brass house palette, with engraved bronze-green hedges and brass walkways on the warm near-black ground (not bright green), lit by golden lamplight. Winding hedged paths (the edges) connect domed brass gazebo pavilions (the nodes), each gazebo wearing a small engraved brass name-plate: START, CHECK, RETRIEVE, EVALUATE, TOOL, END, GENERATE, DECIDE. At the very centre, the hub all paths flow toward, stands a large glowing teal-blue glass apothecary jar on a brass pedestal labelled "STATE". A little brass walker-automaton strides along one path (the execution pointer). A small engraved legend cartouche sits in a lower corner. Spell every label exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 5 · `l2-conditional-edges` — Level 2, Lesson 3 / global #12 (replaces a 16:9, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, teal-cyan the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "CONDITIONAL EDGES & REDUCERS" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 2 · LANGGRAPH" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): a two-part engraved plate divided by a slender brass column. On the LEFT, under a small engraved label "CONDITIONAL EDGES", a brass automaton turns a large brass rotary selector dial that switches an incoming pipe onto one of three diverging tracks, each track headed by a different glowing valve-glyph — a square, a circle, a triangle (a router choosing one path). On the RIGHT, under a small engraved label "REDUCERS (MERGE)", two glowing teal-cyan streams pour down from two spouts and merge into a single brass-rimmed glass beaker, combining into one (concurrent updates merging into state). Warm brass on near-black, teal-cyan glow only in the flows and glyphs. Spell the two sub-labels exactly: CONDITIONAL EDGES, REDUCERS (MERGE). Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 6 · `l3-harness` — Level 3, Lesson 1 (has the scene, but no frame and plaque at bottom — move plaque to top, add frame)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, rich violet the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "THE HARNESS" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · DEEP AGENTS" in smaller engraved small-caps. Spell all lettering EXACTLY as written; no other text anywhere. SCENE (filling the area below the plaques): at the centre, a brilliant violet plasma core — a glowing orb of electric filaments — cradled inside an ornate brass armillary exoskeleton, a harness of rings, pipes and gauges clamping around it. Arranged around the core, the instruments of the harness: a hinged brass plan-ledger of checkboxes at upper left, a cabinet of small file drawers at upper right, docked mini-engines in glass cylinders glowing violet on either side, and a brass control lever and camera-box in the foreground. Warm brass throughout, rich violet glow from the core and the docked cylinders. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 7 · `l3-virtual-fs` — Level 3, Lesson 2 (same scene, add frame + top plaque)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, violet the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "THE VIRTUAL FILESYSTEM" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · DEEP AGENTS" in smaller engraved small-caps. Spell all lettering EXACTLY as written; no other text anywhere. SCENE (filling the area below the plaques): a towering brass archive wall of countless card-catalog drawers receding into warm shadow. A jointed clockwork arm reaches in holding a large magnifying loupe over one open, glowing drawer; a stream of violet sparkle-motes pours from a round porthole high on the wall, down through the loupe, and into the open drawer, where a single engraved index-card glows violet (grep, then read, then the found file). Warm brass throughout, deep violet sparkle accents. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 8 · `l3-todos` — Level 3, Lesson 3 (same scene, add frame + top plaque)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, violet the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "THE PLAN BOARD" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · DEEP AGENTS" in smaller engraved small-caps. SCENE (filling the area below the plaques): a grand brass railway-style departure board whose rows are sliding engraved task-plaques. The top three plaques read "done", "done", "done"; the next plaque, glowing violet, reads "executing"; the rows below it are blank, waiting. A round station clock crowns the board; a jointed clockwork arm at the side slides a fresh plaque into the middle of the list (live replanning); brass levers line the base. Warm brass throughout, violet glow on the active "executing" row. Spell the plaque words EXACTLY: done, done, done, executing — and the title and subtitle exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 9 · `l3-backends` — Level 3, Lesson 4 (same scene, add frame + top plaque)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, violet starlight the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the word "BACKENDS" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · DEEP AGENTS" in smaller engraved small-caps. Spell all lettering EXACTLY as written; no other text anywhere. SCENE (filling the area below the plaques): a Victorian brass observatory interior. A great brass telescope angles up through a slit in the domed roof toward a cluster of violet constellation-stars in the night sky. Below, on a brass pedestal-safe, a large open atlas-book glows with a violet star-map (the persistent store that outlives the thread); nearby on a desk a chalk slate dissolves upward into violet vapour (the ephemeral thread evaporating). Warm brass throughout, deep violet starlight and vapour. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 10 · `l3-permissions` — Level 3, Lesson 5 (same scene, add frame + top plaque)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, violet the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "FILESYSTEM PERMISSIONS" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · DEEP AGENTS" in smaller engraved small-caps. Spell all lettering EXACTLY as written; no other text anywhere. SCENE (filling the area below the plaques): a Victorian brass gatehouse with three gates side by side — on the LEFT an OPEN brass archway with a glowing scroll passing freely through (allow); in the CENTRE a sealed riveted iron door barring a rejected scroll (deny); on the RIGHT a bell-gate where a top-hatted human silhouette in a lamplit booth pulls a summoning bell on a chain (ask the human). In the foreground a brass automaton clerk reads a long permission-ledger scroll, finger pointing; a queue of glowing violet scrolls files along the floor toward the gates. Warm brass throughout, violet glow on the scrolls. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 11 · `l1-runnables` — "Runnables and LCEL" (replaces a 16:9, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, warm amber-gold the hero glow. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "RUNNABLES & LCEL" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · LANGCHAIN" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): a horizontal brass assembly line of four distinct machine-modules connected end to end by a single glowing golden pipe (the | pipe operator), a luminous token passed hand to hand down the line. Each module wears a small engraved brass name-plate with an icon above it: "PROMPT" (a template tablet), "MODEL" (a glowing orrery core), "PARSER" (an angle-bracket press), "RETRIEVER" (a magnifying glass). Directly below the line, the same four collapsed into one long sealed brass pipe — a single Runnable — with a small engraved caption beneath it reading "Compose primitives. Get a single Runnable." Warm gold glow running along the pipe. Spell the module labels exactly: PROMPT, MODEL, PARSER, RETRIEVER. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 12 · `l1-structured-output` — "Structured output" (replaces a 16:9, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, warm amber-gold the hero glow. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "STRUCTURED OUTPUT" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · LANGCHAIN" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): a printer's brass type-setting tray (a typecase) on a desk, its rows neatly filled with paired engraved tiles — a label tile and its value tile on each row: "name / Alex Smith", "age / 34", "email / alex@example.com", "city / San Francisco", "active / true". An automaton's brass hand sets the final "true" tile into place. To the right, a loose disordered scatter of metal word-tiles (date, null, query, string, number, value, items) — the unstructured tokens. Along the left edge, a small engraved vertical flow of three steps: "UNSTRUCTURED TOKENS", then "SCHEMA { }", then "STRUCTURED OUTPUT". Warm gold glow on the neatly set tiles, dim on the loose ones. Spell the field rows and the three flow labels exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 13 · `l1-tools` — "Tools" (replaces a 3:2, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, warm amber-gold the hero glow. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the word "TOOLS" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · LANGCHAIN" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): a brass automaton at a workbench reaches up toward a pegboard wall hung with five brass instruments, each under an engraved name-plate with a short engraved capability caption beneath it: "HAMMER — Enables action.", "MAGNIFIER — Enables inspection.", "CALIPERS — Enables measurement.", "ABACUS — Enables calculation.", "SPYGLASS — Enables exploration." A warm desk-lamp, open books, papers and a small steam-engine sit on the bench; a small brass corner plaque reads "CAPABILITIES EXPANDED". Warm gold lamplight pooling across the bench. Spell every label and caption exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 14 · `l1-agent` — "createAgent" (replaces a 3:2, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, warm amber-gold the hero glow. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the word "CREATEAGENT" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · LANGCHAIN" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): the ReAct loop drawn as an engraved brass cycle around a central brass automaton seated at a control console, one hand to its chin in thought, small thought-bubbles rising. Six numbered stations, joined by arrows into a continuous loop: "1 THOUGHT — What should I do next?", "2 ACTION — I will use a tool." (a robotic arm beside a small tool menu listing SEARCH, LOOKUP, CALCULATE, RETRIEVE, CODE), "3 OBSERVATION — What was the result?" (a printed paper scroll), "4 REASONING — What does this mean?", "5 DECISION — What should I do next?", "6 REPEAT — Continue the loop until the goal is achieved." A small engraved sub-line beneath the title reads "The ReAct Loop". Warm gold glow throughout. Spell every station label and menu item exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 15 · `l1-rag` — "Agentic RAG — the capstone" (replaces a 3:2, frameless image)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, warm amber-gold the hero glow. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "AGENTIC RAG" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 1 · CAPSTONE" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques): a warm brass library. Three open books stand on reading stands, each under an engraved brass name-plate: "SOURCE 1 — Encyclopedia Britannica", "SOURCE 2 — World Factbook", "SOURCE 3 — Merriam-Webster". Thin glowing golden threads lift short passage-cards from the books and draw them toward a single answer-card at the centre that reads "Paris is the capital and most populous city of France." A brass automaton scholar sits at the foreground desk beside a "USER QUESTION" card reading "What is the capital of France?" and a "GENERATED ANSWER" plaque, a desk-lamp glowing warm. Three engraved side-labels name the stages: "RETRIEVE — Find relevant information.", "AUGMENT — Add content to the prompt.", "GENERATE — Produce accurate response." Warm gold glow along the threads. Spell every label and the answer text exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 16 · `l3-capstone-data-science` — "The Analytical Engine" (has the scene + plaques, but no ornate frame — add one)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, rich violet the only secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges like an antique certificate; the scene sits INSIDE this frame with a small margin — nothing cropped by or overlapping the border. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "THE ANALYTICAL ENGINE" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · CAPSTONE" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques, inside the frame): a brass gentleman-automaton with brass goggles is seated at a workshop desk, operating a great Analytical Engine. Behind it rise labelled brass columns — "CARDS" and "CARD FEED" (stacked punch-card decks), the "MILL" (the central geared computing core, glowing violet), and the "STORE" (tall columns of numbered geared counting-wheels). On the back wall, small engraved plates: "PLAN OF THE ENGINE" (a blueprint, upper left), "LOGARITHMIC SCALES" (upper right), a "POWER" pressure-gauge on the left and a "PRESSURE" gauge on the right. On the desk a plotter arm inks a scatter chart onto parchment titled "LIFE EXPECTANCY vs INCOME PER CAPITA (GAPMINDER)" — labelled axes, a rising cloud of violet data-points, a few country labels — beside an inkwell and the keyboard the automaton types on. Warm brass throughout, rich violet glow from the Mill and the chart's data. Spell the column and plate labels exactly. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

## 17 · `l3-beyond` — "Beyond This Course" (has the scene + plaques, but no ornate frame — add one)

```
A grand painterly banner illustration in warm Victorian-steampunk style — an antique copperplate engraving crossed with a luminous oil painting. Aged brass and burnished gold on a deep near-black warm background (#0a0805 to #16110b); fine engraving cross-hatching and patina over painterly light, with a violet-and-golden dawn as the secondary accent. FRAME: enclose the ENTIRE image in a continuous ornate brass border with engraved corner cartouches, scrollwork and small brass studs, set just inside the edges like an antique certificate; the scene sits INSIDE this frame with a small margin — nothing cropped by or overlapping the border. TITLE PLAQUE: across the top centre, an ornate brass cartouche plaque bearing the words "BEYOND THIS COURSE" in large engraved serif small-caps in warm cream, perfectly legible; directly beneath it a smaller brass ribbon banderole bearing "LEVEL 3 · THE ROAD AHEAD" in smaller engraved small-caps. Spell all lettering EXACTLY as written. SCENE (filling the area below the plaques, inside the frame): the warm brass interior of a great library-workshop. Four brass steampunk figures — the companions from the journey — stand with their backs to us, gathered at a tall arched window, looking out over a vast frontier at dawn: a sprawling steampunk metropolis of domes, spires and airships under a golden-violet sunrise. Each figure carries a memento of the course: one holds a furled music score, one a sealed research dossier, one a certified report, and a leader holds a conductor's baton. Around the room: tall bookshelves, open blueprints and books on side desks, a brass celestial orrery glowing violet in a lower corner, and a brass calculating machine to one side. Warm brass throughout, a luminous violet-gold dawn pouring through the window. Balanced and centred, generous margins, nothing cropped or touching the frame. No modern UI, no neon, no photoreal human faces. Landscape 4:3 aspect ratio.
```

---

### Already consistent — left untouched

`l1-model`, `l3-compaction`, `l3-hitl`, `l3-skills`, `l3-subagents`, `l3-capstone-research`,
`l3-capstone-data-science`, `l3-beyond`, and the framed L2 tail (`l2-checkpointers`,
`l2-interrupts`, `l2-streaming-modes`, `l2-send-fanout`, `l2-subgraphs`) all already carry the
4:3 ornate frame + title/subtitle plaques.
