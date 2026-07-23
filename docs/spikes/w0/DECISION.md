# W0 — Stage authoring API: decision record

Three shapes each hand-authored the **same** golden lesson (Newton's method,
exercising interaction + direction + emulation + freeform) so we compared
*ergonomics*, not content. Shapes: **A** hooks + imperative director, **B** fully
declarative components, **C** scene render-function. Full variants live beside this
file (`shape-*/newton.lesson.tsx` + `api.md`).

## The headline finding: two frictions are universal

They are **not** properties of the surface syntax — every shape paid them:

1. **Animation-scalar leakage into the semantic store.** The director tweens store
   fields and `render` is pure, so every *transient view* quantity (the climbing
   vertical, the growing tangent, the sliding marker) had to be invented as a store
   key, threaded through the setter, read in render, **and reset on every
   interaction**. In all three variants this reset was duplicated across handlers
   (`{climb:0,tan:0,slide:0}` in both the drag *and* the slider) — miss one and a
   drag leaves a half-drawn tangent. This tax scales with visual richness. It is
   the #1 friction and it is shared.

2. **Static/snapshot tween targets.** A Newton step's target is *derived from
   current state*, but a tween aims at a fixed value. Chaining state-derived beats
   therefore leaks out of the timeline into hand-rolled JS. Severity differs by
   shape (below).

## What was NOT a differentiator (all three equally good — ship as-is)

- **Freeform `<Custom>`** — identical in all three, and excellent: it is literally
  today's `PlotCtx` (`sandbox/sdk.tsx:300`) handed to the author. Real, not
  aspirational. Cheapest possible "library, not cage" hatch.
- **Emulation `step(state, dt) → Δstate`** — identical and clean; RK4 is ~8 legible
  lines; discrete (`rate`) vs continuous (`dt`) is one option. Only nit (all three
  flagged): a 2-var system rides on flat store keys — wants a `rk4(deriv)` / vector
  helper (deferred to W4).
- **Interaction `onMove`/`onChange`** — a one-liner everywhere.

The differentiator is **the director**.

## Comparison — the director

| | Shape A · imperative | Shape B · declarative | Shape C · scene-fn |
|---|---|---|---|
| Sequencing model | `dir.play(sequence([...]))` — Manim-native | `<Timeline><Draw/><Animate/>` | `ctl.play(ctl.sequence([...]))` |
| **Chains state-derived beats?** | **Yes** — beats are JS closures read live at play-time (`playMany` = a loop) | **No** — beats frozen at render; only works when the recurrence unrolls *purely*; else forced back to `onDone` callbacks + `playToken++` | Partial — thunk beats commit, but `tweenTo` targets are static, so multi-step is precomputed in the handler |
| Render legibility | declarative marks read the store | most React-idiomatic; self-documenting under repair | pure `fn(state)`, but handlers pile *inside* render |
| LLM-authorability | good; `s.x0` dual-read footgun | **strongest** | strong render; `ctl`-threading seam, stale captures on mid-animation drag |

## Decision — **Shape A (imperative director), amended**

Rationale:

- **It matches the animation model already chosen** (Manim-style director =
  imperative `play`/`sequence`/`stagger`). B's declarative timeline actively fights
  that model — it *cannot* chain state-derived beats, which is the director's whole
  job; its legibility is partly illusory (clean for the easy case, leaks to
  imperative `onDone` for the real one).
- **A dominates C.** Both are imperative-director; C's only real upside (native
  freeform) is *identical* in A (`<Custom>` is a `<Plot>` child in both), while C
  adds a genuine seam — handlers must live inside the render fn, and a drag
  mid-animation makes captured tween targets stale. A has neither problem.
- **A keeps B's best trait for free:** its render is already fully declarative
  (marks read the store); imperative code is confined to the director/handlers. So
  A ≈ *declarative render + imperative director* — B's legible render with A's
  capable director.
- **A's dominant weakness (friction #1) is the most fixable in an imperative
  director** — see the amendment.

## The amendment — the director owns its animation channels

Kill friction #1 by **separating presentation state from domain state**. Transient
view quantities are **not** author-invented `useStage` keys; they are channels the
**director owns**. Semantic commits still go through the store.

```ts
// semantic (domain) state — what the lesson is *about*
const s   = useStage({ x0: -1.5, iters: [] })

// presentation channels — owned by the director, never in the domain store
const dir = useDirector({ climb: 0, tan: 0, slide: 0 })
//   dir.climb / dir.tan / dir.slide   → current channel values, read in render
//   dir.playing                        → boolean
//   dir.play(beat)  : Promise<void>    → run a timeline on the engine clock
//   dir.reset()                        → snap ALL channels to their initial; cancel in-flight

// beats
tween(channel: string, to: number, opts?: { duration?; ease?; delay? })  // channel-scoped — no store threading
call(fn: () => void)                                                       // zero-duration beat (e.g. a semantic commit)
sequence(beats), stagger(beats, { each }), wait(seconds)
```

