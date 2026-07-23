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

> **Progress (2026-07-23).** **W0–W6 done.** The `sandbox/stage/` runtime exists
> (clock, store, mark, director, sim, rng, scene) and the golden lesson
> `sdk/examples/newton.lesson.tsx` **runs end-to-end in the sandbox** — all three
> drivers, verified in a real browser (`npm run test:browser -- --path /dev
> --steps scripts/steps/golden.json`, 21 steps). The allow-list is retired, the
> BUILD prompt teaches the Stage, and `npm run eval` is green (6/6 doc checks,
> 9/9 fixtures). Remaining for Phase 2: the **live-generation** demo target —
> proving the *prompt* gets the model to compose the Stage, not just that the
> runtime can.
>
> The spike that unblocked it is `docs/spikes/w1-hybrid/FINDINGS.md`; two of its
> findings are load-bearing and easy to re-break — see §6.

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
  on hidden tab. Drives the director and the simulator. **Reduced motion does not
  pause the clock** (a deliberate departure from the original wording): a
  simulation is *content*, not decoration, and freezing it empties the lesson.
  The director consults `prefersReducedMotion()` instead, so beats land instantly
  on their correct final state — a 6 s sequence completes in ~1 ms.
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
| **W1** ✅ | Stage core | Engine clock (single rAF); `useStage` (domain store); `useMark` (mark identity/handles); `useDirector` (mark-scoped, Motion-backed); `useSimulation`; boundary integration. **Rewrite the golden lesson to the mark-scoped shape** as the acceptance test | new `sandbox/stage/` (clock, store, mark, director, sim), wire in `sandbox/runtime.tsx`, `sdk/examples/newton.lesson.tsx` | **DONE** — golden lesson's three drivers work end-to-end in the browser; `dir.reset()` cancels cleanly (incl. from *inside* a running sequence); reduced motion lands beats instantly on their final state |
| **W2** ✅ | Substrate (Mafs) | Wrap **Mafs** behind our `Plot.*` names (`OfX`/`Point`/`MovablePoint`/`Segment`/`Polygon`) + a `mark` handle prop + `constrain` axis-lock; `<Custom>` freeform hatch exposing coord transforms. Resolve React-19 peer/compat | `sandbox/stage/scene.tsx`, `scripts/build-sandbox.mjs` (Mafs dep) | **DONE** — Mafs wrapped behind `Plot.*`; marks animate by handle; drag wired to the store. React 19 clean, no shim |
| **W3** ✅ | Director interpolation (Motion) | **Motion**-backed beats: `drawTo` (SVG `pathLength`), `transformTo`, `fadeTo`, plus `sequence`/`stagger`/`parallel`/`wait`/`call` and `reset()`, all over the engine clock | `sandbox/stage/director.tsx`, `scripts/build-sandbox.mjs` (Motion dep) | **DONE** — the animated Newton step plays and resets on drag; 0 React renders during a tween (60.1 ticks/s). Bundle +3.0% raw / +44 kB gz |
| **W4** ✅ | Simulation kernel | RK4 fixed-step integrator; seeded RNG (mulberry32); `useSimulation` wired to the clock; one demo sim (pendulum/orbit) | `sandbox/stage/sim.ts`, `sandbox/stage/rng.ts` | **DONE** — `{rate:1.6}` measures 1.604 steps/s and halts on `null`; RK4 error 1.4e-7; seeded RNG reproducible |
| **W5** ✅ | Pipeline & sandbox glue | Retire the allow-list gate in the verifier (keep CAS + soft checks); rewrite BUILD prompt for std-lib + freeform + Stage; bundle new deps; swap the few-shot to W0's golden lesson | `app/api/generate/verify.ts`, `prompts/build.ts`, `scripts/build-sandbox.mjs`, `sandbox/sdk.tsx` `buildScope()` | **DONE** — no false allow-list rejections (a freeform fixture passes with zero findings); prompt teaches the Stage; few-shot is the golden lesson, drift-gated |
| **W6** ✅ | Eval / harness update | Repoint the drift gate: `sdk.d.ts` ⟺ runtime *scope coverage* (documentation), not allow-list; keep compile/runtime/CAS gates | `scripts/eval.mjs`, `scripts/harness.ts`, `sdk/surface.ts` | **DONE** — `npm run eval` green: 6/6 documentation checks, 9/9 fixtures |

