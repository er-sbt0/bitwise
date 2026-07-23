/**
 * Bitwise Lesson SDK — the stable contract.
 *
 * Everything declared here is injected as an in-scope global inside the lesson
 * sandbox. A lesson is a default-exported React component that composes these
 * primitives. No imports, no network, no DOM escape.
 *
 * This file is the single source of truth: the runtime implements it, the
 * authoring prompt is generated from its JSDoc, and the verifier's allow-list
 * is the set of names it declares.
 *
 * ── Tiers ───────────────────────────────────────────────────────────────────
 * CORE  — the v0 subset the runtime implements first and the prompt ships with:
 *           useLessonState, fmt, math, Section, Prose, Callout, Reveal, Hint,
 *           Plot (+ OfX, Point, MovablePoint), Slider, Toggle, NumberInput,
 *           Exercise, MultipleChoice, Option.
 * EXT   — everything else. Implement as lessons start asking for it. Because
 *           lessons are ephemeral there is no migration cost to growing this.
 * Each declaration is tagged `@tier core | ext`.
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
 *  @tier core */
export declare const math: MathAPI

/**
 * Format a number for display inside interpolated prose, e.g.
 * ``<Prose>{`The vertex is at (${fmt(h)}, ${fmt(k)}).`}</Prose>``.
 * Rounds sensibly and strips float noise like `0.30000000000000004`.
 * This is the sanctioned way to put a computed value into text.
 * @tier core
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
 * @tier core
 */
export declare function useLessonState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void]

/** Elapsed seconds since mount, for animations. Auto-pauses when the tab is
 *  hidden and returns a frozen value under `prefers-reduced-motion`. */
export declare function useTime(options?: { paused?: boolean }): number

/** Emit a custom telemetry event. Exercises and controls emit automatically;
 *  use this only for bespoke interactions worth measuring. */
export declare function track(event: string, data?: Record<string, unknown>): void

// Standard React hooks are also in scope: useState, useEffect, useMemo,
// useRef, useCallback. Prefer useLessonState for anything a learner changes.
export declare const useState: typeof import("react").useState
export declare const useEffect: typeof import("react").useEffect
export declare const useMemo: typeof import("react").useMemo
export declare const useRef: typeof import("react").useRef
export declare const useCallback: typeof import("react").useCallback

// ────────────────────────────────────────────────────────────────────────────
// 3 · Structure & prose
// ────────────────────────────────────────────────────────────────────────────

/** A titled unit of the lesson. Lessons are a sequence of `<Section>`s.
 *  @tier core */
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
 * @tier core
 */
export declare function Prose(props: { children: string }): JSX.Element

/** Standalone rendered equation, for a display formula outside prose flow.
 *  Most math should just live in `<Prose>`; use this only when you want an
 *  equation on its own with no surrounding text.
 *  @tier ext */
export declare function Math(props: {
  children: string
  block?: boolean
}): JSX.Element

/** A highlighted note. `kind` sets the tone/color.
 *  @tier core */
export declare function Callout(props: {
  kind?: "note" | "tip" | "warning" | "key-idea"
  title?: string
  children: ReactNode
}): JSX.Element

/** Ordered walkthrough. Steps reveal one at a time as the learner advances. */
export declare function Steps(props: { children: ReactNode }): JSX.Element
export declare function Step(props: { title?: string; children: ReactNode }): JSX.Element

/** Click-to-reveal, for "try it before you see it" moments. */
export declare function Reveal(props: { label?: string; children: ReactNode }): JSX.Element

/** Progressive hints for the nearest enclosing exercise, revealed in order. */
export declare function Hint(props: { children: ReactNode }): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 4 · Interactive coordinate plane  (backed by Mafs)
// ────────────────────────────────────────────────────────────────────────────

export interface PlotProps {
  /** Visible range. Defaults to a square around the origin. */
  x?: [number, number]
  y?: [number, number]
  /** Grid style. */
  grid?: boolean | "cartesian" | "polar"
  /** Lock aspect ratio so circles look round. Default true. */
  preserveAspect?: boolean
  height?: number
  children?: ReactNode
}

