# Shape B — fully declarative components (W0 spike)

Everything a figure does is JSX. There are **no imperative director calls** (`dir.play(...)`),
no `useDirector`, no `useSimulation`. The three drivers are components/props:

| Driver | Surface | In `newton.lesson.tsx` |
| --- | --- | --- |
| interaction | `onMove` / `onChange` props on marks & controls | `<Plot.MovablePoint onMove>` drags `x0` |
| direction | `<Timeline>` of `<Draw>` / `<Animate>` beats | animated single step + staggered staircase |
| emulation | `<Simulate step running>` | discrete Newton iteration |
| freeform | `<Custom>{({xToPx,…}) => <path/>}` | shaded tangent triangle |

This doc is the contract the lesson assumes. Nothing here is implemented (design spike only).

---

## (a) Std-lib signatures this lesson assumes

### Store — `useStage`

```ts
// One reactive store per figure. `s` is a plain snapshot object (read in JSX);
// `set` shallow-merges a partial, or takes an updater. Re-render is a pure
// function of `s`. All three drivers write through `set` (directly, or via the
// <Stage> context for the motion components).
function useStage<S extends object>(initial: S): [S, (patch: Partial<S> | ((prev: S) => Partial<S>)) => void]
```

### `<Stage>` — driver context provider

```tsx
// Wraps the figure and hands the store setter to the declarative motion drivers
// (Animate / Timeline / Simulate) so they can write without threading `set`
// through every prop. Marks read `s` from closure as usual.
<Stage set={setter}>{children}</Stage>
```

### Coordinate substrate — reuse `<Plot>` (from `sandbox/sdk.tsx`)

`<Plot x y height>` and the existing `Plot.OfX`, `Plot.Point`, `Plot.MovablePoint` are kept.
Marks below are **new** and needed by the Newton figure:

```tsx
// A finite segment between two figure-coordinate points.
<Plot.Segment from={[number, number]} to={[number, number]} color? dashed? width? />

// A line given a point and a slope; `clip` bounds it to an x-range (for tangents).
<Plot.Line point={[number, number]} slope={number} clip?={[number, number]} color? width? />

// A polyline through figure-coordinate points (the Newton staircase beat).
<Plot.Path points={Array<[number, number]>} color? width? dashed? />

// Existing Point gains an explicit radius `r` and keeps `label` (KaTeX-rendered).
<Plot.Point x y color? label? r? />

// Existing MovablePoint gains `lockY` (pin to the x-axis; onMove.y stays as passed).
<Plot.MovablePoint x y onMove={(p:{x:number;y:number}) => void} lockY? color? />
```

### Direction (declarative motion)

```tsx
// Tween store fields over clock time. Writes to the <Stage> store on each frame.
// `from` defaults to the store's current values. Fires when used as a Timeline
// beat (see below) or standalone with a `when` trigger.
<Animate
  to={Partial<S>}                 // target field values
  from?={Partial<S>}              // start values (default: current store)
  duration={number}               // seconds
  ease?={"linear" | "cubicOut" | "cubicInOut" | "spring"}
  when?={unknown}                 // standalone: (re)play whenever this value changes
  onDone?={() => void}
/>

// Reveal a wrapped mark progressively (stroke-dash draw-on), 0% → 100% over
// `duration`. The single child is any Plot mark with stroke geometry.
<Draw duration={number} ease?={Ease}>{markElement}</Draw>

// Sequence beats. Children ARE the beats, played in document order. Each beat is
// a <Draw> or <Animate> and declares its own `duration`. The Timeline (re)plays
// whenever `play` changes value (bump an integer token in the store).
//   - sequential (default): beat i+1 starts when beat i ends.
//   - stagger={dt}: beat i starts at i*dt (overlapping draw-on for staircases).
<Timeline
  play={unknown}                  // trigger: replay on change
  stagger?={number}               // seconds between beat starts (else strictly sequential)
  onStart?={() => void}
  onDone?={() => void}
>{beats}</Timeline>
```

Semantics a beat relies on: while a `<Draw>`/`<Animate>` beat is *pending* it renders
nothing; while *active* it renders partial geometry / tweens; when *done* it holds its
final frame until the Timeline is re-triggered.

### Emulation

```tsx
// A stepper registered with the engine clock. Two modes:
//   continuous — onStep(state, dt) runs every frame, dt = real clock delta (ODEs).
//   discrete   — step(state) runs every `every` seconds (iterations/maps).
// Either callback receives the LIVE store and returns a Partial<S> to merge.
// `stop` (optional) halts and clears `running` when it returns true.
<Simulate
  running={boolean}
  onStep?={(state: S, dt: number) => Partial<S>}   // continuous
  step?={(state: S) => Partial<S>}                  // discrete
  every?={number}                                    // discrete tick interval (s)
  rate?={number}                                     // clock speed multiplier (default 1)
  stop?={(state: S) => boolean}
/>
```

