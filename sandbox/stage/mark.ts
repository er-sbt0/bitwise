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
  /** Live numeric reads: `mark.opacity` is `mark.get("opacity")`. Every channel
   *  (seeded, standard, or created later by `value()`) shows up here. */
  readonly [channel: string]: any;
};

let nextId = 0;

// Every live mark, so `<Custom>` can re-render itself while ANY of them is being
// animated without the author having to declare a subscription (see scene.tsx).
// Marks are created per component instance and the sandbox tears the whole tree
// down between lessons; a WeakSet wouldn't be iterable, and the set is tiny.
const registry = new Set<Mark>();
export const liveMarks = (): Mark[] => [...registry];

/** Drop every registered mark. Called by the harness before it mounts a new
 *  lesson: marks are registered at CREATION (so a `<Custom>` can subscribe on
 *  the very first frame) and unregistered on unmount — but a lesson that threw
 *  mid-render never unmounts what it made, so those would accumulate across a
 *  repair loop. Safe to call before `root.render`: the outgoing tree's cleanups
 *  then find nothing to remove, and the incoming tree re-registers as it builds. */
export const resetMarks = (): void => registry.clear();

/** Property names on the handle itself — a channel may never shadow one. */
const RESERVED = new Set(["id", "values", "value", "get", "set", "attach"]);

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

  // Creating a channel also exposes it as a LIVE read on the handle itself, so
  // freeform code reads `corner.opacity` (a number, now) the way it reads
  // `s.filled` off the store — no `.get("…")` ceremony, nothing to forget. The
  // getter reads the MotionValue on every access, so it is never stale.
  const value = (name: string) => {
    let v = values[name];
    if (!v) {
      v = values[name] = motionValue(0);
      expose(name);
    }
    return v;
  };
  const expose = (name: string) => {
    if (RESERVED.has(name) || Object.prototype.hasOwnProperty.call(mark, name)) return;
    Object.defineProperty(mark, name, { get: () => values[name].get(), enumerable: true });
  };

  let detach: (() => void) | null = null;

  const mark: Mark = {
    id: nextId++,
    values,
    value: (name: string) => value(name),
    get: (name: string) => value(name).get(),
    set: (patch: Record<string, number>) => {
      for (const [k, v] of Object.entries(patch)) value(k).set(v);
    },
    attach: (el: Element | null, { draw = true }: { draw?: boolean } = {}) => {
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

  Object.keys(values).forEach(expose);
  registry.add(mark);
  return mark;
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
  const mark = ref.current;
  // createMark registers eagerly — a `<Custom>` child subscribes in a layout
  // effect that runs BEFORE this parent's effect, and an unregistered mark would
  // leave the first animation unsubscribed. The effect only owns the *removal*,
  // so the registry doesn't accumulate marks from previous lessons (the sandbox
  // frame is reused across generations). Re-adding on mount keeps StrictMode's
  // mount/unmount/mount cycle honest.
  React.useEffect(() => {
    registry.add(mark);
    return () => {
      registry.delete(mark);
    };
  }, [mark]);
  return mark;
}
