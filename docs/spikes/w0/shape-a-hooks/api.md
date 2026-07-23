# Spike W0 · Shape A — "hooks + imperative director"

Design notes for the Stage authoring API as exercised by `newton.lesson.tsx`.
Shape A keeps state in **hooks** and drives the timeline through an **imperative
director** (`dir.play(...)`). This file documents (a) the exact std-lib
signatures the lesson assumes, (b) an RK4 continuous-ODE snippet to stress the
integrator ergonomics, and (c) an honest assessment of the shape.

Nothing here is implemented — this is a design artifact + a hand-authored lesson.

---

## (a) Assumed std-lib signatures

All names are injected in scope (no imports), same convention as `sandbox/sdk.tsx`.
Reused as-is from today's SDK: `Plot`, `Plot.OfX`, `Plot.Point`, `Plot.MovablePoint`,
`Slider`, `Prose`, `Callout`, `Steps`/`Step`, `Math`, `Exercise`, `MultipleChoice`,
`Option`, `Hint`, `Section`, `fmt`, `math`. New Stage surface below.

### The store — `useStage`

```ts
type Store<S> = S & {
  /** Merge a partial (or an updater) into the store; triggers re-render. */
  set(patch: Partial<S> | ((prev: S) => Partial<S>)): void
  /** Non-subscribing snapshot — for reads inside event handlers / director builders. */
  get(): S
}

function useStage<S extends object>(initial: S): Store<S>
```

- **Reading** `s.x0` **during render** subscribes that component to `x0`.
- **Reading** `s.x0` **inside a handler or a director builder** returns the latest
  value without subscribing (sugar over `s.get().x0`).
- All three drivers write through `s.set(...)` — it is the single mutation path.
  `render` is a pure function of the store (the §1 invariant).

### The director — `useDirector` + play helpers

```ts
type Beat = { readonly __beat: unique symbol }   // opaque timeline node
type Ease = "linear" | "easeIn" | "easeOut" | "easeInOut"

type Director = {
  /** Run a beat on the engine clock; resolves when it finishes. */
  play(beat: Beat): Promise<void>
  playing: boolean
  stop(): void   // halt the current beat, leave the store where it is
}
function useDirector(): Director

// Beat constructors (global helpers):
function tweenTo<S>(s: Store<S>, target: Partial<S>,
                    opts?: { duration?: number; ease?: Ease; delay?: number }): Beat
function set<S>(s: Store<S>, patch: Partial<S>): Beat   // instantaneous store write
function wait(seconds: number): Beat
function sequence(beats: Beat[]): Beat                  // one after another
function parallel(beats: Beat[]): Beat                  // all at once
function stagger(beats: Beat[], opts?: { each?: number }): Beat // offset starts
```

`tweenTo` interpolates the numeric keys of `target` from their current store
values over `duration`, writing every frame — so any mark reading those keys
animates. Non-numeric keys are set at the end.

### Marks (additions to `Plot`)

```ts
// Straight segment in figure coords; reads any store-derived endpoints.
Plot.Segment(props: {
  x1: number; y1: number; x2: number; y2: number
  color?: string; dashed?: boolean; strokeWidth?: number
}): JSX.Element

// MovablePoint gains an axis constraint so a guess can live on the x-axis.
Plot.MovablePoint(props: {
  x: number; y: number; onMove(p: { x: number; y: number }): void
  color?: string
  constrain?: "horizontal" | "vertical" | "none"   // NEW: pin one axis while dragging
}): JSX.Element

Plot.Point(props: { x; y; color?; label?: string }): JSX.Element  // label supports KaTeX
```

### Freeform escape hatch — `<Custom>`

```ts
type Transforms = {
  xToPx(x: number): number; yToPx(y: number): number
  pxToX(px: number): number; pxToY(py: number): number
  xd: [number, number]; yd: [number, number]; w: number; h: number
}
// draw returns raw SVG in *pixel* space; transforms map from figure coords.
// Must be a child of <Plot> (consumes the same PlotContext the marks use).
function Custom(props: { draw(t: Transforms): React.ReactNode }): JSX.Element
```

This is exactly today's `PlotCtx` (`sandbox/sdk.tsx:300`) handed to the author —
the cheapest possible "library, not cage" hatch: full SVG, figure-coord math done
for you. The Newton lesson uses it for the shaded tangent triangle + arrowhead.

### Simulation — `useSimulation`

```ts
type SimHandle = {
  running: boolean
  start(seed?: number): void   // begin stepping on the clock
  stop(): void                 // pause
  toggle(): void
  reset(): void                // stop + clear internal accumulator
}

function useSimulation<S>(
  s: Store<S>,
  // Return a partial merged into the store, or null/undefined to HALT the sim.
  step: (state: S, dt: number) => Partial<S> | null | undefined,
  opts?: {
    rate?: number     // DISCRETE maps: call step `rate` times/sec (dt = 1/rate)
    dt?: number       // CONTINUOUS integrators: fixed substep; the clock runs as
                      // many substeps/frame as needed to keep real-time (decoupled
                      // from render fps). Mutually exclusive with `rate`.
    autostart?: boolean
    seed?: number     // seeds an injected `rng` (mulberry32) for reproducible sims
  },
): SimHandle
```

The Newton lesson uses the **discrete** form (`{ rate: 1.6 }`) — one iteration of
`x_{n+1}=x_n−f/f'` per tick, halting via `return null` on convergence.

---

## (b) Continuous ODE via RK4 — pendulum `θ'' = −(g/L) sin θ`

The *same* `useSimulation` handles a continuous system through the `dt` (fixed
substep) form. This is a snippet, not a full lesson — it shows the integrator
ergonomics of Shape A.

