# LangX — "The Model" lesson · image prompts

Every prompt below is **self-contained** (style baked in) and **copy-paste ready**. Generate with the
GPT image model; drop the PNG at `static/images/<id>.png`.

Two registers, both warm brass-steampunk so they sit beside the existing chapter art:

- **The banner** (`l1-model`) is a painterly scene with **no text** — the app prints the "The Model"
  title beside it.
- **The infographic posters** are antique scientific wall-charts and **DO carry legible text labels**
  (panel titles, part names, key terms), spelled exactly as written, like a real museum plate.

> Text tip for the model: keep labels short, spell them exactly, render them as clean engraved
> small-caps or a refined serif in warm cream (or engraved into little brass plaques), high contrast.
> If a label comes out misspelled, regenerate — the labels are what make these usable.

---

## 1 · `l1-model` — banner (landscape 16:9) · NO text

```
A grand painterly illustration in the style of a warm Victorian-steampunk oil painting crossed with an antique copperplate engraving — aged brass and burnished gold as the hero metal, lit from within by a soft golden glow, on a deep near-black warm background (#0a0805 to #16110b). Fine engraving cross-hatching and patina over painterly volumetric light; sparing jewel-tone accents (steel-blue, copper-red, verdigris-green, Victorian plum) on small valves, lenses, and pipes. Cinematic, scholarly, reverent — a machine that feels alive. Subject: a magnificent brass "thinking engine" shown as a horizontal cutaway — an imagined Victorian machine that turns language into the next word. On the far left, a slot feeds in a strip of engraved word-cards; they dissolve into tall, glowing golden vector-columns (like luminous organ pipes of light) that flow rightward into the heart of the machine — a stack of identical brass chambers, gears, lenses and glass valves faintly visible inside, a faint triangular lattice of glowing sight-lines threading between them. The columns exit the right side as a radiant fan of light that converges on a single brilliant golden spark — the predicted next word — caught at the tip of a fine brass nib. Warm beams of light rake across the brass; dust motes drift in the glow. Reverent, alive, intricate. NO text or lettering anywhere, no modern UI, no neon, no photoreal human faces. Balanced and centered with generous margins; nothing cropped or touching the edges. Landscape 16:9.
```

---

## 2 · `model-training-stages` — "The three stages of training" (landscape 4:3) · WITH text

```
A refined explanatory infographic rendered as an antique scientific wall-chart / museum plate, warm brass-steampunk: deep near-black warm ground (#0a0805 to #16110b), aged brass and golden-ochre (#d9a441) as the primary, sparing verdigris-green and copper-red accents. Engraved shapes, fine linework, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, rendered in clean engraved small-caps / refined serif in warm cream or on small brass plaques, high contrast. Composition: a left-to-right triptych divided by slim brass columns, with a title banner across the top reading "THREE STAGES OF TRAINING". PANEL 1 (largest, most luminous): an ocean of tiny engraved text-pages pours into a great glowing brass furnace-engine; brass plaque title "PRE-TRAINING" and a small caption below it "self-supervised · predict the next token". PANEL 2: the same engine, smaller and refined, adjusted by brass calipers against a neat rack of paired cards; plaque title "FINE-TUNING" and caption "instructions to answers". PANEL 3: the engine presents an output to a balance-scale beside a check-stamp and a gauge; plaque title "REINFORCEMENT" and caption "RLHF and RLVR". A continuous thread of golden light runs along the bottom through all three panels labelled "next-token prediction". Spell every label exactly. Comfortable margins, nothing touching the edges. No neon, no photoreal faces, no modern UI.
```

---

## 3 · `model-transformer-arch` — "The transformer, exploded" (portrait 4:5) · WITH text

```
A refined explanatory infographic rendered as an antique scientific schematic / museum plate, warm brass-steampunk: deep near-black warm ground (#0a0805 to #16110b), aged brass and golden-ochre (#d9a441) primary, sparing steel-blue / copper-red / verdigris-green / Victorian-plum accents. Engraved shapes, fine linework, thin arrows, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, in clean engraved small-caps / refined serif on small brass plaques, high contrast. Composition: a clean vertical exploded diagram of a transformer as a brass apparatus read bottom-to-top, with a title plaque at top reading "THE TRANSFORMER". From the BOTTOM up, label each stacked sub-assembly with its own brass plaque: a row of token-tiles joined to glowing golden vectors labelled "TOKEN EMBEDDING + POSITION"; then a unit of plum sight-lines between tokens labelled "MULTI-HEAD ATTENTION"; a thin bar labelled "ADD & NORM"; a funnel that widens then narrows labelled "FEED-FORWARD (MLP)"; another "ADD & NORM". A tall brass brace spanning the attention+MLP block is labelled "× N BLOCKS". A bright golden vertical spine running up the centre is labelled "RESIDUAL STREAM". At the TOP, a wide fan labelled "OUTPUT PROJECTION" ends in a row of tiny score-bars labelled "LOGITS". Thin arrows mark the upward flow. Spell every label exactly. Elegant, legible, symmetric, comfortable margins. No neon, no photoreal faces, no modern UI.
```

---

## 4 · `model-embedding-space` — "Words become coordinates" (square 1:1) · WITH text

