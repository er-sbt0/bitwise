# Bitwise Roadmap

Milestone-based, ordered by dependency, no dates. Each milestone is defined by
**what it proves** — not a feature checklist. We ship the narrowest end-to-end
path first and thicken it. Because lessons are AI-improvised and disposable,
scope is fluid on purpose; this roadmap sequences the *engine*, which is the
only durable thing we build.

> **Status (2026-07-24).** M0 and M1 are **done**. M2 (the curriculum loop) is
> **deferred by direction**. The active focus is the **Artifact quality & engine
> capability** track (Ma) — whose **Phase 2 is now complete, live-generation proof
> included**: the Stage (clock, store, marks, director, simulation) runs in the
> sandbox, the allow-list is retired, `npm run eval` is green, and three
> unrehearsed concepts each came back as a lesson that composed the Stage
> *unprompted* and mounted interactively in ~80–95s. It "can" — but it comes back
> **narrow and plain**: every concept funnels into one Cartesian plot, craft is
> flat, and the only hard gate is answer-correctness, so nothing pulls the *look*
> upward. **Phase 3's first brick has now landed (2026-07-24):** the tokens →
> Scene kit → spring director → Deck slice is built and renders end-to-end on
> *Bayes as a 100-pixel grid* — a bespoke concrete picture, not a plot (details in
> Phase 3 below); next is proving it in a live generation. **Direction sharpened
> (2026-07-24): craft-first, gates off,
> LLM-as-artist.** Phase 3 raises the *look and depth* by handing the model a
> robust engine of programmatic building blocks it composes as the artist — and we
> **drop the verification machinery** (the CAS answer-gate, the planned vision-eval,
> the blocking critic) to spend that time on the engine instead. Quality is
> **judged by eye**, not gated. *Risk accepted:* a wrong answer or a visual
> regression can now reach the screen unflagged — we trust the model and our own
> eyes for this horizon. The craft goals — **design tokens + spring motion,
> Scene-kit breadth, director/animation depth, Deck/Screen shape** — are a menu we
> pull from one at a time, not a batch; and **deep + complete now means
> simulation-backed:** the star is a real running model the learner drives, not
> more prose. Steered by a
> **pivot (2026-07-23):** from a
> *curated, verifier-gated widget set* to a **freeform creative runtime**. The
> LLM composes a rich standard library — and writes custom draw/animate/simulate
> code — freely; quality is judged by *observed output*, not a static allow-list.
> The guiding bet is unchanged: the durable value is the *generation engine*, so
> make each artifact excellent and keep the loop dumb (type a concept → get a
> lesson). The bar we are aiming at is **brilliant.org-grade animation,
> emulation, and explanation**.

## Guiding principles

- **Vertical before horizontal.** Get one live lesson from prompt to pixels
  before making any single layer deep.
- **The std-lib is a library, not a cage.** The SDK is a rich, typed standard
  library the LLM composes — and extends with custom code — freely. `sdk.d.ts`
  *documents* the surface; under the freeform pivot it no longer *gates* it.
- **Judged by eye, not by gates (this horizon).** The verification machinery is
  off: the CAS answer-gate, the render-and-inspect vision eval, and the blocking
  critic are retired so the time goes into the engine instead. The model is the
  brain and the artist; we trust it and inspect the output ourselves. *(The CAS
  code still lives in the tree — see M1 — and can be re-armed if we choose, but it
  no longer blocks a mount.)*
- **The wait is the product too.** A minutes-long generation should read as
  craft via visible pipeline progress. **Landed 2026-07-24**, earlier than
  planned and out of M2's scope, because a 90-second blank screen was actively
  hiding failures: `/api/generate` streams its stage events, and the plan — which
  lands ~15s in — puts the lecture's title, essence and argument on screen while
  the code is still being written.

## Non-goals (for this horizon)

Explicitly deferred to keep the engine the focus. Not "never" — "not yet."

- **Accounts & auth** — anonymous, in-session only until M4.
- **Persistence & a real learner model** — learner state is hard-coded (M0) then
  ephemeral/in-session (M2). No long-term mastery tracking until M4.
