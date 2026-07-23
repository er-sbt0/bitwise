// Mark identity. A mark handle is a bag of Motion values that the director
// animates directly — never through React state, so a two-second tween costs
// zero re-renders (proven in docs/spikes/w1-hybrid: ~59 ticks/s, render count 1).
//
// ────────────────────────────────────────────────────────────────────────────
// CONTRACT FOR THE SCENE LAYER (sandbox/stage/scene.tsx — owned separately)
// ────────────────────────────────────────────────────────────────────────────
// A `Plot.*` wrapper that accepts `mark={handle}` must do two things:
//
// 1. DRAW-ON / OPACITY — call `mark.attach(el, { draw })` from the rendered
//    element's ref callback:
//
//        <path ref={(el) => mark?.attach(el, { draw: true })} … />
//        <circle ref={(el) => mark?.attach(el, { draw: false })} … />
//
//    attach() subscribes `pathLength` → `stroke-dasharray = "<t> 1"` (with
//    `pathLength="1"` on the element, so the dash pattern is a *fraction* of the
//    path) and `opacity` → the `opacity` attribute, writing straight to the DOM.
//    Pass `draw: false` for non-drawable marks (points) so a 0 reveal fraction
//    doesn't blank a stroked circle. Calling attach again replaces the binding;
//    `attach(null)` detaches — so `ref={(el) => mark.attach(el)}` is complete,
//    and it returns void, which is a legal ref-callback result in React 18 & 19.
//
//    CAVEAT from the spike (L5): Chrome computes the dash pattern in *screen*
//    space when `vector-effect: non-scaling-stroke` is set, which defeats the
//    pathLength normalisation. A scene layer that draws in math space must set
//    `vectorEffect: "none"` and express strokeWidth in math units.
//
// 2. POSITION — bind `mark.values.x` / `mark.values.y` yourself. It is NOT bound
//    by attach(), because the math → pixel mapping is substrate knowledge that
//    the stage core must not own:
//
//        const cx = useTransform(mark.values.x, (x) => xToPx(x))
//        <motion.circle cx={cx} cy={cy} … />
//
//    Mark position values are always in FIGURE (math) coordinates, so they stay
//    correct across a resize / viewBox change; the transform re-derives pixels.
//
// Extra channels are created on demand: `mark.value("angle")` gives a
// MotionValue an author can `transformTo(mark, { angle: … })` and a `<Custom>`
// draw fn can read. Unknown names default to 0.
import * as React from "react";
import { motionValue, type MotionValue } from "motion/react";

export type MarkValues = Record<string, MotionValue<number>> & {
  /** Reveal fraction, 0 = undrawn … 1 = fully drawn. Animated by `drawTo`. */
  pathLength: MotionValue<number>;
  x: MotionValue<number>;
  y: MotionValue<number>;
  opacity: MotionValue<number>;
};

export type Mark = {
  readonly id: number;
  readonly values: MarkValues;
  /** The named value, created (at 0) if the author never seeded it. */
  value(name: string): MotionValue<number>;
  get(name: string): number;
  /** Set values *instantly* — no tween. Used to stage a mark before a beat. */
  set(patch: Record<string, number>): void;
  attach(el: Element | null, opts?: { draw?: boolean }): void;
};

let nextId = 0;

function createMark(initial?: Record<string, number>): Mark {
  // pathLength starts undrawn and opacity visible: the two defaults that make
  // `drawTo` and `fadeTo` mean what they read like.
  const values = {
    pathLength: motionValue(initial?.pathLength ?? 0),
    x: motionValue(initial?.x ?? 0),
    y: motionValue(initial?.y ?? 0),
    opacity: motionValue(initial?.opacity ?? 1),
  } as MarkValues;
  for (const [k, v] of Object.entries(initial ?? {})) {
    if (!values[k]) values[k] = motionValue(v);
  }

  const value = (name: string) => (values[name] ??= motionValue(0));

  let detach: (() => void) | null = null;

  return {
    id: nextId++,
    values,
    value,
    get: (name) => value(name).get(),
    set: (patch) => {
      for (const [k, v] of Object.entries(patch)) value(k).set(v);
    },
    attach: (el, { draw = true } = {}) => {
      detach?.();
      detach = null;
      if (!el) return;
      const offs: Array<() => void> = [];
      if (draw) {
        el.setAttribute("pathLength", "1");
        const write = (v: number) => el.setAttribute("stroke-dasharray", `${v} 1`);
        write(values.pathLength.get());
        offs.push(values.pathLength.on("change", write));
      }
      const fade = (v: number) => el.setAttribute("opacity", String(v));
      fade(values.opacity.get());
      offs.push(values.opacity.on("change", fade));
      detach = () => offs.forEach((o) => o());
    },
  };
}

/**
 * `useMark(initial?)` — a handle with stable identity for the life of the
 * component. `initial` seeds the values on first render only; later changes are
 * ignored (it is an *initial*, not a binding — bind geometry declaratively and
 * let the director own the handle).
 */
export function useMark(initial?: Record<string, number>): Mark {
  const ref = React.useRef<Mark | null>(null);
  if (!ref.current) ref.current = createMark(initial);
  return ref.current;
}
