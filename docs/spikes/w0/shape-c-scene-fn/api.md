# Shape C — "scene render-function / pure `render(state)`"

Spike W0 API notes for the sibling of `newton.lesson.tsx`. The figure is a **pure
function of state**. `<Stage>` owns the store, the engine clock, and (optionally)
the emulator; the child is `(state, ctl) => marks`. Everything the three drivers
touch lives in one store; `render` never holds its own animation state.

```
        <Stage initial sim?> ── owns store + clock + emulator
                 │
        (state, ctl) => JSX  ── pure render; ctl in scope for handlers
                 │
   interaction ──┤ ctl.set(patch)
   direction   ──┤ ctl.play(ctl.sequence([...beats]))   ── tweens store fields
   emulation   ──┘ sim(state, dt) → state'              ── runs while ctl.running
```

---

## a) Std-lib signatures this lesson assumes

### `<Stage>` — the store/clock/emulator owner

```ts
interface StageProps<S extends object> {
  /** Initial store contents. The store's shape is exactly this object. */
  initial: S
  /** EMULATION driver. Called once per animation frame ONLY while ctl.running,
   *  with the elapsed seconds since the last call. Pure: returns the next
   *  state; the Stage swaps it in and re-renders. Omit for a figure with no
   *  continuous/iterated simulation. Determinism is relaxed — dt comes from the
   *  real clock; use the injected seeded rng() if you want reproducibility. */
  sim?: (state: S, dt: number) => S
  /** The scene as a pure function of state. Re-invoked on every store change
   *  (interaction, tween tick, or sim step). `ctl` is stable across renders. */
  children: (state: S, ctl: Controller<S>) => React.ReactNode
}
```

Reserved engine bookkeeping (`running`, the clock, in-flight tweens) is **kept
out of `initial`** — it lives on the Stage and is surfaced through `ctl`. Author
state stays semantic (`guess`, `iterates`, …).

### `Controller` — the `ctl` threaded into render

```ts
interface Controller<S> {
  /** INTERACTION + commits. Shallow-merge a patch into the store; re-renders.
   *  Applied immediately when called from an event handler. */
  set(patch: Partial<S>): void

  /** DIRECTION. Run a timeline; resolves when the last beat finishes.
   *  Playing again interrupts any timeline already in flight. */
  play(timeline: Beat<S> | Beat<S>[]): Promise<void>

  /** Compose beats into one sequential timeline. Items may be:
   *   · a tween spec from ctl.tweenTo(...)               (timed interpolation)
   *   · a plain thunk `() => void`                        (zero-duration; e.g.
   *     a ctl.set(...) commit fired at that point in time) */
  sequence(beats: Array<Beat<S> | (() => void)>): Beat<S>

  /** Run beats concurrently, each delayed by `every` seconds (Manim stagger). */
  stagger(beats: Beat<S>[], every: number): Beat<S>

  /** A single tween beat: interpolate the named store fields from their CURRENT
   *  values to `target` over `duration`. Targets are static values captured
   *  when the beat is built (see Friction). */
  tweenTo(target: Partial<S>, opts?: TweenOpts): Beat<S>

  /** EMULATION control. run()/pause() gate whether `sim` is ticked; `running`
   *  mirrors that flag so the pure render can branch on it. */
  run(): void
  pause(): void
  readonly running: boolean
}

type Ease = "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring"
interface TweenOpts { duration?: number; ease?: Ease; delay?: number }
type Beat<S> = { readonly __beat: unique symbol } // opaque timeline node
```

### `<Scene>` + marks — the substrate