```tsx
export default function Pendulum() {
  const s = useStage({ theta: Math.PI / 2 - 0.05, omega: 0, g: 9.8, L: 1 })

  // RK4 on the first-order system  y = [θ, ω],  y' = [ω, −(g/L) sin θ].
  const sim = useSimulation(
    s,
    (st, dt) => {
      const deriv = (th: number, w: number): [number, number] =>
        [w, -(st.g / st.L) * Math.sin(th)]
      const [th, w] = [st.theta, st.omega]
      const [k1a, k1b] = deriv(th, w)
      const [k2a, k2b] = deriv(th + 0.5 * dt * k1a, w + 0.5 * dt * k1b)
      const [k3a, k3b] = deriv(th + 0.5 * dt * k2a, w + 0.5 * dt * k2b)
      const [k4a, k4b] = deriv(th + dt * k3a, w + dt * k3b)
      return {
        theta: th + (dt / 6) * (k1a + 2 * k2a + 2 * k3a + k4a),
        omega: w + (dt / 6) * (k1b + 2 * k2b + 2 * k3b + k4b),
      }
    },
    { dt: 1 / 240, autostart: true }, // 240 Hz substep, decoupled from render fps
  )

  const L = s.L
  const bob = { x: L * Math.sin(s.theta), y: -L * Math.cos(s.theta) }

  return (
    <Plot x={[-1.5, 1.5]} y={[-1.6, 0.4]}>
      <Custom
        draw={({ xToPx, yToPx }) => (
          <line x1={xToPx(0)} y1={yToPx(0)} x2={xToPx(bob.x)} y2={yToPx(bob.y)}
                stroke="#8a93a3" strokeWidth={2} />
        )}
      />
      <Plot.Point x={bob.x} y={bob.y} color="blue" />
      <Slider value={s.L} onChange={(L) => s.set({ L })} min={0.5} max={2} label="L" />
      <button onClick={() => sim.toggle()}>play / pause</button>
      {/* The learner can still DRAG the bob mid-swing → an interaction driver
          write to {theta, omega:0} that the integrator picks up next substep. */}
    </Plot>
  )
}
```

Ergonomics verdict on the integrator: **clean.** `step(state, dt) → partial` is a
pure function, RK4 is ~8 legible lines, and the `dt` substep decoupling is a single
option. The only awkwardness is that a 2-var system rides on flat store keys
(`theta`/`omega`) instead of a vector — fine here, but a stiff/high-dimensional
system would want an array-valued key and a helper like `rk4(deriv, y, dt)`.

---

## (c) Honest assessment

### LLM-authorability — **good, with one sharp edge**
The hooks core (`useStage` / `s.set`) is the shape LLMs already produce fluently —
it is `useState` with a merge. Reading `s.x0` in render and calling `s.set({x0})`
in a handler needs no ceremony. The Newton lesson came out at roughly the size and
rhythm of the parabola golden lesson.

The sharp edge is the **dual read semantics of `s.x0`** (subscribe in render vs.
snapshot in a handler). It reads naturally but is a genuine footgun: an LLM that
reads `s.x0` inside a `setInterval`/closure and expects the *latest* value is
right; one that captures it expecting a *frozen* value is wrong. `get()` exists for
the honest case but nothing forces its use.

### Freeform-friendliness — **excellent**
`<Custom draw={({xToPx,yToPx}) => <svg/>} />` is the strongest part. It is exactly
today's `PlotCtx`, so it's real, not aspirational. The tangent triangle + arrowhead
(figure-coord math, raw SVG, opacity tied to a store scalar) was the easiest part
of the lesson to write and the most expressive. This validates "library, not cage."

### Director expressiveness — **capable but verbose, and it fights `render`**
`sequence([...])` reads top-to-bottom like a storyboard and composing four steps
was just a JS loop (`playMany`) — a real strength of the *imperative* builder.

Two honest weaknesses:
1. **No retained-mode "draw" primitive.** The task sketch imagined
   `drawTo(tangentMark, ...)`. That implies a handle to a *specific mark instance*
   to animate its path length — which fights the pure `render(state)` model, where
   marks are re-derived every frame and have no identity. I resolved it by
   animating **store scalars** (`climb`, `tan`, `slide` ∈ [0,1]) and having marks
   read them. It works and stays pure, but it pushes "draw progress" bookkeeping
   into author-space: the store grew three animation-only keys that are really
   *view* state, not *domain* state. A `drawTo` that the engine desugars into a
   hidden scalar tween would remove that boilerplate.
2. **Commit-then-reset choreography is manual.** Ending a step with
   `set(s, {x0: xn})` and re-staging the next step's scalars is author-managed. A
   `transformTo(a → b)` transform (Phase 3) would absorb this.

### The biggest friction point
The **animation-scalar leakage into the store.** Because the director can only move
the store and `render` is pure, every animated quantity that isn't already a domain
variable must be materialized as a store key the author invents, threads through
`set`/`tweenTo`, reads in render, and resets on interaction (note the
`{climb:0, tan:0, slide:0}` reset duplicated in *both* `onMove` and the slider's
`onChange` — miss one and a drag leaves a half-drawn tangent on screen). For this
one figure it's three keys; for a busy scene it's a bookkeeping tax that scales with
visual richness and is easy to get subtly wrong. This is the load-bearing friction
signal from Shape A: the imperative director is pleasant to *sequence*, but the
"everything is store state" purity makes **transient view state** the author's
problem. A director that owns its own tween channels (mark-scoped `drawTo`/
`transformTo`) would erase it.
