# Bitwise Development Plan — the Creative Runtime (Ma)

Engineering companion to `roadmap.md`. The roadmap says *what each milestone
proves*; this doc says *what we build, in what order, and how we know it's done*.
It covers the active **Ma** track after the 2026-07-23 pivot to a **freeform
creative runtime**. Depth is front-loaded on **Phase 2 (the vertical slice)**;
Phases 3–4 are outlines that firm up as Phase 2 lands.

> **Guiding constraint (from the pivot).** The engine is a *library, not a cage*.
> The LLM composes a rich std-lib and writes custom draw/animate/simulate code.
> Safety comes from the **sandbox** (isolation + no network — unchanged), not from
> a static allow-list. Graded-answer correctness stays CAS-verified; visual craft
> is judged by output (vision-eval, Phase 4). Determinism is relaxed for visuals,
> **preserved for graded answers**.

> **Progress (2026-07-23).** **W0 done** — API shape chosen
> (`docs/spikes/w0/DECISION.md`). **W1 in progress** — the mark-scoped API is
> locked and re-specced as the golden lesson (`sdk/examples/newton.lesson.tsx`),
> and **Mafs + Motion** are installed; the `sandbox/stage/` runtime is **not yet
> written** — the immediate next task. See §2 (W1 detail) and §8 (Next steps).

---

## 1 · Architecture target — the Stage (engineering view)

Every figure is a **Stage**: one engine-owned clock, one reactive state store, one
pure `render(state)`, and three drivers that write to state. This is the load-
bearing abstraction — get it right before breadth.

```
            ┌───────────── Stage ─────────────┐
 events ──▶ │  interaction ─┐                 │
 timeline ─▶│  direction  ──┼─▶ state store ──┼─▶ render(state) ─▶ substrate
 clock ────▶│  emulation  ──┘   (reactive)    │        │            (SVG now)
            └─────────────────────────────────┘   spring/tween interp
```

- **Clock** — a single rAF loop owns time. Replaces ad-hoc `useTime`. Auto-pauses
  on hidden tab / `prefers-reduced-motion`. Drives the director and the simulator.
- **State store** — one reactive domain store per figure (successor to
  `useLessonState`). Interaction and emulation mutate it; render reads it.
- **Marks with identity** — `useMark` gives a mark a handle holding Motion values
  (`pathLength`, position, opacity). **Direction mutates handles, not the store**,
  so presentation/animation state never pollutes domain state.
- **Driver: interaction** — pointer/control events → `store.set(...)`. (We already
  have drag math in `Plot.MovablePoint`, `sandbox/sdk.tsx:383` — generalize it.)
- **Driver: direction** — a Manim-style, **mark-scoped** timeline: `drawTo` /
  `transformTo` / `fadeTo` a *specific mark* via Motion; `sequence` / `parallel` /
  `stagger` / `wait` / `call` compose beats.
- **Driver: emulation** — a stepper `step(state, dt) → state'` registered with the
  clock. Integrator (RK4) + seeded RNG. Decoupled from render frame-rate.
- **Substrate** — `render` targets a renderer interface. **SVG/Mafs first**;
  Canvas/WebGL/3D are later renderers behind the same API.

**Why one store + pure render:** a user drag, a `play(...)` transition, and a
`world.step()` are *the same event* ("state changed → re-render"). That's what lets
a figure be a guided animation the learner can grab while a sim runs underneath —
the explicit "not a one-way video" requirement.

### Decided authoring API (W0 spike → mark-scoped)

The spike chose **declarative render + an imperative, mark-scoped director**. The
full contract is the golden lesson `sdk/examples/newton.lesson.tsx`; in brief:

```tsx
const s      = useStage({ x0: -1.5, iters: [] });   // domain state
const tang   = useMark();                            // mark handle (draw-on)
const marker = useMark({ x: -1.5 });                 // mark handle (position)
const dir    = useDirector();
useSimulation(s, (st, dt) => next(st, dt), { rate: 1.6 });

dir.play(sequence([
  drawTo(tang, { duration: 0.6 }),                    // reveal a *specific* mark
  transformTo(marker, { x: xNext }, { duration: 0.7 }),
  call(() => s.set({ x0: xNext })),                   // semantic commit
]));
// <Plot.Segment mark={tang} … />  geometry stays declarative; only the reveal animates
// interaction (drag) writes the store; dir.reset() cancels in-flight motion
```

