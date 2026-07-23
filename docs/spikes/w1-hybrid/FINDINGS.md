# W1 spike — Mafs + Motion hybrid: FINDINGS

**Question (plan §8 step 1):** can director-animated marks live in *our own* SVG
layer inside a Mafs coordinate plane, driven straight off Motion values, at 60 fps
with **zero React re-renders per frame**?

## VERDICT: **YES — the hybrid works, unmodified, with no Mafs patching.**

Build + run the evidence yourself:

```
node docs/spikes/w1-hybrid/build.mjs     # esbuild → spike.js + core.css
node docs/spikes/w1-hybrid/shoot.mjs     # headless Chrome → *.png + measurements.json
```

Visual proof in this directory: `1-initial.png`, `2-mid.png`, `3-final.png`,
`4-after-drag.png`, `5-replay-mid.png`, `6-reset.png`, `7-resized-mid.png`,
`8-resized-final.png`. Raw numbers: `measurements.json`.

---

## 1 · Measured results

Environment: React **19.1**, Mafs **0.21.0**, Motion **12.42.2**, Chrome headless
(`--headless=new`), esbuild 0.25, `file://` load (no server needed).

| Moment | App renders | PixelLayer renders | MathLayer renders | Motion ticks |
|---|---|---|---|---|
| after mount | 1 | 1 | 1 | 0 |
| mid-animation (~610 ms in) | **1** | **1** | **1** | 44 |
| animation finished (1613 ms) | **1** | **1** | **1** | 97 |
| after a 12-step pointer drag | 13 | 14 | 13 | 97 (unchanged) |
| after `reset()` mid-flight | +0 | +0 | +0 | — |
| after resizing the plane mid-animation | +1 | +2 | +1 | animation uninterrupted |

- **Zero React renders during animation.** The counters are identical before,
  during and after the 1.6 s play. Animation is 100 % out-of-React.
- **97 value ticks over 1613 ms = 60.1 ticks/s** — Motion is on its fast path
  (one `requestAnimationFrame` loop, direct DOM attribute writes).
- **Drag costs one render per pointer event** (12 moves → 12 renders), never per
  frame. MotionValues survive those re-renders — the drawn-on segment stayed
  drawn (see `4-after-drag.png`).
- **`reset()` mid-flight is free**: `controls.stop()` + `value.set(0)` snapped
  everything back with **no** React render (`6-reset.png`).
- **React 19: clean.** `0` console errors and `0` warnings across mount, drag,
  play, replay, reset and resize. Mafs peers `react >=18`, so 19.1 installs and
  behaves with no `--legacy-peer-deps` and no compat shim. `useMovablePoint` /
  `MovablePoint` dragging (which uses `@use-gesture/react`) works.
- **Bundle cost** (minified, measured separately): react+react-dom alone
  189 kB / 59 kB gz; with `mafs` + `motion/react` 697 kB / 217 kB gz →
  **Mafs+Motion ≈ +508 kB raw, +158 kB gz**. (Current `public/sandbox-runtime.js`
  is 4.3 MB, dominated by `@babel/standalone`.)

---

## 2 · How `<Mafs>` actually renders (read from `node_modules/mafs/build/index.js`)

```
<div class="MafsView" style="width; height">      ← .MafsView owns all CSS vars
  <svg width height viewBox="vbX vbY width height" preserveAspectRatio="xMidYMin"
       style="--mafs-view-transform: matrix(sx,0,0,-sy,0,0); --mafs-user-transform: …">
    {children}                                    ← children go DIRECTLY in the <svg>
  </svg>
</div>
```

- **Any custom element is a legal direct child of `<Mafs>`** — no wrapper needed.
  Verified empirically: our `<g data-layer="pixel-space">` and
  `<g data-layer="math-space">` appear as direct `<svg>` children
  (`measurements.json → svgChildTags: ["g","path","g","path","path",
  "g[pixel-space]","g[math-space]"]`) and land in the right math positions.
- The `viewBox` origin carries the pan offset, so `viewTransform` is a **pure
  scale** matrix (`matrix(74.28571, 0, 0, -74.28571, 0, 0)` at 720 px wide) — y is
  negated. With the default `preserveAspectRatio="contain"` the scale is
  **uniform**, so circles stay circles under the math-space transform.
- Context providers (`CoordinateContext`, `SpanContext`, `TransformContext`,
  `PaneContext`) wrap the `<svg>`, so hooks work in any descendant.

### The coordinate-transform mechanism to use

