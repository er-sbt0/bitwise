/**
 * Bitwise Lesson SDK — the standard library.
 *
 * Everything declared here is injected as an in-scope global inside the lesson
 * sandbox. A lesson is a default-exported React component that composes these
 * primitives — and, under the freeform pivot, is free to write its own helper
 * functions, math and SVG around them. This is a LIBRARY, NOT A CAGE.
 *
 * What still holds absolutely: no imports (nothing resolves inside the
 * sandbox), no network, no DOM escape. Those are enforced by ISOLATION — the
 * cross-origin iframe, the CSP, the `require` stub — not by a static gate over
 * the source.
 *
 * This file is the SINGLE SOURCE OF TRUTH for the SDK surface. One parser,
 * `sdk/surface.ts`, reads the annotations below; from it the authoring prompt
 * derives what it may advertise and the eval harness cross-checks the runtime.
 * Nothing else may hand-maintain a list of SDK names — change the surface by
 * editing THIS file.
 *
 * Every declaration (and every `Plot.*` member) carries two tags:
 *
 * ── @tier core | ext ─── curation. What belongs in the essential vocabulary.
 *   CORE — the vocabulary a lesson almost always reaches for.
 *   EXT  — richer/rarer primitives, grown as lessons ask for them.
 *
 * ── @status live | planned ─── truth. Whether the runtime implements it TODAY.
 *   LIVE     — implemented in the sandbox runtime right now, hence documented to
 *              the author and expected in the runtime scope.
 *   PLANNED  — declared here as intent, NOT yet implemented. Not advertised to
 *              the author until its `@status` flips to `live`.
 *
 *   @status no longer feeds a verifier allow-list (that gate is retired — see
 *   app/api/generate/verify.ts). It now feeds DOCUMENTATION and the eval drift
 *   gate: the harness fails when the contract and the runtime scope disagree,
 *   so "live" can never become a lie.
 *
 * tier and status are independent: a primitive can be `ext` yet `live`
 * (e.g. `Steps`), or `core`-worthy yet still `planned`. The prompt keys off
 * @status; @tier is informational curation.
 */

import type { ReactNode } from "react"

// ────────────────────────────────────────────────────────────────────────────
// 0 · Core scalar types
// ────────────────────────────────────────────────────────────────────────────

/** A math expression in standard notation, e.g. `"a*x^2 + b*x + c"`. */
export type MathExpr = string

/** A real-valued function of one variable, used by plots and graders. */
export type Fn1 = (x: number) => number

/** Named numeric bindings used to evaluate a {@link MathExpr}. */
export type Scope = Record<string, number>

/** Lesson metadata. Optional, but it is how the improvised curriculum feeds
 *  the learner model — the orchestrator reads it to know what was taught. */
export interface LessonMeta {
  /** Stable-ish slug for the concept this lesson targets. */
  concept: string
  /** Concept slugs a learner should know first. Informational, not enforced. */
  prerequisites?: string[]
  /** Human-readable learning objectives. */
  objectives?: string[]
  /** Rough difficulty, 1 (intro) – 5 (advanced). */
  difficulty?: 1 | 2 | 3 | 4 | 5
}

// ────────────────────────────────────────────────────────────────────────────
// 1 · Math engine  (backed by mathjs + nerdamer)
// ────────────────────────────────────────────────────────────────────────────

export interface MathAPI {
  /** Evaluate an expression with an optional variable scope. */
  evaluate(expr: MathExpr, scope?: Scope): number
  /** Compile once, evaluate many — cheaper inside animation loops. */
  compile(expr: MathExpr): (scope?: Scope) => number
  /** Algebraic simplification, e.g. `simplify("x + x") === "2 x"`. */
  simplify(expr: MathExpr): MathExpr
  /** Symbolic derivative w.r.t. `variable` (default `"x"`). */
  derivative(expr: MathExpr, variable?: string): MathExpr
  /** Symbolic equivalence — `equivalent("x^2-1", "(x-1)(x+1)") === true`.
   *  This is the check that makes graded answers learner-fair. */
  equivalent(a: MathExpr, b: MathExpr): boolean
  /** Format a number for display (fixed/sig-figs, thousands, etc.). */
  format(value: number, opts?: { digits?: number; sci?: boolean }): string
}

