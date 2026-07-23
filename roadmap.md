# Bitwise Roadmap

Milestone-based, ordered by dependency, no dates. Each milestone is defined by
**what it proves** — not a feature checklist. We ship the narrowest end-to-end
path first and thicken it. Because lessons are AI-improvised and disposable,
scope is fluid on purpose; this roadmap sequences the *engine*, which is the
only durable thing we build.

> **Status (2026-07-23).** M0 and M1 are **done**. M2 (the curriculum loop) is
> **deferred by direction** — see below. The active focus is the
> **Artifact quality & engine capability** track (Ma), which pulls M3's "range"
> half and the Prompt/SDK cross-cutting track ahead of the loop. The guiding bet:
> the durable value is the *generation engine*, so make each artifact excellent
> and keep the loop dumb (type a concept → get a lesson).

## Guiding principles

- **Vertical before horizontal.** Get one live lesson from prompt to pixels
  before making any single layer deep.
- **The SDK is the contract; everything else is disposable.** Break lessons,
  the curriculum, and the learner path freely — never the SDK without intent.
- **Correctness is earned by machinery, not trust.** The CAS is the source of
  truth for answers, never the model.
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

## Ma — Artifact quality & engine capability (active focus) 🔨

**Proves:** a single freshly authored lesson is *excellent* — its interactions
span math's visual archetypes, every primitive is reactive/explorable, and the
SDK contract the LLM authors against is truthful. This is where quality lives,
independent of any curriculum loop.

**Why here, ahead of M2.** Direction call (2026-07-23): the durable value is the
generation engine, not session/orchestration logic. Keep the loop dumb (type a
concept → get a lesson); pour the effort into the artifact. This track pulls M3's
"range" half and the Prompt/SDK cross-cutting track ahead of the loop.

**Guiding requirements (endorsed)**
- **R1 — archetype-spanning vocabulary.** Cover math's visual archetypes, not
  just plot + slider (geometry constructions, number lines, diagrams, …).
- **R2 — reactive by default.** Every primitive is explorable: state → observe,
  the "see why" loop.
- **R3 — engine owns craft, LLM owns intent.** Good visual defaults live in the
  engine; the model supplies meaning, not pixels.
- **R4 — truthful single source of truth for the SDK surface.** `sdk.d.ts` feeds
  runtime, prompt docs, and the verifier allow-list — no drift. *(locked)*
- **R5 — load-bearing interactions.** The plan commits to a central interaction;
  the critic verifies the lesson actually depends on it (no dead widgets).
- **R6 — render-and-inspect eval.** Screenshot + vision loop to judge the
  rendered artifact, not just the source. *(deferred within this track)*

**In scope (sequenced)**
- **Phase 1 — single source of truth for the SDK surface (R4).** `sdk.d.ts`
  becomes the one truthful contract; runtime, prompt docs, and verifier allow-list
  all derive from it.
- **Phase 2 — lead vocabulary expansion with `Geometry` constructions (R1/R2).**
  The first archetype beyond plot+slider; reactive construction primitives.
- Then: broaden vocabulary further, then stand up the R6 visual-eval loop.

**Done when:** a single-concept lesson reliably reaches beyond plot+slider into a
second visual archetype, its central interaction is load-bearing, and the SDK
contract has no runtime/prompt/verifier drift.

**Not yet:** the curriculum loop (M2). Interaction stays type-a-concept → lesson.

**Quality axes that matter:** interaction richness & variety, and pedagogical
depth & clarity — *not* topic breadth.

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
- Grow the SDK from **core → ext tier**: more `Plot` marks (parametric,
  inequality, vector, polygon), `NumberLine`, `Geometry` (JSXGraph), `Chart` /
  `Distribution` for stats/probability, `Tween`/`useTime` motion.
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
  system whose content is never hand-reviewed.
- **Prompt & SDK iteration** — the two highest-leverage surfaces; expect
  constant tuning. `sdk.d.ts` stays the single source of truth for runtime,
  prompt docs, and the verifier allow-list.