- **Mobile** — desktop-first until the engine is proven.
- ~~**Visual polish**~~ — *partially reclaimed 2026-07-24.* The host chrome and
  the lesson surface got a deliberate pass: dark studio around a light lesson
  page (the artifact is the thing being made, not another panel), the frame sized
  to the lesson rather than scrolling a document inside a window, and typography
  the model's own bare `<button>`/`<p>` inherit. Justified, not scope creep — an
  artifact we cannot bear to look at cannot be judged for craft, which is the
  whole of Ma.

Note: **non-math subjects are *not* a non-goal.** The engine is subject-agnostic
by design; only the current SDK and lessons are math-first. Expanding beyond math
is a milestone (M4+), not an exclusion.

---

## M0 — Thin vertical slice: something real on screen ✅ done

**Proves:** a live-generated math lesson mounts in the sandbox and its
interactions actually work. Correctness and quality may be rough.

**In scope**
- Sandbox: cross-origin `<iframe>` (or Sandpack to start), `allow-scripts` only,
  CSP with `connect-src 'none'`, React + SDK injected as globals.
- SDK runtime: **core tier only** — `useLessonState`, `fmt`, `math`, `Section`,
  `Prose`, `Callout`, `Reveal`, `Hint`, `Plot` (`OfX`, `Point`, `MovablePoint`),
  `Slider`, `Toggle`, `NumberInput`, `Exercise`, `MultipleChoice`/`Option`.
- Single-shot generation: one prompt (SDK docs + the parabola few-shot) → one
  component. **Hard-coded concept and learner profile.**
- Transpile with `esbuild-wasm`; mount behind a React error boundary.
- Self-repair loop for **compile + runtime errors only** (feed the error back,
  regenerate, cap ~3). Critic and math-verify are **stubbed**.
- Lightweight tracing from day one (Langfuse/Helicone) — just enough to see
  cost, latency, and failures.

**Done when:** clicking "generate" produces a fresh lesson whose slider drives a
plot and whose exercise grades an answer — end to end, in the browser.

**Not yet:** answer correctness guarantees, improvised curriculum, a real
pipeline, prefetch, persistence.

---

## M1 — Trustworthy content: correct by construction ✅ done

**Proves:** generated lessons aren't confidently wrong. Every declarative answer
is CAS-verified against the plan's canonical answer before a learner sees it.

**In scope**
- The **verifier**: transpile-gate + allow-list enforcement (only `@tier`
  identifiers + JS built-ins), and independent CAS re-check of every
  `AnswerSpec` (numeric/expression/point/set/interval/text). `custom` graders
  flagged as higher-risk.
- The **authoring pipeline** replaces single-shot: `plan → build → verify →
  repair`, plus a first **critic** pass (pedagogy/clarity/difficulty).
- Self-repair now also triggers on failed math-check and critic findings.
- **Eval harness v1**: automated per-generation gates (compiles, SDK-only,
  grader agrees with canonical answer, no dead interactions). Blocks release.

**Done when:** across a batch of generated lessons, the harness catches wrong
answers and API violations before mount, and repair recovers most of them.

**Not yet:** the curriculum still uses a hard-coded target concept.

---

## Ma — The creative runtime: brilliant-grade artifacts (active focus) 🔨

**Proves:** a single freshly authored lesson is *excellent* — brilliant.org-grade
**animation, emulation, and explanation**. Motion is cinematic and purposeful,
figures are interactive, simulations actually run, and the LLM has the
programmatic freedom to build figures the engine's authors never anticipated.

**The pivot (2026-07-23).** We move from a *curated, verifier-gated widget set* to
a **freeform creative runtime**:
- **Freeform-first.** The LLM composes a rich **standard library** — and writes
  custom draw/animate/simulate code — by default. The static allow-list gate is
  **retired**; `sdk.d.ts` documents the std-lib surface rather than fencing it.
- **Great defaults, not enforcement.** The engine still owns visual craft, but as
  excellent defaults the model *reaches for*, not a fence it *cannot cross*.
- **Judged by output.** Quality moves from static verification toward a
  render-and-inspect eval — **freedom first, eval next** (the gate lands a phase
  later; until then, runtime-error capture + the critic hold the line).