/** The math engine. Use this (or plain JS arithmetic) instead of ever writing
 *  a computed number as a prose literal.
 *  @tier core @status live */
export declare const math: MathAPI

/**
 * Format a number for display inside interpolated prose, e.g.
 * ``<Prose>{`The vertex is at (${fmt(h)}, ${fmt(k)}).`}</Prose>``.
 * Rounds sensibly and strips float noise like `0.30000000000000004`.
 * This is the sanctioned way to put a computed value into text.
 * @tier core @status live
 */
export declare function fmt(value: number, digits?: number): string

// ────────────────────────────────────────────────────────────────────────────
// 2 · State & lifecycle hooks
// ────────────────────────────────────────────────────────────────────────────

/**
 * Persisted, telemetry-wired lesson state. Behaves like `useState`, but the
 * value survives reloads and every change is (invisibly) tracked so the learner
 * model can see how the learner explored the lesson.
 *
 * @param key      Unique key within this lesson.
 * @param initial  Initial value.
 * @tier core @status live
 */
export declare function useLessonState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void]

/** Elapsed seconds since mount, for animations. Auto-pauses when the tab is
 *  hidden and returns a frozen value under `prefers-reduced-motion`.
 *  @tier ext @status live */
export declare function useTime(options?: { paused?: boolean }): number

/** Emit a custom telemetry event. Exercises and controls emit automatically;
 *  use this only for bespoke interactions worth measuring.
 *  @tier ext @status live */
export declare function track(event: string, data?: Record<string, unknown>): void

// Standard React hooks are also in scope. Prefer useLessonState for anything a
// learner changes.
/** @tier core @status live */
export declare const useState: typeof import("react").useState
/** @tier core @status live */
export declare const useEffect: typeof import("react").useEffect
/** @tier core @status live */
export declare const useMemo: typeof import("react").useMemo
/** @tier core @status live */
export declare const useRef: typeof import("react").useRef
/** @tier core @status live */
export declare const useCallback: typeof import("react").useCallback

// ────────────────────────────────────────────────────────────────────────────
// 3 · The Stage — one clock, one store, three drivers
// ────────────────────────────────────────────────────────────────────────────
//
// Every figure is a Stage: one engine-owned clock, one reactive domain store,
// one pure render, and three drivers that all reduce to "state changed →
// re-render" —
//
//   · interaction — a drag/slider/click writes the store,
//   · direction   — a Manim-style timeline moves specific MARKS,
//   · emulation   — a stepper `step(state, dt)` advances the store each tick.
//
// Because all three share one store and one render, a figure can be a guided
// animation the learner can also grab while a simulation runs underneath.
//
// The semantic that resolves "who owns a mark's position":
//   · STATE-BOUND marks take their geometry from the store (props read `s.*`).
//     Interaction moves them. `drawTo` may still reveal them — it animates only
//     the reveal fraction, so it never fights declarative geometry.
//   · HANDLE-BOUND marks keep their position on their own `useMark` handle and
//     are moved by `transformTo`. Presentation state never pollutes the store.

/** The domain store returned by {@link useStage}: your own fields, plus `set`
 *  and `get`. Read `s.field` during render to subscribe to it. */
export type Stage<T> = T & {
  /** Merge a patch into the store and re-render. The one write path shared by
   *  interaction handlers, `call(...)` beats, and the simulation stepper. */
  set(patch: Partial<T>): void
  /** An explicit snapshot of the current state. Use this inside a handler,
   *  closure or beat builder so you never animate toward a stale value. */
  get(): T
}