**The semantic that resolves "who owns position":** draw-on animates only a mark's
*reveal fraction* (geometry stays declarative/state-bound); transform animates a
mark whose *position lives on its handle*. So a figure splits cleanly into
**state-bound** marks (interaction) and **handle-bound** marks (scripted motion).

---

## 2 · Phase 2 — Vertical slice (the near-term build)

**Objective / proves:** one freshly LLM-authored *freeform* artifact that
**animates + is interactive + runs a basic simulation**, mounted end-to-end in the
sandbox, gated only by compile + runtime-error capture + the critic. Thin on
purpose — one of each capability, then deepen.

**Demo target (done-when for the phase):** type a concept → get a lesson whose
figure (a) responds to a drag/slider, (b) plays an animated transition on command,
and (c) has a continuously-running simulation — all in a single mounted Stage,
self-repairing on error.

### Workstreams

| ID | Workstream | Key tasks | Files | Done when |
|----|-----------|-----------|-------|-----------|
| **W0** ✅ | Design spike + reference lesson | Prototyped 3 API shapes; chose **declarative render + imperative director**, then (W1 lock) **mark-scoped / retained-mode** — `useMark` + `drawTo`/`transformTo`, superseding the channel bag | `docs/spikes/w0/` (3 variants + `DECISION.md`), golden `sdk/examples/newton.lesson.tsx` | **DONE** — shape chosen & documented; golden lesson re-specced to mark-scoped |
| **W1** | Stage core | Engine clock (single rAF); `useStage` (domain store); `useMark` (mark identity/handles); `useDirector` (mark-scoped, Motion-backed); `useSimulation`; boundary integration. **Rewrite the golden lesson to the mark-scoped shape** as the acceptance test | new `sandbox/stage/` (clock, store, mark, director, sim), wire in `sandbox/runtime.tsx`, `sdk/examples/newton.lesson.tsx` | The golden lesson's three drivers work end-to-end; interaction `dir.reset()` cancels cleanly; reduced-motion respected |
| **W2** | Substrate (Mafs) | Wrap **Mafs** behind our `Plot.*` names (`OfX`/`Point`/`MovablePoint`/`Segment`/`Polygon`) + a `mark` handle prop + `constrain` axis-lock; `<Custom>` freeform hatch exposing coord transforms. Resolve React-19 peer/compat | `sandbox/stage/scene.tsx`, `scripts/build-sandbox.mjs` (Mafs dep) | Golden marks render via Mafs, are animatable by mark-handle, and drag wired to the store |
| **W3** | Director interpolation (Motion) | **Motion**-backed beats: `drawTo` (SVG `pathLength`), `transformTo`, `fadeTo`, plus `sequence`/`stagger`/`parallel`/`wait`/`call` and `reset()`, all over the engine clock | `sandbox/stage/director.tsx`, `scripts/build-sandbox.mjs` (Motion dep) | The animated Newton step (`drawTo` vertical → `drawTo` tangent → `transformTo` marker) plays and resets on drag; **bundle size measured** |
| **W4** | Simulation kernel | RK4 fixed-step integrator; seeded RNG (mulberry32); `useSimulation` wired to the clock; one demo sim (pendulum/orbit) | `sandbox/stage/sim.ts`, `sandbox/stage/rng.ts` | A stepper evolves state each frame decoupled from render; deterministic under a fixed seed |
| **W5** | Pipeline & sandbox glue | Retire the allow-list gate in the verifier (keep CAS + soft checks); rewrite BUILD prompt for std-lib + freeform + Stage; bundle new deps; swap the few-shot to W0's golden lesson | `app/api/generate/verify.ts`, `prompts/build.ts`, `scripts/build-sandbox.mjs`, `sandbox/sdk.tsx` `buildScope()` | A live generation authors against the new std-lib and mounts; no false allow-list rejections |
| **W6** | Eval / harness update | Repoint the drift gate: `sdk.d.ts` ⟺ runtime *scope coverage* (documentation), not allow-list; keep compile/runtime/CAS gates | `scripts/eval.mjs`, `scripts/harness.ts`, `sdk/surface.ts` | `npm run eval` green under the new model; asserts std-lib is documented & in scope |

### Sequencing / critical path

```
W0 ─▶ W1 ─┬─▶ W2 ─┐
          ├─▶ W3 ─┼─▶ W5 ─▶ W6
          └─▶ W4 ─┘
```

