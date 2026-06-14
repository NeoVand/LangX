# LangX — "The Model" lesson · image prompts (banner + posters)

Painterly hero/poster art for Level 1 · **The Model**, in the app's warm steampunk register
(antique scientific copperplate engraving meets a glowing brass "thinking engine"). The style is
**combined into each prompt** below — paste one prompt as-is. Generate with the GPT image model and
drop the PNG at `static/images/<id>.png`. Each `<HeroImage id="…">` shows a tinted placeholder until
the file exists, so nothing ever looks broken.

Shared DNA (already encoded in every prompt): deep near-black warm background (#0a0805 → #16110b),
aged-brass / golden-ochre primary (#d9a441), with the channel accents the explainer uses —
steel-blue (Query), copper-red (Key), verdigris-green (Value), Victorian plum (attention) — used
sparingly. Antique-engraving linework + soft volumetric glow, fine cross-hatching, patina on metal,
faint blueprint annotations with NO real legible words (the app overlays its own labels). Calm,
scholarly, precise. No neon, no modern UI chrome, no photoreal faces.

---

## `l1-model` — lesson banner · "The Engine of Thought" (landscape 3:2)

```
A grand antique copperplate engraving, painterly and warmly lit, of a brass "thinking engine" —
an imagined Victorian machine that turns language into thought. Centered, a horizontal cutaway:
on the far left, a strip of six engraved punch-card word-tiles feeds into the machine; they
dissolve into glowing golden vector-columns (tall thin luminous bars, like organ pipes of light).
The columns flow rightward through a stack of identical brass chambers — a repeated "block" motif,
gears and lenses faintly visible inside — and out the right side into a fan of radiating light rays
that resolve into a single bright golden spark (the next word). A faint translucent triangular
lattice of sight-lines overlays the chambers (tokens glancing back at earlier tokens). Deep
near-black warm background (#0a0805 to #16110b), aged brass and golden ochre (#d9a441) as the hero
metal, with sparing steel-blue, copper-red and verdigris-green highlights on small valves and pipes.
Fine engraving cross-hatching, patina, soft volumetric glow where the gold light is brightest.
Balanced, centered, generous margins, nothing touching the edges. No legible text, no modern UI,
no neon. Museum-plate elegance.
```

## `model-embedding-space` — poster · "Words become coordinates" (square 1:1)

```
An antique scientific illustration, engraved and softly glowing, of words turning into points in
space. On the left, a few engraved word-tiles (blank, no legible text) connected by thin golden
threads that pull rightward and condense into small bright golden points scattered across a dark
star-chart grid — a faint 3-axis coordinate frame drawn in hairline brass lines, like an old
celestial atlas. Nearby points (related meanings) cluster; a couple of faint dotted measuring lines
suggest distance between two points. Deep warm near-black background (#0a0805), golden-ochre
(#d9a441) points and threads, hairline brass axes, the faintest steel-blue wash in the deep
background. Cross-hatched engraving texture, soft glow on the points. Centered, calm, lots of
negative space, nothing cropped. No legible words, no neon, no modern UI.
```

## `model-attention-glance` — poster · "Every word looks back" (4:3 landscape)

```
An antique engraving of a row of figures glancing backward — rendered abstractly as six tall
engraved pillars in a line, each crowned with a small glass lens. From each pillar, thin luminous
golden sight-lines arc BACKWARD to the pillars before it (and never forward), forming a soft
triangular fan of light — a causal, look-only-at-the-past lattice. The brightest, thickest sight-
lines glow Victorian-plum where attention is strongest; thinner lines fade to faint brass. Behind
the pillars, a faint lower-triangular grid hints at the attention matrix. Deep warm near-black
background (#16110b), aged brass pillars, golden and plum light for the sight-lines, sparing copper
and steel accents on the lenses. Fine cross-hatching, soft glow, patina. Centered and balanced,
comfortable margins, nothing touching the edges. No legible text, no neon, no modern UI.
```

## `model-block-tower` — poster · "The same block, twelve times" (portrait 4:5)

```
A tall antique architectural engraving of a slender brass tower built from twelve identical stacked
chambers — a repeated "transformer block" motif read bottom-to-top. At the base, glowing golden
vector-columns enter; they rise through each chamber, where two engraved mechanisms are faintly
visible inside every floor: a triangular lattice of sight-lines (attention) and a pair of
funnel-and-bell shapes that widen then narrow (the MLP expanding 4× then compressing). A continuous
bright vertical "spine" of golden light runs straight up the centre through all twelve floors (the
residual stream), with each chamber adding a soft side-glow into it. At the very top, the spine
blooms into a crown of light. Deep warm near-black background (#0a0805 to #16110b), aged brass
structure, golden-ochre (#d9a441) light spine, sparing plum/steel/verdigris accents inside the
chambers. Engraving cross-hatch, patina, volumetric glow. Vertically centered, generous top and
bottom margin, nothing cropped. No legible text, no neon, no modern UI.
```

## `model-sampling-dice` — poster · "Choosing the next word" (4:3 landscape)

```
An antique engraving of a brass selection mechanism choosing one word from many. On the left, a
vertical bank of horizontal golden bars of decreasing length (a probability distribution drawn as
an engraved bar chart, longest bar at top). The bars feed rightward toward a single ornate brass
die mid-air, mid-tumble, lit from within by golden light; one face glows brightest (the chosen
token). Beneath the die, a small stylised flame licks upward (temperature) — a taller flame near a
flattened, more-even set of bars; the engraving suggests heat spreading the choice. A faint dotted
cutoff line crosses the bars partway down (top-k / top-p truncation), the bars beyond it dimmed.
Deep warm near-black background (#16110b), aged brass, golden-ochre (#d9a441) bars and die-glow,
sparing copper flame accents. Fine cross-hatching, soft glow, patina. Balanced, centered,
comfortable margins, nothing touching the edges. No legible numbers or words, no neon, no modern UI.
```

## `model-training-stages` — poster · "The three stages of training" (4:3 landscape)

```
An antique engraving as a left-to-right triptych showing how a thinking-engine is built in three
stages, each panel divided by a thin brass column. PANEL 1 (pre-training): a vast library / ocean of
tiny engraved text-pages pouring into a large brass furnace-engine, which glows golden as it "reads"
— the biggest, most luminous panel, conveying scale and raw learning. PANEL 2 (fine-tuning): the same
engine, now smaller and more refined, being adjusted by a pair of calipers against a short rack of
neat instruction-and-answer cards — precise, tidy, fewer elements. PANEL 3 (reinforcement): the engine
presenting an output to a balance-scale, with a small approving check-stamp and a verifying gauge
beside it (human preference + verifiable reward), nudging a dial toward "better". A faint golden thread
of light runs through all three panels along the bottom, labelled by a tiny repeated next-token glyph,
to show every stage rests on the same foundation. Deep warm near-black background (#0a0805 to
#16110b), aged brass and golden-ochre (#d9a441) as the hero metal, sparing verdigris-green and
copper-red accents on the gauges/stamps. Fine copperplate cross-hatching, patina, soft volumetric glow
on the furnace. Balanced triptych, comfortable margins, nothing touching the edges. No legible text
(small abstract glyphs only), no neon, no modern UI.
```

---

### Where each lands in the lesson

| id | placement |
|---|---|
| `l1-model` | lesson hero (title slide) |
| `model-training-stages` | beside the "three stages of training" slide |
| `model-embedding-space` | beside the "from a token to its meaning" slide |
| `model-attention-glance` | beside the "attention" slide |
| `model-block-tower` | beside the "the same word, in context" slide (transformer overview) |
| `model-sampling-dice` | beside the "logits → sampling" slide |