### Sequencing / critical path

```
W0 ─▶ W1 ─┬─▶ W2 ─┐
          ├─▶ W3 ─┼─▶ W5 ─▶ W6
          └─▶ W4 ─┘
```

W0 unblocks everything. W1 (Stage core) is the spine; W2/W3/W4 layer on it in
parallel. W5 integrates the runtime into the authoring pipeline; W6 re-greens eval.

### W1–W6 — as built

```
sandbox/stage/
  clock.ts     — single rAF clock; dt clamped to 1/20 s; sleeps on hidden tab;
                 stops entirely at zero subscribers
  store.ts     — useStage: s.field reads/subscribes, s.set() merges,
                 s.get() is the snapshot that defuses stale closures
  mark.ts      — useMark: handle of Motion values (pathLength, x/y, opacity).
                 attach(el) binds reveal+opacity; POSITION is bound by the scene
  director.ts  — useDirector: drawTo/transformTo/fadeTo + sequence/parallel/
                 stagger/wait/call + reset(); Motion-backed
  sim.ts       — useSimulation ({rate} discrete | {dt} continuous) + rk4()
  rng.ts       — seeded mulberry32, for reproducible "randomness"
  scene.tsx    — Plot.* over Mafs + the `mark` prop + <Custom>
```

**The hybrid was validated first** (`docs/spikes/w1-hybrid/`) and it holds: Mafs
owns the static/interactive layer; director-animated marks render in *our own
pixel-space layer* as a direct child of `<Mafs>`, driven straight off Motion
values. Measured: 0 React renders during a 1.6 s tween at 60.1 ticks/s.

**Two constraints that are easy to re-break** (both cost real debugging):
- `vector-effect: non-scaling-stroke` **silently destroys** a `pathLength`
  reveal — Chrome computes the dash in screen space, so a draw-on degrades into
  a permanently dotted line. Mafs styles its own curves that way, which is
  exactly why our draw-on marks are not in a `--mafs-view-transform` group.
- `.MafsView path { stroke: var(--mafs-fg) }` is stripped from `core.css` at
  copy time: a CSS rule outranks a *presentation attribute*, so it overrode
  `stroke="none"`/`stroke="…"` on every `<Custom>` path.

**Acceptance:** `npm run test:browser -- --path /dev --steps scripts/steps/golden.json`
(21 steps) drives the golden lesson with no LLM in the loop.

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

## 8 · Next steps

W0–W6 are **done**; the runtime half of Phase 2 is closed. What remains is the
half the runtime can't prove about itself.

1. **The live-generation demo target (the actual Phase-2 done-when).** The golden
   lesson is *hand-written*, so it proves the runtime, not the engine. The open
   question is whether the rewritten BUILD prompt gets the model to compose the
   Stage — reach for `useMark`/`drawTo`, wire a `useSimulation`, use `<Custom>` —
   rather than regressing to a static plot with a slider. Generate across several
   concept shapes, mount each, drive it in the browser, and judge the frames.
2. **Fix what that run exposes.** Expect the highest-leverage fixes to be in
   `prompts/build.ts` rather than the runtime; treat a capability the model keeps
   failing to reach for as a *documentation* bug in the prompt.
3. **Then Phase 3** (director depth, vocabulary breadth, more substrates) and
   **Phase 4** (the R6 vision-eval gate, which is what finally closes the
   un-gated-visual-quality window the pivot deliberately opened).

**Standing regression suite:** `npm run eval` (6/6 documentation checks, 9/9
verifier fixtures) plus the browser acceptance test above. The freeform fixture
in the battery is the one that guards the pivot — it asserts that a lesson using
custom helpers, randomness and `<Custom>` produces *zero* findings.
