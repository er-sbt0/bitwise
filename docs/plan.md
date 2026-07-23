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
- **State store** — one reactive store per figure (successor to `useLessonState`).
  Render is a pure function of it. All three drivers mutate *only* the store.
- **Driver: interaction** — pointer/control events → `store.set(...)`. (We already
  have drag math in `Plot.MovablePoint`, `sandbox/sdk.tsx:383` — generalize it.)
- **Driver: direction** — a Manim-style timeline: `play(transformTo(target))`,
  `sequence([...])`, `stagger`. Interpolates store values over clock time.
- **Driver: emulation** — a stepper `step(state, dt) → state'` registered with the
  clock. Integrator (RK4) + seeded RNG. Decoupled from render frame-rate.
- **Substrate** — `render` targets a renderer interface. **SVG/Mafs first**;
  Canvas/WebGL/3D are later renderers behind the same API.

**Why one store + pure render:** a user drag, a `play(...)` transition, and a
`world.step()` are *the same event* ("state changed → re-render"). That's what lets
a figure be a guided animation the learner can grab while a sim runs underneath —
the explicit "not a one-way video" requirement.

### Proposed authoring API (shape only — finalized in the Phase 2 spike, §2 W0)

```tsx
export default function Lesson() {
  const s = useStage({ a: 1, px: 2, py: 3 });        // reactive store
  const dir = useDirector();                          // timeline over the clock
  useSimulation(s, (st, dt) => integrateOrbit(st, dt)); // registers a stepper

  return (
    <Scene x={[-5, 5]} y={[-5, 5]}>
      <Plot.OfX y={(x) => s.a * x * x} color="blue" />
      <Plot.MovablePoint x={s.px} y={s.py} onMove={(p) => s.set({ px: p.x, py: p.y })} />
      <Custom draw={({ xToPx, yToPx }) => <path d={/* freeform */} />} />  {/* escape hatch */}
      <Slider value={s.a} onChange={(a) => s.set({ a })} min={-3} max={3} />
      <button onClick={() => dir.play(tweenTo(s, { a: 3 }, { duration: 1 }))}>animate</button>
    </Scene>
  );
}
```

Open ergonomics questions the spike settles: declarative-render vs hooks (above is
hooks); how "freeform" `<Custom>` is (render-callback with transforms vs arbitrary
React vs raw SVG); whether the director is imperative (`dir.play`) or declarative
(`<Play when={...}>`). We prototype 2–3 and pick by author-legibility for the LLM.

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
| **W0** ✅ | Design spike + reference lesson | Prototyped 3 API shapes (hooks-imperative / declarative / scene-fn); **chose declarative-render + imperative-director with director-owned animation channels** | `docs/spikes/w0/` (3 variants + `DECISION.md`), golden `sdk/examples/newton.lesson.tsx` | **DONE** — shape chosen & documented; golden lesson written (runs once W1 exists) |
| **W1** | Stage core | Engine clock (single rAF); reactive store; driver plumbing; spring/tween interp; boundary integration | new `sandbox/stage/` (clock, store, director, interp), wire in `sandbox/runtime.tsx` | Store updates from all 3 driver kinds re-render a pure `render(state)`; reduced-motion respected |
| **W2** | Substrate + marks (SVG) | `Scene` + marks (curve, point, movable, segment/vector, label); `<Custom>` freeform escape hatch exposing coordinate transforms; **decide Mafs-adopt vs extend in-house SVG** | `sandbox/stage/scene.tsx`, extends `sandbox/sdk.tsx` Plot | A scene renders marks + a custom freeform path in figure coords; drag wired to store |
| **W3** | Motion / director | Adopt **Motion** or **react-spring** as the interp primitive; thin sequencer (`play` / `sequence` / `stagger`) over the clock | `sandbox/stage/director.tsx`, `scripts/build-sandbox.mjs` (dep) | `dir.play(tweenTo(...))` animates a store value with easing; `sequence` chains beats |
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
- **Dependencies + bundle.** Add Mafs (or confirm in-house SVG), Motion/
  react-spring into the sandbox bundle (`scripts/build-sandbox.mjs`). Watch bundle
  size now; three.js/Rapier arrive in Phase 3 and are heavier — plan lazy-loading.
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
| **Mafs adopt-now vs extend in-house SVG** for the slice | schedule / rework | Decide in W0; extend in-house if Mafs integration isn't clean, adopt in Phase 3 |
| **Director ergonomics for the LLM** (imperative timeline is heavier to author) | generation quality | Prototype 2–3 shapes in W0; pick by legibility; strong few-shot |
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

### Immediate next action
**W0 is done** (see `docs/spikes/w0/DECISION.md`; golden lesson at
`sdk/examples/newton.lesson.tsx`). Next is **W1 — Stage core**: implement
`useStage` (domain state) + `useDirector` (owns animation channels + the clock
timeline: `play`/`sequence`/`stagger`/`tween`/`call`) + `useSimulation` (stepper),
with a pure render over `<Plot>`/marks — targeting the golden lesson as its
acceptance test. New marks it needs: `Plot.Segment` and a `constrain` axis-lock on
`Plot.MovablePoint`.