**Use `useTransformContext()` + `vec.transform` — the exact mechanism Mafs' own
`Line.Segment` and `Point` use.** (`Point` does
`vec.transform([x,y], vec.matrixMult(pixelMatrix, transform))` and emits a
pixel-space `<circle>`; we do the same.)

```tsx
import { useTransformContext, vec } from "mafs";

const { viewTransform, userTransform } = useTransformContext();
const toPx = React.useMemo(
  () => vec.matrixMult(viewTransform, userTransform),
  [viewTransform, userTransform],
);
const [px, py] = vec.transform([mathX, mathY], toPx);   // → pixel coords
```

Two hard rules:

1. **`vec.Matrix` is a FLAT 6-tuple `[a,b,c,d,e,f]`** (CSS `matrix()` order), *not*
   a 2-D array. `viewTransform[0][0]` is `undefined` and silently produced a NaN
   stroke width in this spike — it rendered a 2-*math-unit*-thick blob that
   swallowed the draggable point's hitbox. Derive scalars via
   `vec.transform([1,0], viewTransform)[0]` (px per x-unit) or `vec.det`.
2. **Never index it, never reimplement it.** `userTransform` must be included or
   marks break inside `<Transform>`.

The alternative mechanism — `<g style={{ transform: "var(--mafs-view-transform)" }}>`
and authoring in math units — also works and is what Mafs uses for
`Polygon`/`Polyline`/`Parametric`. **Do not use it for draw-on marks** (see §4).

---

## 3 · The two animation bindings — both work; use both, for different jobs

### (a) `motion.*` SVG element + MotionValue props — for `drawTo`

```tsx
import { motion, useMotionValue, animate } from "motion/react";

const draw = useMotionValue(0);                         // the mark's pathLength

<motion.line x1={x1} y1={y1} x2={x2} y2={y2}            // pixel coords, static
             pathLength={draw}                          // ← animated, no re-render
             stroke={Theme.blue} strokeWidth={4} strokeLinecap="round" />

animate(draw, 1, { duration: 0.6, ease: "easeInOut" }); // returns playback controls
```

Motion normalises with `pathLength="1"` and writes
`stroke-dasharray: "<v> 1"` each frame (confirmed in the DOM dump). Works on
`line`, `path`, `circle`, `ellipse`, `polygon`, `polyline`, `rect`.

### (b) Derived MotionValue for math→pixel — for `transformTo`

```tsx
const x = useMotionValue(-3.2);                          // handle holds MATH x
const cx = useTransform(x, (v) => vec.transform([v, y], toPx)[0]);
const cy = useTransform(x, (v) => vec.transform([v, y], toPx)[1]);
<motion.circle cx={cx} cy={cy} r={9} fill={Theme.orange} />
animate(x, 3, { duration: 0.7 });
```

`useTransform`'s recompute closure is rebuilt on every render and re-run
synchronously during render, so **a changed `viewTransform` (resize / zoom / pan)
propagates correctly** — verified: after resizing 720→520 px mid-animation the
marker sat at `cx = 195 = 3 × 65 px/unit`, exactly right (`7/8-resized-*.png`).

### (c) Manual `value.on("change", …)` → `setAttribute` — the escape hatch

```tsx
React.useEffect(() => {
  const write = (v: number) => {
    const [px, py] = vec.transform([v, y], toPx);
    ref.current?.setAttribute("cx", String(px));
    ref.current?.setAttribute("cy", String(py));
  };
  write(x.get());
  return x.on("change", write);        // returns the unsubscribe fn
}, [x, toPx]);
```

Pixel-identical to (b) at every sampled frame, and equally re-render-free. It is
**more** than a curiosity: it is the only way to animate a mark whose element
*Mafs* renders (§4), and the only way to animate an attribute `motion` does not
map. `useTransform` (b) is cleaner where you own the element — prefer (b), keep
(c) for Mafs-owned elements.

---

## 4 · The one real gotcha: `vector-effect: non-scaling-stroke` kills `pathLength`

In Chrome, `vector-effect: non-scaling-stroke` makes the dash pattern be computed
in **screen** space, which throws away the `pathLength="1"` normalisation. A
`stroke-dasharray: "0.4 1"` that should mean *40 % drawn* renders as a 0.4 px
dash repeated forever — i.e. a **dotted line, not a reveal**.

Seen twice in the screenshots (both are *deliberate failure controls*):

