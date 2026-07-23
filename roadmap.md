# Bitwise Roadmap

Milestone-based, ordered by dependency, no dates. Each milestone is defined by
**what it proves** — not a feature checklist. We ship the narrowest end-to-end
path first and thicken it. Because lessons are AI-improvised and disposable,
scope is fluid on purpose; this roadmap sequences the *engine*, which is the
only durable thing we build.

> **Status (2026-07-23).** M0 and M1 are **done**. M2 (the curriculum loop) is
> **deferred by direction**. The active focus is the **Artifact quality & engine
> capability** track (Ma), now steered by a **pivot (2026-07-23):** from a
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
- **Answer-correctness is earned by machinery; visual craft is judged by output.**
  The CAS stays the source of truth for graded answers, never the model. Visual
  and interaction quality is gated by a render-and-inspect (vision) eval —
  sequenced after the freeform slice — rather than by a static allow-list.
- **The wait is the product too.** A minutes-long generation should read as
  craft via visible pipeline progress — but that polish is later, not M0.

## Non-goals (for this horizon)

Explicitly deferred to keep the engine the focus. Not "never" — "not yet."

- **Accounts & auth** — anonymous, in-session only until M4.
- **Persistence & a real learner model** — learner state is hard-coded (M0) then
  ephemeral/in-session (M2). No long-term mastery tracking until M4.
- **Mobile & visual polish** — desktop-first, minimal chrome until the engine is
  proven.

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
- **R6 — render-and-inspect eval.** Screenshot + vision grading of the rendered
  artifact becomes the primary visual-quality gate — **sequenced after** the
  freeform slice, not before it.

**In scope (sequenced — vertical before horizontal)**
- **Phase 1 — SSOT for the SDK surface. ✅ done, now repurposed.** `sdk.d.ts`
  stays the one source of truth, but as std-lib *documentation*; its former role
  as the verifier's hard allow-list is retired under freeform-first.
- **Phase 2 — thin vertical slice of the creative runtime (next).** Go vertical:
  a minimal **Stage** (one clock, pure render, the three drivers at a basic
  level), a starter **std-lib** (SVG/Mafs substrate + a few marks + basic director
  transitions + a basic simulation step), and **freeform authoring** (the LLM
  writes custom code; the sandbox mounts it; errors + critic are the only gate).
  Prove one freeform artifact that *animates, is interactive, and runs a basic
  simulation*, end-to-end — then deepen.
- **Phase 3 — deepen & extend.** Richer director (transforms, morphing), broader
  vocabulary, the ODE-kernel → physics-engine path, more substrates
  (Canvas / WebGL / 3D).
- **Phase 4 — stand up the R6 vision-eval gate** (freedom first, eval next).

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
- **Bundle budget & lazy-loading** — the sandbox bundle is already ~4.1 MB before
  Mafs + Motion; set a budget and lazy-load heavy substrates. This moved up from
  "later" to a **near-term concern** the moment Mafs + Motion land (W1/W5).
- **Physics engine** — Rapier / matter.js as a `useSimulation` stepper (Phase 3).
- **Motion library size** — if Motion proves too heavy for the scalar-tween job,
  revisit a lean hand-rolled tween (the W0 runner-up).

**Done when:** a single freeform-authored lesson reliably delivers a cinematic,
interactive, simulation-backed figure end-to-end — mounted safely, repaired on
error — even before the vision-eval gate lands.

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
- **Progress UI** surfacing the pipeline stages ("Designing… Building… Checking
  the math… Polishing… Ready").
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
- **Eval harness** — starts M1, deepens every milestone; the main defense for a
  system whose content is never hand-reviewed. Under the freeform pivot it grows a
  **render-and-inspect (vision) gate** for visual/interaction/emulation craft
  (Ma Phase 4), since a static allow-list no longer holds that line.
- **Prompt & SDK iteration** — the two highest-leverage surfaces; expect
  constant tuning. `sdk.d.ts` stays the single source of truth for the runtime
  and prompt docs — as std-lib documentation; the enforced verifier allow-list is
  retired under freeform-first.