What this buys, concretely, versus the raw spike:
- **No view scalars in the domain store** — `s` holds only `x0`/`iters`.
- **One reset, not N.** Interaction handlers call `dir.reset()` once instead of
  enumerating `{climb:0,tan:0,slide:0}` in every handler → the "miss one and it
  half-draws" bug is structurally impossible.
- **Semantic vs presentation is explicit:** `tween("climb", 1, …)` moves a channel;
  `call(() => s.set({ x0: xNext }))` commits domain state. Direction and state are
  no longer tangled in one bag.
- **Chaining is preserved** (A's strength): `sequence`/`stagger` of closures read
  live state at play-time.

Everything else is adopted verbatim from the spike consensus: `<Custom>` = today's
`PlotCtx`; `useSimulation(s, (st,dt)=>Δ, {rate|dt})`; `Plot.Segment` + a `constrain`
axis lock on `MovablePoint` (new marks the lesson needs).

## Handler-read rule (defuses A's one footgun)

`s.field` read **during render** subscribes; read **inside a handler / beat builder**
it returns the latest value. Document `s.get()` for the explicit snapshot case so an
LLM never captures a stale value in a closure.

## What W1 inherits

- Build the **Stage core** as: `useStage` (domain) + `useDirector` (owns channels +
  clock timeline) + `useSimulation` (stepper) + a pure render over `<Plot>`/marks.
- The **golden reference lesson** demonstrating the amended API is promoted to
  `sdk/examples/newton.lesson.tsx` — it is simultaneously the API decision made
  concrete, the pipeline few-shot, and the Phase-2 acceptance target.
- **One detail to finalize in W1 implementation:** the exact channel mechanism —
  the `useDirector(initialChannels)` bag above is the chosen shape; whether channels
  are later refined into *mark-scoped* `drawTo(mark)` (both A and C authors wished
  for it) is a Phase-3 nicety, not needed for the slice.

---

## UPDATE (W1 lock, 2026-07-23) — mark-scoped supersedes the channel bag

Direction call: **pull the mark-scoped idea forward into W1** (not Phase 3), and
adopt **Mafs** as the substrate and **Motion** as the interpolation engine. The
channel-bag amendment above is **superseded** — retained here for the reasoning
trail, but the built API is mark-scoped. The synergy that made this cheap: Motion's
`pathLength` MotionValue and imperative `animate(value, target)` map *directly* onto
`drawTo`/`transformTo`, so retained-mode is arguably *simpler* to build on Motion
than the channel bag was.

### The mark-scoped API (what W1 builds)

```ts
const s = useStage({ x0: -1.5, iters: [] })   // DOMAIN state only

// MARK IDENTITY — a handle you attach to a mark via `mark={...}`.
// Two flavors of animatable prop live on the handle:
//   · drawable marks (Segment/Line/OfX/Polygon) expose a `pathLength` (draw-on)
//   · all marks expose position (x,y,…) + `opacity` as Motion MotionValues
const vert   = useMark()          // a segment to reveal
const marker = useMark({ x: -1.5 }) // a point to move; position lives on the handle

const dir = useDirector()

// BEATS — each targets a specific mark (or the store):
drawTo(mark, opts?)                 // animate pathLength 0→1 (reveal). Geometry stays declarative.
transformTo(mark, { x, y, … }, opts?) // animate the mark's own position values
fadeTo(mark, opacity, opts?)
call(fn)                            // zero-duration; semantic commit via s.set(...)
sequence(beats) | parallel(beats) | stagger(beats, { each }) | wait(seconds)

dir.play(beat): Promise<void>
dir.playing: boolean
dir.reset(): void                   // pathLengths→0, stop transforms, cancel in-flight (ONE call on interaction)
```

### The key semantic that resolves "who owns position"

- **Draw-on** (`drawTo`): the mark's **geometry is declarative** (endpoints bound to
  state/props); only the *reveal fraction* (`pathLength`) is animated. No conflict.
- **Move** (`transformTo`): the mark's **position lives on its handle** (a
  MotionValue), not in the store; the mark renders from the handle. Interactive,
  state-bound marks (the draggable guess) are separate and never director-animated.

So a figure cleanly splits into **state-bound** marks (interaction) and
**handle-bound** marks (scripted motion) — the same domain/presentation separation
that killed friction #1, now enforced by *which* binding a mark uses rather than by
author discipline.

### Substrate: Mafs, wrapped

`Plot.*` (`OfX`/`Point`/`MovablePoint`/`Segment`/`Polygon`) become thin wrappers over
Mafs primitives, extended with the `mark` handle. Wrapping (vs. authoring raw Mafs)
keeps the authoring surface ours + stable, lets us inject the mark/animation layer,
and keeps Mafs swappable for Canvas/3D later. Director-animated geometry that Mafs
can't express is rendered by our own SVG layer (the `<Custom>` path) driven by the
same MotionValues.

### Accepted costs (tracked as roadmap TODOs)

Bundle jump (Mafs + Motion on ~4.1 MB), a real Mafs integration + React-19 peer
resolution, and rewriting the golden lesson to the mark-scoped shape.