### Freeform escape hatch

```tsx
// Render-callback given the Plot's coordinate transforms; return raw SVG in
// figure coordinates. Used for anything the marks don't provide (filled polygons,
// custom arrowheads, gradients).
<Custom>{(t: {
  xToPx: (x: number) => number
  yToPx: (y: number) => number
  pxToX: (px: number) => number
  pxToY: (px: number) => number
  width: number
  height: number
}) => React.ReactNode}</Custom>
```

### Reused verbatim from `sandbox/sdk.tsx`

`Section`, `Prose`, `Callout`, `Steps`/`Step`, `Math`, `Exercise`, `MultipleChoice`/`Option`,
`Hint`, `Slider`, `Toggle`, `NumberInput`, `fmt`, `math`, `track`, `LessonMeta`.

---

## (b) Continuous ODE with RK4 — pendulum θ'' = −(g/L)·sinθ

Snippet only (not a full lesson) — validates that the **same** `<Simulate>` that ran a
discrete Newton iteration also expresses a continuous integrator. The author writes RK4
by hand (no imports); the engine only supplies `dt`.

```tsx
export default function Pendulum() {
  const [s, set] = useStage({ theta: 2.4, omega: 0, running: true }) // start near-horizontal

  const g = 9.81, L = 1
  // State derivative: d/dt [θ, ω] = [ω, −(g/L) sinθ]
  const deriv = (st: { theta: number; omega: number }) => ({
    theta: st.omega,
    omega: -(g / L) * Math.sin(st.theta),
  })

  // Classic RK4 over the 2-field substate.
  const rk4 = (st: { theta: number; omega: number }, dt: number) => {
    const add = (a: any, b: any, h: number) => ({ theta: a.theta + b.theta * h, omega: a.omega + b.omega * h })
    const k1 = deriv(st)
    const k2 = deriv(add(st, k1, dt / 2))
    const k3 = deriv(add(st, k2, dt / 2))
    const k4 = deriv(add(st, k3, dt))
    return {
      theta: st.theta + (dt / 6) * (k1.theta + 2 * k2.theta + 2 * k3.theta + k4.theta),
      omega: st.omega + (dt / 6) * (k1.omega + 2 * k2.omega + 2 * k3.omega + k4.omega),
    }
  }

  return (
    <Stage set={set}>
      <Plot x={[-1.5, 1.5]} y={[-1.5, 0.5]}>
        {/* Freeform: the rod + bob at (L sinθ, −L cosθ). */}
        <Custom>
          {({ xToPx, yToPx }) => {
            const bx = L * Math.sin(s.theta), by = -L * Math.cos(s.theta)
            return (
              <g>
                <line x1={xToPx(0)} y1={yToPx(0)} x2={xToPx(bx)} y2={yToPx(by)} stroke="#7b5bd6" strokeWidth={3} />
                <circle cx={xToPx(bx)} cy={yToPx(by)} r={12} fill="#2f6df0" />
              </g>
            )
          }}
        </Custom>

        {/* Continuous driver: RK4 every frame with the engine's dt. */}
        <Simulate running={s.running} onStep={(st, dt) => rk4(st, dt)} rate={1} />
      </Plot>

      <Toggle checked={s.running} onChange={(v) => set({ running: v })} label="run" />
    </Stage>
  )
}
```

Ergonomics read: the integrator itself is *clean* in this shape — `onStep(state, dt)` is a
pure `(state, dt) → Δstate` callback, exactly the mathematical object, and it receives the
**live** state so chaining is correct. The declarative wrapper adds nothing to fight. The one
seam is that RK4 wants a **vector** state but the store is a flat record, so the author writes
`add(...)` helpers to do component-wise arithmetic. A std-lib `vec`/`rk4(deriv)` helper (or
letting a store field hold an array) would remove that boilerplate; worth adding in W4.

---

## (c) Honest assessment

### LLM-authorability — **strong**

This is the most React-idiomatic of the shapes, and that plays to an LLM's training
distribution. There is one mental model — "state renders; components write state" — and no
second imperative timeline API to learn. Marks read `s.field`; interaction is an `onMove`
one-liner; a step is JSX you can read top-to-bottom. An LLM that can write React can write
this with little Stage-specific knowledge. The declarative surface is also **self-documenting
under repair**: a broken beat is a visibly wrong `<Draw>`/`<Animate>` element, not a mis-ordered
imperative call buried in a callback.