/**
 * The figure's DOMAIN state — what the lesson is *about*, and nothing else.
 * Transient view quantities (a reveal fraction, a sliding marker) belong on a
 * {@link useMark} handle instead, so an interaction never has to un-set them.
 *
 * ```tsx
 * const s = useStage({ x0: -1.5, iters: [] as number[] })
 * <Plot.Point x={s.x0} y={f(s.x0)} />            // render reads → subscribes
 * <Slider value={s.x0} onChange={(x0) => s.set({ x0 })} … />
 * ```
 * @tier core @status live
 */
export declare function useStage<T extends object>(initial: T): Stage<T>

/** The animatable values a mark handle carries. Drawable marks (`Segment`,
 *  `Polygon`, `OfX`) expose `pathLength`; every mark exposes position and
 *  `opacity`. */
export interface MarkValues {
  /** Reveal fraction, 0 → 1. Animated by {@link drawTo}; the mark's geometry
   *  stays wherever its props put it. */
  pathLength: number
  x: number
  y: number
  opacity: number
}

/** A handle giving a mark identity so the director can address it. Attach it
 *  with `mark={handle}` on any `Plot.*` mark — or read its channels live inside
 *  a {@link Custom} draw function to animate SVG you drew yourself. */
export interface Mark extends MarkValues {
  /** Set values INSTANTLY (no tween) — e.g. staging a marker at the current
   *  guess before playing a beat that slides it. */
  set(patch: Partial<MarkValues>): void
  /** The current value of any channel, including ones you invented. Equivalent
   *  to reading `mark.<name>`. */
  get(name: string): number
  /** Any channel you name in a `transformTo` patch, readable the same way. */
  readonly [channel: string]: any
}

/**
 * Give a mark identity. Pass `initial` when the mark is HANDLE-BOUND — i.e. its
 * position lives here rather than in the store, because the director moves it.
 *
 * ```tsx
 * const tangent = useMark()             // draw-on only; geometry stays declarative
 * const marker  = useMark({ x: -1.5 })  // position lives on the handle
 * <Plot.Segment mark={tangent} x1={…} y1={…} x2={…} y2={…} />
 * <Plot.Point   mark={marker} y={0} />
 * ```
 * @tier core @status live
 */
export declare function useMark(initial?: Partial<MarkValues>): Mark

/** Easing for a {@link BeatOptions} tween. @see BeatOptions */
export type Ease = "linear" | "easeIn" | "easeOut" | "easeInOut"

export interface BeatOptions {
  /** Seconds. Defaults to a sensible per-beat value. */
  duration?: number
  ease?: Ease
  /** Seconds to wait before this beat starts. */
  delay?: number
  /** Use a physics spring instead of an eased tween. `true` selects the
   *  `gentle` preset; `"gentle" | "snappy" | "bouncy"` pick a named preset; an
   *  object sets `{ stiffness, damping, mass }` (merged over `gentle`, so a
   *  partial object works). A spring is self-timed — do NOT combine it with
   *  `duration`/`ease`. Note `transformTo` already springs by default. */
  spring?: boolean | "gentle" | "snappy" | "bouncy" | { stiffness?: number; damping?: number; mass?: number }
}

/** One unit of scripted motion, produced by the beat builders and handed to
 *  `dir.play`. Opaque — compose beats, don't inspect them. */
export interface Beat {
  readonly __beat: true
}

export interface Director {
  /** Run a beat (usually a `sequence`) on the engine clock. Resolves when the
   *  timeline finishes, so `await` chains scripted moments. */
  play(beat: Beat): Promise<void>
  /** True while a timeline is running — disable the play button with it. */
  readonly playing: boolean
  /** Snap every mark back to its initial values and cancel anything in flight.
   *  Call this ONCE at the top of an interaction handler; it is what makes
   *  "drag mid-animation" clean instead of leaving a half-drawn figure. */
  reset(): void
}

/** The direction driver — a Manim-style timeline over marks.
 *  @tier core @status live */
export declare function useDirector(): Director

/** Reveal a drawable mark by animating its `pathLength` 0 → 1. Geometry is
 *  untouched, so this composes with state-bound marks.
 *  @tier core @status live */
export declare function drawTo(mark: Mark, opts?: BeatOptions): Beat