```
A refined explanatory infographic rendered as an antique celestial-atlas / star-chart plate, warm brass-steampunk: deep near-black warm ground (#0a0805), aged brass and golden-ochre (#d9a441) primary, faint steel-blue wash in the deep background. Hairline brass linework, glowing points, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, in clean engraved small-caps / refined serif in warm cream, high contrast. Composition: a title plaque at top reading "WORDS BECOME VECTORS". On the left, a few engraved word-cards connected by thin golden threads that pull rightward and condense into small bright golden points scattered across a dark coordinate frame drawn in hairline brass (a faint three-axis grid like an antique orrery). Related meanings cluster into loose constellations, each ringed by a faint brass ellipse: one cluster labelled "king · queen · prince", another labelled "cat · dog · kitten", and a lone far-off point labelled "banana". Between the two points "king" and "queen", draw a small dotted arc with a protractor glyph labelled "cosine similarity". Spell every word label exactly. Spacious, calm, comfortable margins. No neon, no photoreal faces, no modern UI.
```

---

## 5 · `model-sampling-dice` — "Choosing the next word" (landscape 4:3) · WITH text

```
A refined explanatory infographic rendered as an antique scientific plate, warm brass-steampunk: deep near-black warm ground (#0a0805 to #16110b), aged brass and golden-ochre (#d9a441) primary, sparing copper-red accents on the flame. Engraved shapes, thin arrows, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, in clean engraved small-caps / refined serif on small brass plaques, high contrast. Composition: a title plaque at top reading "CHOOSING THE NEXT WORD". On the LEFT, a vertical bank of horizontal golden bars of decreasing length labelled "PROBABILITIES". A small stylised flame beneath them labelled "TEMPERATURE", shown in two ghosted states — a low flame with a sharply peaked set of bars and a tall flame with a flattened set. A faint dotted line crossing the bars partway down is labelled "TOP-K / TOP-P CUTOFF", the bars beyond it dimmed and crossed out. On the RIGHT, the kept bars feed toward a single ornate brass die mid-tumble lit from within, one face glowing brightest, caught by a small brass claw, labelled "SAMPLE". Spell every label exactly. Balanced, comfortable margins. No neon, no photoreal faces, no modern UI.
```

---

## Optional extras (need a `<HeroImage>` slot added before use)

### 7 · `model-neural-net` — "Learning by rolling downhill" (landscape 4:3) · WITH text

```
A refined explanatory infographic rendered as an antique scientific plate, warm brass-steampunk: deep near-black warm ground (#0a0805 to #16110b), aged brass and golden-ochre (#d9a441) primary, sparing steel-blue accents. Engraved linework, thin arrows, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, in clean engraved small-caps / refined serif, high contrast. Composition: a title plaque at top reading "HOW A MODEL LEARNS". On the LEFT, a small brass neural network — three columns of glowing nodes joined by fine brass threads of varying thickness, a couple highlighted gold — labelled "NEURAL NETWORK" with a small tag on the threads reading "weights". On the RIGHT, a softly engraved three-dimensional landscape of rolling brass dunes labelled "LOSS SURFACE", with a small polished ball part-way down a valley, a dotted trail behind it and a downhill arrow labelled "gradient descent". Spell every label exactly. Balanced, comfortable margins. No neon, no photoreal faces, no modern UI.
```

### 8 · `model-tokenization` — "Text into tokens" (landscape 4:3) · WITH text

```
A refined explanatory infographic rendered as an antique scientific plate, warm brass-steampunk: deep near-black warm ground (#0a0805 to #16110b), aged brass and golden-ochre (#d9a441) primary. Engraved shapes, thin arrows, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, in clean engraved small-caps / refined serif on small brass plaques, high contrast. Composition: a title plaque at top reading "TEXT INTO TOKENS". A brass type-setting machine takes a continuous engraved ribbon of cursive text on the left (a small tag reads "text") and stamps it into a row of separate brass token-tiles on the right (a tag reads "tokens") — common words become single wide tiles, and one long rare word is shown being split into two or three smaller adjacent tiles. A small caption along the bottom reads "byte-pair encoding". Spell every label exactly. Balanced, comfortable margins. No neon, no photoreal faces, no modern UI.
```

### 9 · `model-attention-glance` — "Every word looks back" (landscape 4:3) · WITH text

```
A refined explanatory infographic rendered as an antique scientific plate, warm brass-steampunk: deep near-black warm ground (#0a0805 to #16110b), aged brass and golden-ochre (#d9a441) primary, Victorian-plum sight-lines. Engraved linework, soft glow. INCLUDE clear legible text labels, spelled EXACTLY as written, in clean engraved small-caps / refined serif, high contrast. Composition: a title plaque at top reading "CAUSAL ATTENTION". A row of six tall engraved pillars, each crowned with a small glass lens; from each pillar, thin luminous plum sight-lines arc BACKWARD only to the pillars before it (never forward), forming a soft lower-triangular fan of light. A small caption reads "each word looks back, never forward". A faint lower-triangular grid behind the pillars is labelled "attention matrix". Spell every label exactly. Balanced, comfortable margins. No neon, no photoreal faces, no modern UI.
```

---

### Placement (current slots)

| id | placement | text |
|---|---|---|
| `l1-model` | lesson hero | no text (banner scene) |
| `model-training-stages` | "Three stages of training" slide | labelled |
| `model-transformer-arch` | after the "stack of identical blocks" slide | labelled |
| `model-embedding-space` | "From a token to its meaning" slide | labelled |
| `model-sampling-dice` | after the logits window, opening the softmax / sampling section | labelled |