### Freeform-friendliness — **good, with a coordinate seam**

`<Custom>` slots in naturally *as a mark* (`newton.lesson.tsx` shades the tangent triangle as
one JSX element among the others), which is nicer than an imperative "draw callback" bolted to
the side. Limits: it hands you SVG in figure coords and nothing more — no animation of a
`<Custom>` payload except by having it read tweened store values (which works: the pendulum bob
is a `<Custom>` reading `s.theta`). Draw-on / morph of freeform geometry would need `<Custom>`
to participate in `<Draw>`, which the current contract doesn't specify.

### Director expressiveness — **the strain point**

Two distinct frictions, both real signal:

1. **Snapshot-at-render vs. chained beats (the biggest friction).** Declarative beat targets
   are computed *in render*, from the current store snapshot. A single step is fine — when
   "Play" fires, `x0` hasn't moved, so `xNext = newton(s.x0)` is right, and `onDone` commits it.
   But a genuinely *chained* multi-step timeline — beat 2's start depends on beat 1's committed
   result — **cannot** be expressed as one Timeline, because all beats' props are frozen at the
   same render. In imperative shapes you'd write `sequence([step(), step(), step()])` and each
   closure reads live state. Here I had **two escapes**, and it's worth being precise about which
   worked:
   - *It worked for Newton* only because the recurrence is a **closed pure function I could
     unroll in render** (`trace` precomputes every iterate), so no beat depends on another beat's
     mid-flight write. The staggered staircase is genuinely clean *because of that property*.
   - *It would not work* if a beat's target depended on interaction, RNG, or a simulation value
     produced mid-timeline — there is no pure unroll to precompute. You'd be forced back to
     one-step-per-trigger (what "Play one step" does) or to smuggle logic into `onDone`
     callbacks, which quietly re-introduces the imperative sequencing this shape is trying to
     avoid. **Verdict: declarative sequencing is legible but only composes when the whole
     sequence is a pure function of one snapshot.**

2. **Beat metadata clutter.** Because children carry their own timing (`duration` on each
   `<Draw>`, `stagger` on the Timeline), a 3-beat step is readable but a 6-beat one starts to
   sprawl, and there's ambiguity the contract has to pin down: does `stagger` offset whole beats
   or individual draws? does a done beat hold or fade? Sequential-vs-stagger being a single prop
   is a nice default but can't express "beats 1–2 sequential, then 3–4 together" without nesting
   Timelines.

### Friction I actually hit writing the lesson

- **Two representations of "the current step."** I keep a live static preview (`s.step==="idle"`)
  *and* a Timeline that re-draws the same geometry animated, gated on `step`, because a beat that
  only renders during its active window would otherwise pop in/out. That gate (`{s.step==="idle"
  && …}`) is bookkeeping the author must remember; an imperative director would just play over
  the always-present marks.
- **Trigger tokens.** "Replay when `play` changes" means the author threads integer tokens
  (`playToken`, `revealToken`) and bumps them in `onClick`. It works and is explicit, but it's a
  React-ism (key-like reset) rather than an obvious "play" verb — a mild authorability tax.
- **Store must hold view-only state.** `xMark` (the animated marker) and `step` (the phase flag)
  live in the same store as the semantic `x0`/`history`. Direction's tween target *has to* be a
  store field, so animation scratch state leaks into the model's state object. Minor, but it
  blurs "state" vs "presentation."
- **Emulation was frictionless** by contrast — `step(state)` / `onStep(state, dt)` receive live
  state and return a patch, so the discrete Newton loop and the continuous RK4 pendulum are both
  short and correct. The contrast is the headline finding: **emulation callbacks get live state
  (clean); direction beat-props get a render snapshot (strained).**

### One-paragraph verdict

Shape B is the most legible and most LLM-authorable of the shapes — one mental model, pure
React, `<Custom>` as a first-class mark, and emulation that reads like the math (`(state,dt) →
Δstate`). It pays for that legibility at the director: because beat targets are frozen at render
time, a declarative Timeline can only sequence motion that is a **pure function of a single
state snapshot**. Newton survives cleanly *only* because its recurrence unrolls purely, letting
me precompute every beat; the moment a multi-beat sequence needs a value produced *during* the
timeline (interaction, RNG, or a running sim), the shape forces you back to one-step-per-trigger
or into `onDone` callbacks that quietly rebuild imperative sequencing. **Biggest friction: no
clean way to chain beats whose inputs are computed mid-timeline** — declarative sequencing trades
away exactly the state-flows-between-beats flexibility that a director's sequence/stagger gives
for free.