- the violet math-space line (L4, `non-scaling-stroke`) — dotted at every value;
- the **red sine** (L5) — a `<Plot.OfX>` fed `pathLength` through `svgPathProps`.
  Mafs styles `Parametric` with `vectorEffect: "non-scaling-stroke"` **and**
  `transform: "var(--mafs-view-transform)"`, so it inherits the bug.

Working controls in the same frames: the pink math-space line (math-unit stroke
width, no vector-effect) and the **indigo sine** — the same `<Plot.OfX>` with the
vector-effect overridden:

```tsx
// draw-on for a MAFS-RENDERED curve — the only variant that actually reveals
const pxPerUnit = Math.abs(vec.transform([1, 0], viewTransform)[0]);
<Plot.OfX
  y={f}
  svgPathProps={{
    ref,                                   // ← we drive stroke-dasharray on it
    pathLength: 1,
    strokeDasharray: "0 1",
    style: { vectorEffect: "none", strokeWidth: 3 / pxPerUnit },  // px → math units
  }}
/>
// + a draw.on("change", v => ref.current.setAttribute("stroke-dasharray", `${v} 1`))
```

**Rule for W1/W2:** any mark that can be `drawTo`-animated must be rendered
**by us, in pixel space, without `non-scaling-stroke`**. `Plot.OfX` draw-on is
possible via the override above, but it depends on Mafs internals (`svgPathProps`
spread order, its inline `style`) — treat it as the fallback, not the default.

### Smaller gotchas

- **`strokeLinecap="round"` + `pathLength = 0`** paints a dot at the start (and,
  when the gap equals the path length, at the end too — visible in
  `1-initial.png`). Either use `strokeLinecap="butt"` for draw-on marks, or bind
  `opacity` to `pathLength > 0`.
- **`core.css` is mandatory** (`.MafsView` defines `--mafs-bg`, `--mafs-fg`, all
  `--mafs-<color>` vars and every `.mafs-movable-point-*` rule — without it the
  draggable point is invisible and unstyled). Copy it next to the bundle exactly
  the way KaTeX's CSS is copied. `font.css` is optional (it pulls the
  `computer-modern` webfont via `@import`) — **skip it in the sandbox**, it would
  be a network fetch under the CSP.
- **`.MafsView path { stroke: var(--mafs-fg) }`** in `core.css` forces a stroke on
  *any* custom `<path>` we render. Always set `stroke` explicitly.
- **Mafs' `TransformContext` value is a fresh object literal on every
  `MafsCanvas` render** (no `useMemo`, `index.js:959`). So every component calling
  `useTransformContext()` re-renders whenever Mafs re-renders internally. Cheap,
  but keep the layer's render body trivial (transform math only) — and it is why
  `PixelLayer` shows 14 renders where `App` shows 13.
- **`<Mafs width="auto">` renders *nothing* until its ResizeObserver reports a
  width > 0.** Fine interactively; a hazard for the Phase-4 headless keyframe
  capture — pass a fixed numeric `width`, or `ssr` (which defaults the width to
  500), or wait for `.MafsView svg` to exist.
- **`preserveAspectRatio="contain"` (the default) keeps the scale uniform.** Don't
  change it without re-checking: a non-uniform scale distorts anything rendered
  in math space (circles → ellipses, dash pacing along diagonals).
- **esbuild:** the sandbox options work as-is (`format: "iife"`, `target: es2022`,
  `jsx: "automatic"`, `define: process.env.NODE_ENV`). Both libs are ESM with
  clean `exports` maps; no `mainFields`/alias/`banner` tweak was needed. Note that
  `docs/` is excluded from `tsconfig.json`, so **the spike is never typechecked** —
  that is how the `viewTransform[0][0]` NaN bug survived. Runtime code in
  `sandbox/` will be typechecked; don't rely on the spike's types.
- **Motion runs its own rAF loop.** The plan wants "one engine clock". Two clean
  options: (a) schedule the clock's own work on Motion's loop via the exported
  `frame` / `cancelFrame`, or (b) pass `driver` (a
  `(update) => { start, stop, now }`) in the transition options so Motion ticks
  off *our* clock. (a) is enough for W1; (b) exists if the sim must be
  frame-locked to the director.

---

## 5 · RECOMMENDATION — how `sandbox/stage/scene.tsx` should be structured

1. **Keep the split the plan proposed.** `<Mafs>` owns the static/interactive
   layer (`Coordinates.*`, `Plot.OfX`, `MovablePoint`, plus any purely
   state-bound mark). Every **handle-bound / director-animated** mark renders in
   **our own pixel-space layer**, as a **direct child of `<Mafs>`** — no overlay
   SVG, no portal, no wrapper component. The fallback options in the task brief
   (rAF-driven state through Mafs props; a sibling overlay SVG) are **not needed
   and should not be built**.