- **Determinism relaxed.** Freeform code may use real time and randomness; we
  accept that such artifacts aren't frame-reproducible, and the later eval adapts
  (e.g. seeded fixtures / tolerance) rather than assuming exact frames.

**The core abstraction — the Stage.** One engine-owned clock, one reactive state
store, one pure `render(state)`, and **three drivers** that write to state:
- **interaction** — drag / slider / click (the learner perturbs the figure),
- **direction** — a Manim-style timeline: `play(Transform(a,b))`, sequence, stagger,
- **emulation** — a stepper: `step(state, dt)` (an ODE kernel now, physics later).

The point (an explicit design constraint): a figure can be a *guided animation the
learner can also grab, while a simulation runs underneath* — **not a one-way
video**. All three drivers reduce to the same "state changed → re-render"; a
spring/tween layer smooths transitions.

**Substrate-agnostic.** Author against the scene/std-lib; the substrate is a
swappable renderer. **SVG (Mafs) first** — accessible and DOM-inspectable (which
the future vision-eval wants); **Canvas** (dense/particles) and **WebGL/three**
(3D) are additional renderers later, behind the same API. Build the abstraction
now, implement one substrate now.

**Guiding requirements (updated by the pivot)**
- **R1 — archetype-spanning vocabulary.** Cover math's visual archetypes across
  substrates (geometry, vectors, number lines, curves, data, later 3D).
- **R2 — reactive by default.** Every figure is explorable: state → observe.
- **R3 — engine owns craft as *defaults*; LLM owns intent *and code*.** Good
  visual defaults live in the engine; the model has full expressive freedom.
- **R4 — std-lib, not allow-list.** `sdk.d.ts` is a typed, documented standard
  library the LLM composes freely; the enforced allow-list gate is **retired**.
  *(supersedes the former "locked" truthful-contract-as-cage)*
- **R5 — load-bearing interactions.** The central interaction must matter; the
  critic (not a static gate) checks the lesson actually depends on it.
- **R6 — render-and-inspect eval. Parked (2026-07-24).** Screenshot + vision
  grading was to be the primary visual-quality gate; under the gates-off direction
  quality is judged by eye instead. Kept as a future option, not a blocker.

**In scope (sequenced — vertical before horizontal)**
- **Phase 1 — SSOT for the SDK surface. ✅ done, now repurposed.** `sdk.d.ts`
  stays the one source of truth, but as std-lib *documentation*; its former role
  as the verifier's hard allow-list is retired under freeform-first.
- **Phase 2 — thin vertical slice of the creative runtime. ✅ done
  (2026-07-24).** A minimal **Stage** (one clock, pure render, the three
  drivers), a starter **std-lib** (SVG/Mafs substrate + marks + director
  transitions + a simulation step), and **freeform authoring** (the LLM writes
  custom code; the sandbox mounts it; errors + critic are the only gate).

  **The live-generation proof.** Three unrehearsed concepts — *completing the
  square*, *Bayes' theorem*, *why eˣ is its own derivative* — each came back as a
  lesson that reached for `useStage`, `useMark`, `useDirector` and `<Custom>`
  without being told to, and mounted end-to-end in ~80–95s with the figure
  driven by a load-bearing control. So the prompt gets the model to compose the
  Stage; it isn't just the runtime that can.

  **What it cost to get there** — five defects, every one of them *silent*, which
  is the finding worth keeping:
  - the host never delivered code to the sandbox at all (the frame's one-shot
    `ready` raced hydration), so a finished run showed a filled-in meta panel
    over an empty frame;
  - the error boundary was never reset between lessons, so after the first throw
    every self-repair attempt mounted into a dead boundary and reported nothing —
    the repair loop was hanging on silence, not on a hard error;
  - `<Custom>` could not read animated mark values, so every director beat over
    hand-drawn SVG played out invisibly — in the freeform hatch the prompt most
    encourages;
  - the verifier hard-rejected a constant-valued derivation on *shape* rather
    than value, sending the repair loop twice round an error no lesson edit could
    fix (204s → 93s once removed);
  - `<Prose>` refused inline `$…$` that wrapped across a line break — which a
    model hard-wrapping a template literal does constantly — and left the LaTeX
    on screen mid-paragraph.

  None of these had a red light anywhere; each was found by looking at a
  screenshot. `npm run test:recover` now guards the worst of them, because
  nothing else in the suite posts two lessons in a row.

  **The one authoring failure that recurred** — LaTeX written as JSX *children*
  (`<Hint>\frac{d}{dx}…</Hint>`), where JSX reads `{d}` as a variable and the
  lesson dies on "ReferenceError: d is not defined". Now blocked before mount by
  an **`undefined-name` gate**: a name bound nowhere in the module and absent
  from the injected scope resolves to nothing, whatever the lesson does. Worth
  being clear that this is *not* the allow-list coming back — it never asks
  whether a name is approved, only whether it exists, so it costs the author no
  freedom. It also catches what mounting cannot: a bad name inside an `onClick`
  renders perfectly and explodes under the learner's cursor.