export interface PlotComponent {
  /** @tier core */
  (props: PlotProps): JSX.Element
  /** Plot `y = f(x)`. @tier core */
  OfX(props: { y: Fn1; color?: Color; style?: LineStyle }): JSX.Element
  /** Plot `x = f(y)`. */
  OfY(props: { x: Fn1; color?: Color; style?: LineStyle }): JSX.Element
  /** Parametric curve over `t ∈ [t0, t1]`. */
  Parametric(props: {
    xy: (t: number) => [number, number]
    t: [number, number]
    color?: Color
  }): JSX.Element
  /** A static point with optional label. @tier core */
  Point(props: { x: number; y: number; color?: Color; label?: string }): JSX.Element
  /** A draggable point. Wire `onMove` to state to drive the rest of the lesson.
   *  @tier core */
  MovablePoint(props: {
    x: number
    y: number
    onMove: (p: { x: number; y: number }) => void
    constrain?: "horizontal" | "vertical" | ((p: { x: number; y: number }) => { x: number; y: number })
    color?: Color
  }): JSX.Element
  Segment(props: { from: [number, number]; to: [number, number]; color?: Color }): JSX.Element
  Vector(props: { tip: [number, number]; tail?: [number, number]; color?: Color }): JSX.Element
  Line(props: { point: [number, number]; slope: number; color?: Color }): JSX.Element
  Polygon(props: { points: [number, number][]; color?: Color; fillOpacity?: number }): JSX.Element
  Circle(props: { center: [number, number]; radius: number; color?: Color }): JSX.Element
  /** Shade the region where `expr(x, y)` compares to 0. */
  Inequality(props: { fn: (x: number, y: number) => number; op: "<" | ">" | "<=" | ">="; color?: Color }): JSX.Element
  Text(props: { x: number; y: number; children: string }): JSX.Element
}

export declare const Plot: PlotComponent

export type Color = "blue" | "coral" | "green" | "violet" | "orange" | "ink"
export type LineStyle = "solid" | "dashed" | "dotted"

/** A number line for 1-D concepts (intervals, inequalities, sequences). */
export declare function NumberLine(props: {
  range: [number, number]
  ticks?: number
  points?: { at: number; color?: Color; label?: string; open?: boolean }[]
  intervals?: { from: number; to: number; color?: Color }[]
}): JSX.Element

/** Geometry constructions (compass/straightedge, angles, transforms).
 *  Backed by JSXGraph for constructions Mafs doesn't cover. */
export declare function Geometry(props: {
  bounds?: [number, number, number, number]
  children: ReactNode
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 5 · Charts  (data / statistics / probability — backed by a small chart layer)
// ────────────────────────────────────────────────────────────────────────────

export declare function Chart(props: {
  kind: "bar" | "line" | "scatter" | "histogram" | "box"
  data: number[] | { x: number; y: number }[]
  bins?: number
  xLabel?: string
  yLabel?: string
}): JSX.Element

/** Plot a named probability distribution with tunable parameters. */
export declare function Distribution(props: {
  kind: "normal" | "binomial" | "poisson" | "uniform" | "exponential"
  params: Scope
  shade?: { from?: number; to?: number }
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 6 · Controls
// ────────────────────────────────────────────────────────────────────────────

/** @tier core */
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

export declare function RangeSlider(props: {
  value: [number, number]
  onChange: (v: [number, number]) => void
  min: number
  max: number
  step?: number
  label?: string
}): JSX.Element

export declare function Toggle(props: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: string
}): JSX.Element

export declare function NumberInput(props: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
}): JSX.Element

export declare function Dropdown<T extends string>(props: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label?: string
}): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 7 · Assessment
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
 */
/** @tier core */
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

/** Convenience for single/multi-select questions. @tier core */
export declare function MultipleChoice(props: {
  prompt: ReactNode
  /** Index (or indices) of the correct option(s). */
  correct: number | number[]
  shuffle?: boolean
  solution?: ReactNode
  children: ReactNode // <Option> elements
}): JSX.Element

export declare function Option(props: { children: ReactNode }): JSX.Element

// ────────────────────────────────────────────────────────────────────────────
// 8 · Motion
// ────────────────────────────────────────────────────────────────────────────

/** Interpolate a value over `duration` seconds. Honors reduced-motion. */
export declare function Tween(props: {
  from: number
  to: number
  duration: number
  loop?: boolean | "reverse"
  children: (value: number) => ReactNode
}): JSX.Element