W0 unblocks everything. W1 (Stage core) is the spine; W2/W3/W4 layer on it in
parallel. W5 integrates the runtime into the authoring pipeline; W6 re-greens eval.

### W1 — in progress (the active workstream)

**Done:** the mark-scoped API is locked (`DECISION.md` § UPDATE) and re-specced as
the golden lesson; `mafs@0.21` (peers `react >=18` — fine on 19; ships
`core.css`/`font.css` to copy) and `motion@12` are installed.

**Remaining — the runtime itself**, built solo in this layout:

```
sandbox/stage/
  clock.ts     — single rAF clock (successor to useTime); reduced-motion aware
  store.ts     — useStage: domain reactive store
  mark.ts      — useMark: handle of Motion values (pathLength, x/y, opacity)
  director.ts  — useDirector: drawTo/transformTo/fadeTo + sequence/parallel/
                 stagger/wait/call + reset(); Motion-backed
  sim.ts       — useSimulation: fixed-rate/continuous stepper on the clock
  scene.tsx    — Plot.* wrappers over Mafs + the `mark` prop + <Custom>
```

then wire into `buildScope()` (`sandbox/sdk.tsx`) and copy Mafs CSS in
`scripts/build-sandbox.mjs`.

**First technical call to validate.** Mafs renders declaratively, but
`drawTo`/`transformTo` need per-frame animation. Use a **hybrid**: Mafs owns the
static/interactive layer (grid, `OfX`, draggable `MovablePoint`); director-animated
marks (`Segment` draw-on, the moving `Point`) render in our own thin SVG layer
driven directly by Motion values (the `<Custom>` mechanism, generalized). That
keeps Motion on its fast path and avoids per-frame React churn through Mafs — prove
it with the vertical+tangent reveal before building the rest.

---

## 3 · Cross-cutting changes (land within Phase 2)

- **Retire the allow-list, keep the rest.** `verify.ts` drops `checkAllowlist`
  (the free-identifier + `Plot.*` hard gate). **Keep** `checkAnswers` (CAS),
  `custom-grader` flagging, and `checkDeadInteractions` (demote to soft). The
  **import/network ban stays** — it lives in the `require` stub + CSP
  (`sandbox/runtime.tsx:59`, `public/sandbox.html`), not the verifier.
- **Determinism boundary.** Visual code may use the engine clock / real random.
  **Graded-answer code must not** — the CAS re-check already only reads static
  answer-spec literals (`verify.ts` `evalObjectLiteral`), so this holds naturally;
  document it as a rule and keep a seeded RNG available for authors who want
  reproducible visuals.
- **Prompt rewrite (`prompts/build.ts`).** Teach the Stage model, the std-lib
  surface, the `<Custom>` freeform escape hatch, and "you may write custom code."
  Lead with W0's golden lesson as the few-shot. Drop the "use ONLY the components
  listed" clause.
- **Dependencies + bundle.** ✅ **Done:** `mafs@0.21` + `motion@12` installed.
  **To do:** bundle them into `sandbox-runtime.js` and copy `mafs/core.css` (the
  way KaTeX already is) in `scripts/build-sandbox.mjs`; **measure** the jump from
  the ~4.1 MB baseline. three.js/Rapier arrive in Phase 3 and are heavier — plan
  lazy-loading.
- **Self-repair headroom.** Freeform code widens the runtime-error surface. The
  client repair loop already exists (`app/page.tsx`, cap 3) — consider raising the
  cap for the slice and confirm errors from event handlers/sim loops surface (the
  `window.onerror` handler at `sandbox/runtime.tsx:106` covers async throws).

---

## 4 · Phase 3 — Deepen & extend (outline)

Absorbs the old M3 "range" work. Build breadth *after* the slice proves the shape.

- **Director depth:** true transforms (`Transform(a→b)`), path-tracing/create
  animations, shape morphing (**flubber** / **d3-interpolate**), staggered reveals.
- **Vocabulary breadth:** geometry constructions, vectors, number lines, polygons;
  data/stats via **Observable Plot**; the archetypes R1 calls for.
- **Substrates:** Canvas renderer (dense/particles), then **react-three-fiber**
  for 3D — behind the same Scene API, lazy-loaded.
- **Simulation depth:** promote the kernel; add **Rapier** (or matter.js) as a
  physics stepper behind `useSimulation` for collisions/constraints.
- **Explain binding:** sync prose beats ↔ figure state (scrollama / IntersectionObserver).

## 5 · Phase 4 — Vision-eval gate (outline)