- **Phase 3 — brilliant-grade craft (freeform-first). IN PROGRESS — first brick
  landed 2026-07-24.**
  Phase 2 proved the model *can* compose the Stage; it comes back narrow and plain
  because the only few-shot is a Cartesian plot — so the model imitates
  curve-on-axes and nothing rewards the *look*. Phase 3 changes **what the model
  imitates** and **what the engine hands it**, along a menu of craft goals we pull
  from **one at a time** (not a batch — each is a TODO in its own right):
  - **Scene kit — breadth. ✅ (first cut).** Promoted `<Custom>` to a standalone
    **`<Scene>`** — a no-axes bespoke-drawing canvas over the same Mafs transform
    plumbing — with a house-styled, tokens-driven, mark-animatable **drawing kit**:
    `Grid` (the pixel-grid centerpiece), `Rect`, `Circle`, `Line`, `Arrow`,
    `Bracket`, `Region`, `Label`. Low-level *atoms*, not typed charts. Newton plot
    few-shot **replaced** by the Bayes bespoke-scene lesson — the anchor that kept
    output narrow is gone. *(TODO: more atoms as concepts ask — dot-grids,
    tokens/counters; a second non-plot few-shot.)*
  - **Deck / Screen — shape. ✅ (first cut).** Shipped a **`<Deck>`/`<Screen>`**
    container: one idea per screen, explicit Continue/Back + clickable progress +
    keys (not whole-surface tap, which would fight the figure's controls), spring
    cross-fade, reduced-motion aware. The plan's `develop[]` beats *become* the
    screens; the prompt now teaches the deck as the default shape.
  - **Design tokens + spring motion — craft. ✅.** A **tokens module** (palette,
    type scale, spacing, radii, shadow, stroke, spring presets, durations) now
    feeds BOTH the `Plot.*` primitives and the scene kit, and **`transformTo`
    springs by default** (gentle preset) — movement settles physically instead of
    snapping. Explicit duration/ease still yields an eased tween (so newton is
    unchanged); any beat opts into a spring.
  - **Director / animation depth — motion. TODO.** Richer cinematic transitions on top of
    the mark-scoped director: morphing/interpolation between shapes, staged and
    staggered reveals, camera/scale moves — so a figure *performs* rather than
    snapping. (Pulled up from "fold in later"; still a standalone TODO.)
  - **Simulation-backed depth — the model underneath.** Make `useSimulation` a
    first-class star, not a golden-lesson-only feature: a real running model
    (ODE/stepper now, physics later) the learner drives, since **deep + complete =
    simulation-backed**. Give the prompt a simulation few-shot so live runs reach
    for it unprompted (none has yet).

  **First brick. ✅ LANDED 2026-07-24** (hand-authored, not live-generated yet).
  The thin vertical slice — tokens → scene kit → spring director → deck — is built
  and rendered end-to-end on **Bayes' theorem as a 100-pixel grid**: 100 people as
  a 10×10 `Scene.Grid` that recolors as you drag the base rate, across tap-through
  `Deck` screens, with a spring-director spotlight that dims the test-negatives so
  the positives stand out, and a live `P(sick|+) = TP/(TP+FP)` readout. It reads as
  a bespoke concrete picture, *not* a Cartesian plot — the sharpest contrast with
  the old idiom — and mounts clean in a real browser (31-step browser test, no
  errors; the Scene kit and Deck needed no engine fixes on first render). Built
  across six commits (`284006b`…`dcb23f7`); `npm run eval` green throughout.
  **Next: prove it live** — generate an unrehearsed non-plot concept and confirm
  the model reaches for `<Scene>`/`<Deck>` on its own now that the anchor few-shot
  is Bayes. Then widen to the ~6-concept screenshot grid.

  The genuinely-later items (a **physics engine** — Rapier / matter.js — behind
  `useSimulation`, and more **substrates** — Canvas / WebGL / 3D) **fold in after**
  the craft baseline lands: they deepen a runtime that now looks the part, rather
  than one that doesn't.
- **Phase 4 — the R6 vision-eval gate. Parked (2026-07-24).** Deferred under the
  gates-off direction; quality is judged by eye for this horizon. Revisit if
  by-eye review stops scaling.

> **Decision (2026-07-24): craft-first, gates off.** The user chose to spend the
> engine's time on the *look and depth* and drop the verification machinery
> entirely — including the CAS answer-gate — trusting the model (the brain/artist)
> and judging by eye. **Risk accepted:** a wrong answer or a silent visual
> regression can reach the screen unflagged. **Cheapest hedge if we want one
> later:** a fixed set of ~6 canonical concepts, regenerated each iteration and
> eyeballed as a screenshot grid — nearly free, and the natural on-ramp back to a
> Phase-4 gate if by-eye review stops scaling.

**Candidate stack.** Draw: **Mafs** (SVG) → **Observable Plot**,
**react-three-fiber** later. Animate: **Motion** / **react-spring** + a timeline
sequencer (or **GSAP**); **flubber** / **d3-interpolate** for morphs. Simulate:
in-house **RK4 + seeded RNG** → **Rapier** / **matter.js** later. Compute:
**mathjs** (→ CAS). Explain: **KaTeX** + scroll/step binding.

**Locked for W1 (2026-07-23), after the W0 spike** (`docs/spikes/w0/DECISION.md`):
- **Director = mark-scoped, retained-mode.** Marks have identity (`useMark`);
  the director animates a *specific mark* — `drawTo` / `transformTo` / `fadeTo` —
  rather than a channel bag. (Chosen over the channel amendment; Motion's
  `pathLength` + imperative `animate()` map onto it directly.)
- **Substrate = adopt Mafs now** (React + SVG), wrapped behind our own `Plot.*`
  names so the authoring surface stays ours and Mafs stays swappable.
- **Interpolation = Motion (Framer Motion)** drives the director's tweens.
- **Build W1 solo**, against the mark-scoped golden lesson as its acceptance test.

**TODO (deferred, tracked here):**
- **Other substrates** — Canvas (dense/particles) and WebGL/**react-three-fiber**
  (3D) behind the same `Plot.*`/Scene API (Phase 3).
- **Bundle budget & lazy-loading** — Mafs + Motion landed for **+3.0% raw /
  +44 kB gz** (4.31 MB → 4.43 MB), far under the spike's +508 kB estimate because
  esbuild tree-shakes most of both. So this is *less* urgent than feared — but
  the bundle is still dominated by `@babel/standalone`, and three.js/Rapier in
  Phase 3 are genuinely heavy. Set a budget before those land.
- **Physics engine** — Rapier / matter.js as a `useSimulation` stepper (Phase 3).
- **Motion library size** — if Motion proves too heavy for the scalar-tween job,
  revisit a lean hand-rolled tween (the W0 runner-up).
- **`<Custom>` re-renders per frame while any mark animates** (2026-07-24) — the
  only way a draw function that computes its SVG in JS can follow a tween, and it
  costs nothing at rest since a MotionValue only fires during a beat. It is still
  the one place in the scene layer that renders per frame; revisit if a dense
  freeform figure shows it.
- **Silent-failure coverage** — Phase 2's four defects all failed quietly. The
  eval battery checks *outputs*; nothing checks that the engine still reports
  honestly when a lesson breaks. `npm run test:recover` is the first of these;
  more belong wherever the pipeline can end in silence rather than in an error.

**Done when:** ~~a single freeform-authored lesson reliably delivers a cinematic,
interactive, simulation-backed figure end-to-end — mounted safely, repaired on
error — even before the vision-eval gate lands.~~ **Met 2026-07-24** for
animation + interaction + safe mount + repair; the *simulation-backed* half is
proven by the golden lesson rather than by a live generation (no live run has yet
reached for `useSimulation` on its own), so the bar is met but not saturated.

**Done when (Phase 3):** an unrehearsed non-plot concept comes back as a *bespoke
scene* (the right concrete picture, not a Cartesian plot), delivered as tap-through
screens, with house-style craft and spring motion inherited from the engine, and —
where the concept warrants — backed by a live simulation the learner drives;
convincingly brilliant.org-grade *by eye* across the ~6-concept screenshot grid.

**Not yet:** the curriculum loop (M2); the R6 vision-eval gate (Phase 4).

**Quality axes that matter:** animation & interaction richness, emulation depth,
and pedagogical clarity — *not* topic breadth.

---

## M2 — The engine as a loop: improvised curriculum ⏸ deferred (2026-07-23)

> **Deferred by direction.** De-scoped for now: no orchestrator, no
> learner/mastery model, no progress tracking, no prefetch. Revisit after the
> **Ma** artifact-quality track. Kept here because it's still the natural next
> step once the artifact is strong.

**Proves:** a learner can move through a self-directed sequence of freshly
authored lessons in a single session — the curriculum is chosen on the fly.

**In scope**
- Orchestrator **derives the next concept on the fly** (fully AI-improvised),
  reading each lesson's `meta` (concept/prerequisites/objectives) to decide
  what's next. No pre-authored concept graph.
- **Ephemeral in-session learner state**: mastery signal from exercise results
  steers difficulty and next-concept choice. Not persisted.
- ~~**Progress UI** surfacing the pipeline stages~~ — **already landed
  (2026-07-24)**, pulled out of M2 by "the wait is the product too": the route
  streams stage events and the host renders them live. M2 inherits it.
- **Speculative prefetch**: author the 1–2 likely next concepts in the
  background so "next" usually feels instant.

**Done when:** you can start from a topic, work several lessons in a row, and
each next lesson reflects what you just did — no fixed graph, no reload loss
within the session.

**Not yet:** cross-session memory, accounts.

---

## M3 — Range & economy

**Proves:** lessons span a wide variety of math interactions, at a sustainable
per-lesson cost.

**In scope**
- **Vocabulary breadth largely moves up into Ma Phase 3** (std-lib expansion
  across substrates — geometry, vectors, number lines, charts, 3D, motion). M3
  keeps only the *economy-shaped* work below; "which archetypes" now lives in the
  creative-runtime track.
- Richer lesson shapes (multi-section walkthroughs, `Steps`, guided derivations).
- **Model tiering + prompt caching** to hit the **~$0.25–0.75/lesson** target:
  fast model for routine widgets, Opus for hard/novel ones, cheap critic; cache
  the SDK system prompt.
- Eval harness v2: quality signals (reading level, interaction density, hint
  quality), not just correctness.

**Done when:** the system reliably produces varied algebra→calculus→probability
lessons and typical per-lesson cost sits inside the target.

---

## M4 — Beyond the prototype

**Proves:** Bitwise is more than a single-session demo. This is where the
deferred non-goals come back on the table.

**In scope (seeds; sequenced later)**
- **Accounts & persistence**: durable learner model, cross-session mastery,
  resume.
- **Beyond math**: exercise the subject-agnostic engine on a second domain
  (e.g. CS/logic) — largely new SDK primitives, same pipeline.
- **Mobile & polish**: responsive lessons, refined progress UX, onboarding.

---

## Cross-cutting tracks (run continuously)

- **Observability** — tracing from M0; cost/latency/failure dashboards grow with
  the pipeline.
- **Eval harness** — built through M1; **paused as a blocker (2026-07-24)** under
  the gates-off direction. Quality is judged by eye for this horizon (optionally
  via the ~6-concept screenshot grid). The render-and-inspect (vision) gate and the
  CAS answer-gate remain in the tree as future options, not release blockers.
- **Prompt & SDK iteration** — the two highest-leverage surfaces; expect
  constant tuning. `sdk.d.ts` stays the single source of truth for the runtime
  and prompt docs — as std-lib documentation; the enforced verifier allow-list is
  retired under freeform-first.