`<Scene>` is the coordinate container (successor to today's `<Plot>`); marks are
the familiar `Plot.*` names, reused verbatim where they already exist in
`sandbox/sdk.tsx` and extended with two segment marks.

```ts
interface SceneProps {
  x: [number, number]           // x domain
  y: [number, number]           // y domain
  height?: number
  children: React.ReactNode     // marks (pure — positions come from `state`)
}

Plot.OfX:          (p: { y: Fn1; color?: Color }) => Mark
Plot.Point:        (p: { x: number; y: number; color?: Color; label?: string }) => Mark
Plot.MovablePoint: (p: { x: number; y: number; color?: Color;
                         onMove: (pt: { x: number; y: number }) => void }) => Mark
// extensions this lesson needs:
Plot.Segment:      (p: { from: [number, number]; to: [number, number];
                         color?: Color; style?: LineStyle }) => Mark
Plot.Line:         (p: { slope: number; through: [number, number]; color?: Color }) => Mark
```

`Plot.MovablePoint.onMove` reports both coordinates; a 1-D drag just ignores one
(the lesson locks `y = 0` by patching only `{ guess: p.x }`).

### `<Custom>` — freeform escape hatch

Children-as-function returning raw SVG, handed the figure↔pixel transforms. This
is the whole point of Shape C: since a mark is "a function of state returning
SVG", `<Custom>` is just a mark whose body you write by hand — no new concept.

```ts
interface CustomCtx {
  xToPx: (x: number) => number; yToPx: (y: number) => number
  pxToX: (px: number) => number; pxToY: (py: number) => number
  xd: [number, number]; yd: [number, number]; w: number; h: number
}
Custom: (p: { children: (ctx: CustomCtx) => React.ReactNode }) => Mark
// equivalently accepts `draw={(ctx) => …}` — identical semantics, per plan §1.
```

Injected helpers used above and unchanged from today's scope: `fmt`, `math`,
`Prose`, `Callout`, `Steps`/`Step`, `MultipleChoice`/`Option`, `Exercise`/`Hint`,
`Section`, and `Math`.

---

## b) Continuous ODE via `sim` — RK4 pendulum (integrator ergonomics)

Snippet only — shows that the **same** `sim(state, dt)` slot expresses a
continuous system `θ'' = -(g/L) sin θ` by advancing an RK4 step instead of a
discrete map. State carries `(θ, ω)`; a small fixed-step loop keeps the
integrator stable even when the frame `dt` is large or jittery.

```tsx
const g = 9.81, L = 1.2
// derivative of the state vector [θ, ω]
const deriv = (th: number, w: number) => [w, -(g / L) * Math.sin(th)] as const

// classic RK4 over a fixed micro-step h, sub-stepping to cover the frame dt
const rk4 = (th: number, w: number, h: number) => {
  const [k1t, k1w] = deriv(th, w)
  const [k2t, k2w] = deriv(th + 0.5 * h * k1t, w + 0.5 * h * k1w)
  const [k3t, k3w] = deriv(th + 0.5 * h * k2t, w + 0.5 * h * k2w)
  const [k4t, k4w] = deriv(th + h * k3t, w + h * k3w)
  return [
    th + (h / 6) * (k1t + 2 * k2t + 2 * k3t + k4t),
    w + (h / 6) * (k1w + 2 * k2w + 2 * k3w + k4w),
  ] as const
}

<Stage
  initial={{ th: 2.4, w: 0 }}                 // released from near-horizontal
  sim={(s, dt) => {
    let { th, w } = s
    const H = 1 / 240                          // fixed integrator step
    let t = Math.min(dt, 0.05)                 // clamp huge frames (tab refocus)
    while (t > 1e-6) { const h = Math.min(H, t); [th, w] = rk4(th, w, h); t -= h }
    return { th, w }
  }}
>
  {(s, ctl) => (
    <>
      <Scene x={[-1.6, 1.6]} y={[-1.6, 0.4]}>
        <Plot.Segment from={[0, 0]} to={[L * Math.sin(s.th), -L * Math.cos(s.th)]} color="ink" />
        <Plot.Point x={L * Math.sin(s.th)} y={-L * Math.cos(s.th)} color="blue" />
        {/* INTERACTION coexisting with the sim: grab the bob to re-aim θ */}
        <Plot.MovablePoint
          x={L * Math.sin(s.th)} y={-L * Math.cos(s.th)} color="orange"
          onMove={(p) => ctl.set({ th: Math.atan2(p.x, -p.y), w: 0 })}
        />
      </Scene>
      <button onClick={ctl.running ? ctl.pause : ctl.run}>
        {ctl.running ? "Pause" : "Swing"}
      </button>
    </>
  )}
</Stage>
```

The discrete (Newton) and continuous (pendulum) cases differ **only inside
`sim`** — same store, same render, same controls. That uniformity is Shape C's
best result: one slot covers "iterate a map" and "integrate an ODE," and the
learner can grab the bob mid-swing (`ctl.set`) because interaction and emulation
write the same store.

---

## c) Honest assessment

**LLM-authorability — strong for the render, sharp edge on the store shape.**
The render body reads like the parabola golden lesson: destructure `state`,
compute in JS, return marks. "The scene is a function of state" is a single rule
a model applies consistently, and `${fmt(...)}` prose falls out naturally because
the numbers are already in scope. The catch a model will trip on: **every
animated quantity must be pre-declared as a store field.** Drawing a growing
vertical means inventing `vertT`, drawing a partial tangent means `tanT`, sliding
a marker means `slideT`. The store balloons with animation bookkeeping mixed in
with semantic state (`guess`, `iterates`), and there's no locality — the field is
declared in `initial`, tweened in a handler, and read in render, three places
apart. A weaker model will forget to reset these fields after a step and leave a
stale tangent on screen (the lesson resets them explicitly in the final beat).

**Freeform-friendliness — excellent; the headline strength.** `<Custom>` is not a
bolted-on escape hatch here, it's the base case: a mark already *is* `state →
SVG`, so writing one by hand is the same mental model, just with the transforms
handed to you. The shaded tangent triangle + arrowhead dropped in with no
ceremony and composes with the declarative marks around it. Of the three shapes,
this is where freeform should feel most native.

**Director expressiveness — good vocabulary, awkward to aim.** `play/sequence/
stagger/tweenTo` cover the golden requirement (draw vertical → draw tangent →
slide marker) cleanly, and allowing plain thunks as beats is what makes the
mid-timeline **commit** (`guess := xNext`) expressible at all. But the director
can only tween *toward static targets*, and a Newton step's target is *derived
from current state*. So the whole chain of iterates has to be **pre-computed in
the event handler** (`playThree` computes `x1`, `x2` up front and flattens them),
because `tweenTo({ guess: ??? })` can't say "wherever the previous beat lands."
Anything data-dependent across beats leaks out of the timeline and into
hand-rolled JS.

**Biggest friction — the pure-render / imperative-controller seam, i.e.
threading `ctl`.** The premise is "render is a pure function of state," yet every
interesting thing happens by calling `ctl.set` / `ctl.play` — *side effects* —
from inside that supposedly-pure function. It works because handlers only *fire*
during events, not during render, but the contradiction is real and shows up
three ways:
  1. **Placement.** Handlers must live *inside* the render callback to close over
     both `state` and `ctl`; hoisting them out (the instinct, to keep render
     tidy) loses `ctl` or the current state. So control logic and draw logic pile
     into one function that reruns every frame, rebuilding every closure.
  2. **Stale captures.** A beat captures `guess` when the timeline is *built*, not
     when it *runs*. If the learner drags x0 mid-animation, `xNext` is stale and
     the marker slides to the wrong place. Mixing live interaction with scripted
     direction on the same field is genuinely fragile.
  3. **Two kinds of state.** Semantic state and animation-progress state share one
     store with no separation, and engine flags (`running`) had to be pulled *out*
     of the store onto `ctl` to keep `initial` honest — an asymmetry the author
     must remember (patch `guess` via `ctl.set`, but flip running via
     `ctl.run()`).

Net: Shape C nails "pure render + trivial freeform" and pays for it at the
imperative seam, where a pure function is asked to host the very side effects that
drive it — bearable for one figure, and the friction concentrates exactly where
the spike wanted signal: threading `ctl` and blending drag with scripted motion.