/** Move a handle-bound mark by animating its own position values. Movement
 *  springs by default (the `gentle` preset) for a natural, physical settle;
 *  pass a `duration` or `ease` to fall back to an eased tween, or a `spring`
 *  opt to choose a different spring.
 *  @tier core @status live */
export declare function transformTo(
  mark: Mark,
  target: Partial<Pick<MarkValues, "x" | "y" | "opacity">>,
  opts?: BeatOptions,
): Beat

/** Animate a mark's opacity. @tier core @status live */
export declare function fadeTo(mark: Mark, opacity: number, opts?: BeatOptions): Beat

/** A zero-duration beat: run `fn` at this point in the timeline. This is how a
 *  scripted moment COMMITS to the domain store (`call(() => s.set({ x0 })))`).
 *  @tier core @status live */
export declare function call(fn: () => void): Beat

/** Play beats one after another. @tier core @status live */
export declare function sequence(beats: Beat[]): Beat
/** Play beats at the same time. @tier core @status live */
export declare function parallel(beats: Beat[]): Beat
/** Play beats together but offset by `each` seconds — the reveal-a-family move.
 *  @tier core @status live */
export declare function stagger(beats: Beat[], opts: { each: number }): Beat
/** A pause of `seconds`, for breathing room between beats.
 *  @tier core @status live */
export declare function wait(seconds: number): Beat

export interface Simulation {
  start(): void
  stop(): void
  /** Stop and restore the store to its state when the sim last started. */
  reset(): void
  readonly running: boolean
}

/**
 * The emulation driver: a stepper wired to the engine clock. `step` is PURE —
 * it receives the current state and the elapsed seconds and returns a PATCH to
 * merge, or `null` to halt (converged, diverged, or long enough).
 *
 * `{ rate }` steps a discrete map that many times per second; `{ dt }` runs a
 * continuous integration at a fixed timestep, decoupled from the frame rate.
 *
 * ```tsx
 * const sim = useSimulation(s, (st) => {
 *   if (Math.abs(f(st.x)) < 1e-9) return null
 *   return { x: st.x - f(st.x) / df(st.x) }
 * }, { rate: 1.6 })
 * ```
 * @tier core @status live
 */
export declare function useSimulation<T extends object>(
  store: Stage<T>,
  step: (state: T, dt: number) => Partial<T> | null,
  opts?: { rate?: number; dt?: number },
): Simulation

/** Coordinate transforms handed to a `<Custom>` draw function: figure units ⇄
 *  screen pixels, so freeform SVG lands exactly on the plotted geometry. */
export interface PlotCtx {
  xToPx(x: number): number
  yToPx(y: number): number
  pxToX(px: number): number
  pxToY(px: number): number
}

/**
 * The freeform hatch. A `<Plot>` child that hands you the coordinate transforms
 * and renders whatever SVG you return — for the figure the stock marks don't
 * have (a shaded triangle, an arrowhead, a hand-drawn annotation).
 *
 * ```tsx
 * <Custom draw={({ xToPx, yToPx }) => (
 *   <path d={`M${xToPx(a)},${yToPx(0)} L${xToPx(b)},${yToPx(h)} Z`} fill="#7b5bd6" />
 * )} />
 * ```
 *
 * **It animates.** The draw function re-runs on every frame of a director beat,
 * so read {@link Mark} channels straight off the handle and the drawing follows
 * the tween — no `mark={…}` prop, nothing to wire:
 *
 * ```tsx
 * const tile = useMark({ x: 0, opacity: 0 })
 * dir.play(sequence([fadeTo(tile, 1), transformTo(tile, { x: 3 })]))
 *
 * <Custom draw={({ xToPx, yToPx }) => (
 *   <rect opacity={tile.opacity} x={xToPx(tile.x)} y={yToPx(h)} … />
 * )} />
 * ```
 * Pass `static` for a figure that genuinely never moves, to skip the subscription.
 * @tier core @status live
 */