Freedom-first means visual quality is un-gated until here; this closes it.

- Headless render of the mounted artifact; **screenshot at keyframes**.
- Vision grading (composition, legibility, motion quality) + runtime-error + perf
  budget → a **blocking** gate. Fulfils R6; becomes the primary visual-quality gate.
- **Determinism-relaxed adaptation:** don't assume frame-exact repro — grade with
  seeded fixtures / tolerance / structural checks rather than pixel diffs.
- Extend the eval harness (`scripts/harness.ts`) from correctness-only to
  correctness + rendered-quality.

---

## 6 · Risks & open questions

| Risk / question | Impact | Handling |
|-----------------|--------|----------|
| ✅ *Resolved* — Mafs adopt-now vs in-house SVG | — | **Adopted Mafs** at the W1 lock, wrapped behind `Plot.*`. Peers `react >=18`, so React 19 is fine |
| ✅ *Resolved* — director ergonomics for the LLM | — | W0 chose declarative render + imperative mark-scoped director; the golden lesson is the few-shot |
| **Mafs + Motion animation hybrid** — per-frame animation through declarative Mafs | jank / rework | Animate in our own SVG layer off Motion values; **validate first** (§8 step 1) |
| **Bundle jump** — Mafs + Motion on a ~4.1 MB baseline | load time | Measure at W3; budget + lazy-load (tracked as a roadmap TODO) |
| **npm advisories** — 4 high-severity reported after installs | supply chain | Review deliberately; *not* `audit fix --force` (breaking). Triage before ship |
| **Un-gated visual quality window** (freedom before eval) | quality regressions ship | Lean on the critic prompt (now higher-leverage); keep Phase 4 close behind |
| **Wider runtime-error surface** from freeform code | more mount failures | Self-repair cap + robust error capture; W6 keeps compile gate |
| **Bundle growth** (Mafs/Motion now; three/Rapier later) | load time | Measure in W3/W5; lazy-load heavy substrates in Phase 3 |
| **Determinism leak into graded answers** | breaks CAS re-check | Boundary rule (§3); answer specs stay static literals |

## 7 · Definition of done (per phase)

- **Phase 2:** the §2 demo target works end-to-end from a live generation; `npm run
  eval` green under the new (no-allow-list) model; a golden reference lesson exists.
- **Phase 3:** lessons reliably reach a second+ archetype and a real simulation;
  ≥1 non-SVG substrate live; director does transforms/morphs.
- **Phase 4:** a blocking render-and-inspect gate scores visual/interaction/
  emulation craft; harness reports rendered-quality, not just correctness.

---

## 8 · Next steps — the W1 runtime build, in order

1. **Spike the Mafs + Motion hybrid.** Render one `Segment` whose `pathLength`
   animates via Motion in our own SVG layer, inside a Mafs coordinate plane. This
   settles the single real unknown before anything else is built on it.
2. **`clock.ts` + `store.ts`** — the one rAF clock (reduced-motion aware) and
   `useStage`.
3. **`mark.ts` + `director.ts`** — `useMark` handles, then Motion-backed
   `drawTo`/`transformTo`/`fadeTo` plus `sequence`/`parallel`/`stagger`/`wait`/
   `call` and `reset()`.
4. **`sim.ts`** — `useSimulation` (discrete `rate` now; continuous `dt`/RK4 lands
   with W4).
5. **`scene.tsx`** — `Plot.*` wrappers over Mafs (`OfX`/`Point`/`MovablePoint`/
   `Segment`/`Polygon`), the `mark` prop, `<Custom>`, and a `constrain` axis-lock.
6. **Wire + assets** — inject the new names in `buildScope()`; bundle Mafs/Motion
   and copy `mafs/core.css` in `scripts/build-sandbox.mjs`; **measure the bundle**.
7. **Green the acceptance test** — golden `newton.lesson.tsx` mounts and all three
   drivers work (drag, animated step, running iteration).

**Then Phase 2 continues:** W5 (retire the allow-list in `verify.ts`, rewrite the
BUILD prompt to the Stage/freeform model, swap in the golden few-shot) and W6
(repoint the eval drift gate to std-lib *documentation*, not an allow-list).

**Definition of done for W1:** the golden lesson runs end-to-end in the sandbox —
drag repositions the tangent, "Play one step" reveals vertical → tangent → slides
the marker, "Run" iterates to the root, and a drag mid-animation cancels cleanly
via `dir.reset()`.