2. **One transform hook, used by every custom mark:**

```tsx
// sandbox/stage/scene.tsx
export function useToPx() {
  const { viewTransform, userTransform } = useTransformContext();
  return React.useMemo(
    () => vec.matrixMult(viewTransform, userTransform),
    [viewTransform, userTransform],
  );
}
export const toPx  = (p: vec.Vector2, m: vec.Matrix) => vec.transform(p, m);
export const pxPer = (m: vec.Matrix) => Math.abs(vec.transform([1, 0], m)[0]);
```

   This is also exactly what `<Custom>` should hand the author (it generalises
   today's `PlotCtx`): `{ toPx, pxPer, viewBox }`.

3. **`useMark()` returns a bag of MotionValues, never React state:**
   `{ pathLength, x, y, opacity }`. Marks read them; the store never sees them.
   `drawTo(mark)` → `animate(mark.pathLength, 1, opts)`;
   `transformTo(mark, {x,y})` → `animate(mark.x, x, opts)` (+ y);
   `fadeTo(mark, o)` → `animate(mark.opacity, o, opts)`.
   `dir.reset()` → `controls.stop()` on everything in flight, then
   `value.set(initial)` — measured at **0 React renders**.

4. **Two rendering shapes inside `Plot.*`, chosen by binding:**

```tsx
// state-bound (declarative geometry, optional draw-on reveal)
function Segment({ point1, point2, mark, color, weight = 3 }) {
  const m = useToPx();
  const [x1, y1] = vec.transform(point1, m);
  const [x2, y2] = vec.transform(point2, m);
  return (
    <motion.line
      x1={x1} y1={y1} x2={x2} y2={y2}
      pathLength={mark?.pathLength}          // undefined ⇒ plain static line
      stroke={color} strokeWidth={weight} strokeLinecap="butt"
      style={{ opacity: mark?.opacity }}
    />
  );
}

// handle-bound (position lives on the mark)
function Point({ mark, color, r = 6 }) {
  const m = useToPx();
  const cx = useTransform([mark.x, mark.y], ([x, y]) => vec.transform([x, y], m)[0]);
  const cy = useTransform([mark.x, mark.y], ([x, y]) => vec.transform([x, y], m)[1]);
  return <motion.circle cx={cx} cy={cy} r={r} fill={color} style={{ opacity: mark.opacity }} />;
}
```

   A mark passed to a `Plot.*` wrapper therefore needs **no** special layer — the
   wrapper *is* the layer. `<Custom>` is the same thing with the author's own
   children.

5. **Do not route director animation through Mafs props.** No `useState`/rAF
   feeding `point={[x,y]}`; no re-rendering `<Mafs>` per frame. It is measurably
   unnecessary.

6. **Wire-up checklist for step 6 of the plan:** copy `mafs/core.css` (not
   `font.css`) in `scripts/build-sandbox.mjs` and `<link>` it from
   `public/sandbox.html`; expect ~+160 kB gz; override `--mafs-bg` / `--mafs-fg`
   to match the lesson theme (defaults are black/white).

---

## 6 · What the W1 implementer must NOT do

- **Don't** put draw-on marks inside a `--mafs-view-transform` group, and **don't**
  give them `vector-effect: non-scaling-stroke` — `pathLength` reveal silently
  degrades into a dotted line (proof: violet + red curves in every screenshot).
- **Don't** index `vec.Matrix` as a 2-D array; it is `[a,b,c,d,e,f]`.
- **Don't** animate by re-rendering: no `useState` + rAF driving Mafs props, no
  `motion.div`-style layout animation, no `key` churn on marks.
- **Don't** build a sibling/overlay SVG positioned over the plane, or a portal.
  It is unnecessary and would need its own resize + transform plumbing.
- **Don't** fork or patch Mafs. The only internals relied on are (i)
  `useTransformContext()` + `vec` — both **public, documented, exported API**
  ("useful for building custom Mafs components"), low risk; and (ii) the
  `svgPathProps` spread on `Parametric` — semi-internal, used *only* by the
  optional `Plot.OfX` draw-on fallback, medium risk. Nothing else.
- **Don't** ship `mafs/font.css` into the sandbox (it `@import`s a webfont over
  the network — the CSP will block it and the lesson will log an error).
- **Don't** assume `<Mafs width="auto">` has painted anything on the first frame.