export declare function Custom(props: {
  draw: (ctx: PlotCtx) => ReactNode
  static?: boolean
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 4 · Structure & prose
// ────────────────────────────────────────────────────────────────────────────

/** A titled unit of the lesson. Lessons are a sequence of `<Section>`s.
 *  @tier core @status live */
export declare function Section(props: {
  title?: string
  children: ReactNode
}): JSX.Element

/**
 * The primary text primitive: a **pure markdown string** with LaTeX math
 * (`$…$` inline, `$$…$$` block). Do not hand-format paragraphs or nest JSX.
 *
 * Computed values go in by ordinary template interpolation, wrapped in
 * {@link fmt} so they read cleanly:
 * ```
 * <Prose>{`The vertex sits at $(${fmt(h)}, ${fmt(k)})$.`}</Prose>
 * ```
 * Never type a computed number as a literal — interpolate it.
 * @tier core @status live
 */
export declare function Prose(props: { children: string }): JSX.Element

/** Standalone rendered equation, for a display formula outside prose flow.
 *  Most math should just live in `<Prose>`; use this only when you want an
 *  equation on its own with no surrounding text.
 *  @tier ext @status live */
export declare function Math(props: {
  children: string
  block?: boolean
}): JSX.Element

/** A highlighted note. `kind` sets the tone/color.
 *  @tier core @status live */
export declare function Callout(props: {
  kind?: "note" | "tip" | "warning" | "key-idea"
  title?: string
  children: ReactNode
}): JSX.Element

/** Ordered walkthrough. Steps reveal one at a time as the learner advances.
 *  @tier ext @status live */
export declare function Steps(props: { children: ReactNode }): JSX.Element
/** One beat of a `<Steps>` walkthrough. @tier ext @status live */
export declare function Step(props: { title?: string; children: ReactNode }): JSX.Element

/** Click-to-reveal, for "try it before you see it" moments.
 *  @tier core @status live */
export declare function Reveal(props: { label?: string; children: ReactNode }): JSX.Element

/**
 * Present a lesson as a sequence of full-attention SCREENS — one idea each —
 * instead of one long scroll. The deck shows exactly one `<Screen>` at a time
 * inside a polished card, with a footer that carries the navigation: a primary
 * **Continue** button (**Done** on the last screen), a subtle **Back**, a row of
 * clickable progress dots with an `n / total` readout, and keyboard control
 * (→ / Space / Enter advance, ← goes back). Screens transition with a spring
 * slide + fade that respects `prefers-reduced-motion`.
 *
 * Because a screen holds the interactive figure, navigation is always explicit —
 * a `<Slider>` or `MovablePoint` inside a screen never doubles as "next".
 *
 * ```tsx
 * <Deck>
 *   <Screen title="A guess">…one figure + a little prose…</Screen>
 *   <Screen title="Refine it">…</Screen>
 * </Deck>
 * ```
 * @tier core @status live
 */
export declare function Deck(props: { children: ReactNode }): JSX.Element

/** One screen of a `<Deck>` — a titled container for a SINGLE idea (usually a
 *  manipulable figure plus a little prose). Any SDK primitive composes inside it.
 *  @tier core @status live */
export declare function Screen(props: { title?: string; children: ReactNode }): JSX.Element

/** Progressive hints for the nearest enclosing exercise, revealed in order.
 *  @tier core @status live */
export declare function Hint(props: { children: ReactNode }): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 5 · Interactive coordinate plane  (backed by Mafs)
// ────────────────────────────────────────────────────────────────────────────

export interface PlotProps {
  /** Visible range. Defaults to a square around the origin. */
  x?: [number, number]
  y?: [number, number]
  /** Grid style. */
  grid?: boolean | "cartesian" | "polar"
  /** Lock the aspect ratio so circles look round — at the cost of showing MORE
   *  than `x`/`y` on whichever axis has slack. Default false: the region you
   *  asked for is the region you get, stretched to fill `height`. Turn it on for
   *  geometry (circles, angles, congruence); leave it off for graphs. */
  preserveAspect?: boolean
  height?: number
  children?: ReactNode
}

export interface PlotComponent {
  /** The plotting surface itself. @tier core @status live */
  (props: PlotProps): JSX.Element
  /** Plot `y = f(x)`. @tier core @status live */
  OfX(props: { y: Fn1; color?: Color; style?: LineStyle; mark?: Mark }): JSX.Element
  /** Plot `x = f(y)`. @tier ext @status planned */
  OfY(props: { x: Fn1; color?: Color; style?: LineStyle }): JSX.Element
  /** Parametric curve over `t ∈ [t0, t1]`. @tier ext @status planned */
  Parametric(props: {
    xy: (t: number) => [number, number]
    t: [number, number]
    color?: Color
  }): JSX.Element
  /** A static point with optional label. Bind a `mark` and its position moves
   *  with {@link transformTo} instead of with the props. @tier core @status live */
  Point(props: { x?: number; y?: number; color?: Color; label?: string; mark?: Mark }): JSX.Element
  /** A draggable point — the interaction driver. Wire `onMove` to the store to
   *  drive the rest of the lesson; `constrain` locks it to one axis.
   *  @tier core @status live */
  MovablePoint(props: {
    x: number
    y: number
    onMove: (p: { x: number; y: number }) => void
    constrain?: "horizontal" | "vertical" | ((p: { x: number; y: number }) => { x: number; y: number })
    color?: Color
    mark?: Mark
  }): JSX.Element
  /** A straight segment between two points, in figure coordinates. Endpoints
   *  stay declarative; bind a `mark` to reveal it with {@link drawTo}.
   *  @tier core @status live */
  Segment(props: {
    x1: number
    y1: number
    x2: number
    y2: number
    color?: Color
    strokeWidth?: number
    dashed?: boolean
    mark?: Mark
  }): JSX.Element
  /** @tier ext @status planned */
  Vector(props: { tip: [number, number]; tail?: [number, number]; color?: Color }): JSX.Element
  /** @tier ext @status planned */
  Line(props: { point: [number, number]; slope: number; color?: Color }): JSX.Element
  /** A filled polygon from a list of `[x, y]` vertices. @tier core @status live */
  Polygon(props: { points: [number, number][]; color?: Color; fillOpacity?: number; mark?: Mark }): JSX.Element
  /** @tier ext @status planned */
  Circle(props: { center: [number, number]; radius: number; color?: Color }): JSX.Element
  /** Shade the region where `expr(x, y)` compares to 0. @tier ext @status planned */
  Inequality(props: { fn: (x: number, y: number) => number; op: "<" | ">" | "<=" | ">="; color?: Color }): JSX.Element
  /** @tier ext @status planned */
  Text(props: { x: number; y: number; children: string }): JSX.Element
}

/** Interactive coordinate plane. Marks are children (`<Plot.OfX/>`, …).
 *  @tier core @status live */
export declare const Plot: PlotComponent

export type Color = "blue" | "coral" | "green" | "violet" | "orange" | "ink"
export type LineStyle = "solid" | "dashed" | "dotted"

// ────────────────────────────────────────────────────────────────────────────
// 5b · Scene — a blank canvas for BESPOKE CONCRETE PICTURES  (backed by Mafs)
// ────────────────────────────────────────────────────────────────────────────
//
// `Scene` is `Plot`'s sibling for pictures that are NOT a curve on axes: a pixel
// grid that recolors as a slider drags, a lattice, rearranged squares, a shaded
// area with a bracket and a caption. It shares Plot's substrate and conventions
// — positions are FIGURE units, y-up; sizes that must look constant (labels,
// arrowheads, stroke widths) are pixels — but draws NO axes and preserves the
// aspect ratio by default, so a grid cell reads square. `<Custom>` works inside
// a `<Scene>` unchanged; both share one coordinate context.

/** A colour for a scene atom: a token name (`"blue"`, `"coral"`, … or a neutral
 *  like `"line"`/`"text"`/`"paper"`), or a literal CSS colour (`"#e0554d"`,
 *  `"rgb(...)"`, `"hsl(...)"`). Unknown strings fall back to a sensible default. */
export type SceneColor = Color | string

export interface SceneProps {
  /** Visible region, FIGURE units, y-up. Default `[0, 10]` on both axes. */
  x?: [number, number]
  y?: [number, number]
  height?: number
  /** Keep units square so a grid's cells look square. Default **true** (the
   *  opposite of `Plot`) — turn it off only for a deliberately stretched canvas. */
  preserveAspect?: boolean
  /** A colour to fill the whole plane behind the atoms. */
  background?: SceneColor
  children?: ReactNode
}

export interface SceneComponent {
  /** The blank canvas itself. @tier core @status live */
  (props: SceneProps): JSX.Element
  /** THE centerpiece: a `rows`×`cols` grid of cells filling a rectangular region
   *  (`x`/`y`, default the whole scene). `fill` is a single colour or a per-cell
   *  `(row, col, index) => color` (index row-major, row 0 at the top). Cells
   *  CSS-transition their fill, so a slider-driven recolor animates smoothly.
   *  `gap` is the unit spacing between cells; `radius` the cell corner in units.
   *  @tier core @status live */
  Grid(props: {
    rows: number
    cols: number
    x?: [number, number]
    y?: [number, number]
    fill?: SceneColor | ((row: number, col: number, index: number) => SceneColor)
    gap?: number
    radius?: number
  }): JSX.Element
  /** A filled + stroked rounded rectangle. `(x, y)` is the lower-left corner.
   *  @tier core @status live */
  Rect(props: {
    x: number
    y: number
    width: number
    height: number
    color?: SceneColor
    fillOpacity?: number
    radius?: number
    mark?: Mark
  }): JSX.Element
  /** A filled + stroked circle; `r` is in x-units. @tier core @status live */
  Circle(props: { x: number; y: number; r: number; color?: SceneColor; fillOpacity?: number; mark?: Mark }): JSX.Element
  /** A straight line with an optional dash and draw-on reveal (bind a `mark`).
   *  @tier core @status live */
  Line(props: {
    x1: number
    y1: number
    x2: number
    y2: number
    color?: SceneColor
    strokeWidth?: number
    dashed?: boolean
    mark?: Mark
  }): JSX.Element
  /** An arrow: shaft `from → to` with an arrowhead at `to`. @tier core @status live */
  Arrow(props: { from: [number, number]; to: [number, number]; color?: SceneColor; strokeWidth?: number; mark?: Mark }): JSX.Element
  /** A square bracket spanning `from → to`, with a label centered outside it.
   *  `depth` is how far (px) the end-ticks stand off the span. @tier core @status live */
  Bracket(props: { from: [number, number]; to: [number, number]; label?: string; color?: SceneColor; depth?: number }): JSX.Element
  /** A filled polygon from `[x, y]` vertices. @tier core @status live */
  Region(props: { points: [number, number][]; color?: SceneColor; fillOpacity?: number; mark?: Mark }): JSX.Element
  /** A text label, positioned in figure units but sized in constant px.
   *  @tier core @status live */
  Label(props: {
    x: number
    y: number
    color?: SceneColor
    size?: number
    anchor?: "start" | "middle" | "end"
    children: string
    mark?: Mark
  }): JSX.Element
}

/** A blank canvas for bespoke concrete pictures (pixel grids, lattices,
 *  rearranged squares). Atoms are children (`<Scene.Grid/>`, `<Scene.Label/>`, …).
 *  @tier core @status live */
export declare const Scene: SceneComponent

/** A number line for 1-D concepts (intervals, inequalities, sequences).
 *  @tier ext @status planned */
export declare function NumberLine(props: {
  range: [number, number]
  ticks?: number
  points?: { at: number; color?: Color; label?: string; open?: boolean }[]
  intervals?: { from: number; to: number; color?: Color }[]
}): JSX.Element

/** Geometry constructions (compass/straightedge, angles, transforms).
 *  Backed by JSXGraph for constructions Mafs doesn't cover.
 *  @tier ext @status planned */
export declare function Geometry(props: {
  bounds?: [number, number, number, number]
  children: ReactNode
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 6 · Charts  (data / statistics / probability — backed by a small chart layer)
// ────────────────────────────────────────────────────────────────────────────

/** Data/statistics chart. @tier ext @status planned */
export declare function Chart(props: {
  kind: "bar" | "line" | "scatter" | "histogram" | "box"
  data: number[] | { x: number; y: number }[]
  bins?: number
  xLabel?: string
  yLabel?: string
}): JSX.Element

/** Plot a named probability distribution with tunable parameters.
 *  @tier ext @status planned */
export declare function Distribution(props: {
  kind: "normal" | "binomial" | "poisson" | "uniform" | "exponential"
  params: Scope
  shade?: { from?: number; to?: number }
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 7 · Controls
// ────────────────────────────────────────────────────────────────────────────

/** A value slider — the workhorse explore control. @tier core @status live */
export declare function Slider(props: {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  label?: string
  /** Show the live value next to the label. Default true. */
  showValue?: boolean
}): JSX.Element

/** A two-handle range slider. @tier ext @status planned */
export declare function RangeSlider(props: {
  value: [number, number]
  onChange: (v: [number, number]) => void
  min: number
  max: number
  step?: number
  label?: string
}): JSX.Element

/** A boolean switch. @tier core @status live */
export declare function Toggle(props: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}): JSX.Element

/** A numeric text input. @tier core @status live */
export declare function NumberInput(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
}): JSX.Element

/** A labelled select. @tier ext @status planned */
export declare function Dropdown<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 8 · Assessment
// ────────────────────────────────────────────────────────────────────────────

export interface GradeResult {
  correct: boolean
  /** Optional feedback shown to the learner after a submission. */
  feedback?: string
}

/**
 * A typed answer spec. Declarative variants are re-checkable by the verifier
 * against the lesson plan's canonical answer; `custom` is an escape hatch that
 * gets extra scrutiny.
 */
export type AnswerSpec =
  | { type: "numeric"; value: number; tolerance?: number; unit?: string }
  | { type: "expression"; value: MathExpr; vars?: string[] }
  | { type: "set"; values: (number | string)[]; ordered?: boolean }
  | { type: "interval"; from: number; to: number; openLeft?: boolean; openRight?: boolean }
  | { type: "point"; x: number; y: number; tolerance?: number }
  /** Exact/one-of string match for short non-math answers ("hypotenuse"). */
  | { type: "text"; value: string | string[]; caseSensitive?: boolean }
  /** Escape hatch. Not re-checkable by the verifier → extra critic scrutiny. */
  | { type: "custom"; grade: (input: string) => GradeResult }

/**
 * A graded exercise with a typed input. Provide `<Hint>` children for
 * progressive help and `solution` for the reveal after solving/giving up.
 * @tier core @status live
 */
export declare function Exercise(props: {
  prompt: ReactNode
  answer: AnswerSpec
  /** Input affordance. Inferred from `answer.type` if omitted. */
  input?: "text" | "number" | "math" | "point"
  solution?: ReactNode
  /** Progressive hints — or use nested `<Hint>` children. */
  hints?: string[]
  /** Fires on each attempt; feeds the mastery signal automatically. */
  onResult?: (r: GradeResult & { attempts: number }) => void
  children?: ReactNode
}): JSX.Element

/** Convenience for single/multi-select questions. @tier core @status live */
export declare function MultipleChoice(props: {
  prompt: ReactNode
  /** Index (or indices) of the correct option(s). */
  correct: number | number[]
  shuffle?: boolean
  solution?: ReactNode
  children: ReactNode // <Option> elements
}): JSX.Element

/** One choice inside `<MultipleChoice>`. @tier core @status live */
export declare function Option(props: { children: ReactNode }): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 9 · Motion
// ────────────────────────────────────────────────────────────────────────────

/** Interpolate a value over `duration` seconds. Honors reduced-motion.
 *  @tier ext @status planned */
export declare function Tween(props: {
  from: number
  to: number
  duration: number
  loop?: boolean | "reverse"
  children: (value: number) => ReactNode
}): JSX.Element
