/**
 * W1 spike — Mafs (declarative substrate) + Motion (per-frame director) hybrid.
 *
 * Question: can director-animated marks live in OUR OWN thin SVG layer *inside*
 * Mafs's coordinate space, driven straight off Motion values, with zero React
 * re-renders per frame?
 *
 * Four candidate layers are rendered side by side so the FINDINGS can be
 * decisive rather than hopeful:
 *
 *   L1  pixel-space  + motion.line  (pathLength)   — Mafs-idiomatic math→px in JS
 *   L2  pixel-space  + motion.circle (cx/cy via useTransform derived MotionValue)
 *   L3  pixel-space  + plain <circle> + motionValue.on("change") → setAttribute
 *   L4  math-space   + <g style={{transform:"var(--mafs-view-transform)"}}>
 *                      (two lines: one with vector-effect:non-scaling-stroke,
 *                       one with a math-unit stroke width)
 *   L5  draw-on applied to a MAFS-OWNED <Plot.OfX> path via svgPathProps + ref
 *                      (default styling vs. a vector-effect override)
 *
 * Plus a width toggle (Mafs width="auto") to prove the layer survives a
 * viewTransform change while MotionValues hold MATH coordinates.
 *
 * Instrumentation: per-component render counters + Motion change-tick counters,
 * both mirrored onto `window.__spike` and painted into #stats by a raw rAF loop
 * (NOT React) so reading them never perturbs the measurement.
 */
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  Mafs,
  Coordinates,
  Plot,
  MovablePoint,
  Theme,
  useTransformContext,
  vec,
} from "mafs";
import { motion, useMotionValue, useTransform, animate } from "motion/react";

// ---------------------------------------------------------------- instrument

type Spike = {
  renders: Record<string, number>;
  ticks: Record<string, number>;
  playStart: number;
  playEnd: number;
  errors: string[];
  values: Record<string, number>;
};

const spike: Spike = {
  renders: { App: 0, PixelLayer: 0, MathLayer: 0, Stats: 0 },
  ticks: { draw: 0, slide: 0, drawMath: 0 },
  playStart: 0,
  playEnd: 0,
  errors: [],
  values: {},
};
(window as unknown as { __spike: Spike }).__spike = spike;

const count = (k: keyof Spike["renders"] | string) => {
  spike.renders[k] = (spike.renders[k] ?? 0) + 1;
};

// ---------------------------------------------------------------- geometry

const CURVE = (x: number) => 0.35 * x * x - 1.6;

// L1: the "draw-on" segment (a stand-in for the Newton tangent)
const SEG_A: vec.Vector2 = [-3.2, -2.3];
const SEG_B: vec.Vector2 = [3.2, 2.1];

// L2 / L3: sliding markers
const SLIDE_FROM = -3.2;
const SLIDE_TO = 3.0;
const SLIDE_Y_MOTION = 2.55; // motion.circle row
const SLIDE_Y_MANUAL = 2.15; // manual .on("change") row

// L4: math-space lines
const MATH_LINE_Y_NSS = -2.8;
const MATH_LINE_Y_UNIT = -3.15;

// ---------------------------------------------------------------- L1/L2/L3

/**
 * Our own animated layer, rendered as a DIRECT CHILD of <Mafs>.
 * It converts math → pixel exactly the way Mafs' own <Line.Segment>/<Point> do:
 * `vec.transform(p, vec.matrixMult(viewTransform, userTransform))`.
 */
function PixelLayer({
  draw,
  slideX,
}: {
  draw: ReturnType<typeof useMotionValue<number>>;
  slideX: ReturnType<typeof useMotionValue<number>>;
}) {
  count("PixelLayer");

  const { viewTransform, userTransform } = useTransformContext();
  const toPx = React.useMemo(
    () => vec.matrixMult(viewTransform, userTransform),
    [viewTransform, userTransform],
  );

  const [x1, y1] = vec.transform(SEG_A, toPx);
  const [x2, y2] = vec.transform(SEG_B, toPx);

  // L2 — derived MotionValues. Recomputed per frame off `slideX` WITHOUT React.
  const cx = useTransform(slideX, (x) => vec.transform([x, SLIDE_Y_MOTION], toPx)[0]);
  const cy = useTransform(slideX, (x) => vec.transform([x, SLIDE_Y_MOTION], toPx)[1]);

  // L3 — manual subscription writing straight to the DOM node.
  const manualRef = React.useRef<SVGCircleElement | null>(null);
  React.useEffect(() => {
    const write = (x: number) => {
      const [px, py] = vec.transform([x, SLIDE_Y_MANUAL], toPx);
      const el = manualRef.current;
      if (!el) return;
      el.setAttribute("cx", String(px));
      el.setAttribute("cy", String(py));
    };
    write(slideX.get());
    return slideX.on("change", write);
  }, [slideX, toPx]);

  return (
    <g data-layer="pixel-space">
      {/* L1 — draw-on via pathLength (Motion normalises pathLength to 1 and
          animates stroke-dasharray/dashoffset). */}
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        pathLength={draw}
        stroke={Theme.blue}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* L2 — motion.circle bound to derived MotionValues */}
      <motion.circle cx={cx} cy={cy} r={9} fill={Theme.orange} />
      {/* L3 — plain circle, imperative .on("change") */}
      <circle ref={manualRef} r={9} fill={Theme.green} />
    </g>
  );
}

// ---------------------------------------------------------------- L4

/**
 * The alternative coordinate mechanism: let CSS do it. Mafs puts
 * `--mafs-view-transform` on the root <svg>, so any descendant can opt in with
 * `style={{ transform: "var(--mafs-view-transform)" }}` and then author in MATH
 * coordinates. (This is what Mafs' own <Polygon>/<Polyline> do.)
 */
function MathLayer({ draw }: { draw: ReturnType<typeof useMotionValue<number>> }) {
  count("MathLayer");
  return (
    <g data-layer="math-space" style={{ transform: "var(--mafs-view-transform)" }}>
      {/* non-scaling-stroke: stroke width in px, geometry in math units */}
      <motion.line
        x1={-3.2}
        y1={MATH_LINE_Y_NSS}
        x2={3.2}
        y2={MATH_LINE_Y_NSS}
        pathLength={draw}
        style={{
          stroke: Theme.violet,
          strokeWidth: 4,
          strokeLinecap: "round",
          vectorEffect: "non-scaling-stroke",
        }}
      />
      {/* math-unit stroke width (no vector-effect) — control case */}
      <motion.line
        x1={-3.2}
        y1={MATH_LINE_Y_UNIT}
        x2={3.2}
        y2={MATH_LINE_Y_UNIT}
        pathLength={draw}
        style={{
          stroke: Theme.pink,
          strokeWidth: 0.08,
          strokeLinecap: "round",
        }}
      />
    </g>
  );
}

// ---------------------------------------------------------------- L5

const CURVE_B = (x: number) => 1.9 * Math.sin(x * 1.4);

/**
 * Can we draw-on a mark that MAFS renders (Plot.OfX → <path>)? Mafs forwards
 * `svgPathProps` onto the <path>, so we can hand it a ref + pathLength={1} and
 * write stroke-dasharray ourselves from the same MotionValue — still no React
 * render per frame.
 *
 * Catch: Mafs styles that path with `vector-effect: non-scaling-stroke`, which
 * makes Chrome compute the dash pattern in SCREEN space and therefore ignore
 * the pathLength={1} normalisation. `override` restores it (stroke width then
 * has to be expressed in math units).
 */
function DrawOnMafsCurve({
  draw,
  y,
  color,
  override,
}: {
  draw: ReturnType<typeof useMotionValue<number>>;
  y: (x: number) => number;
  color: string;
  override: boolean;
}) {
  const ref = React.useRef<SVGPathElement | null>(null);
  const { viewTransform } = useTransformContext();
  // vec.Matrix is a FLAT 6-tuple [a,b,c,d,e,f] (CSS matrix order) — never index
  // it like a 2-D array. Ask it to transform a unit x-vector instead.
  const pxPerUnit = Math.abs(vec.transform([1, 0], viewTransform)[0]);

  React.useEffect(() => {
    const write = (v: number) => ref.current?.setAttribute("stroke-dasharray", `${v} 1`);
    write(draw.get());
    return draw.on("change", write);
  }, [draw]);

  return (
    <Plot.OfX
      y={y}
      color={color}
      svgPathProps={{
        ref,
        pathLength: 1,
        strokeDasharray: "0 1",
        style: override
          ? { vectorEffect: "none", strokeWidth: 3 / pxPerUnit }
          : undefined,
      }}
    />
  );
}

// ---------------------------------------------------------------- app

function App() {
  count("App");

  const [pt, setPt] = React.useState<vec.Vector2>([1.6, CURVE(1.6)]);
  const [wide, setWide] = React.useState(true);

  const draw = useMotionValue(0);
  const slideX = useMotionValue(SLIDE_FROM);

  // tick counters — proof the values really are updating per animation frame
  React.useEffect(() => {
    const offs = [
      draw.on("change", () => {
        spike.ticks.draw++;
        spike.values.draw = draw.get();
      }),
      slideX.on("change", () => {
        spike.ticks.slide++;
        spike.values.slideX = slideX.get();
      }),
    ];
    return () => offs.forEach((o) => o());
  }, [draw, slideX]);

  const running = React.useRef<Array<{ stop: () => void }>>([]);

  const play = React.useCallback(() => {
    running.current.forEach((a) => a.stop());
    spike.ticks.draw = 0;
    spike.ticks.slide = 0;
    spike.playStart = performance.now();
    spike.playEnd = 0;
    draw.set(0);
    slideX.set(SLIDE_FROM);
    const a1 = animate(draw, 1, { duration: 1.6, ease: "easeInOut" });
    const a2 = animate(slideX, SLIDE_TO, { duration: 1.6, ease: "easeInOut" });
    running.current = [a1, a2];
    Promise.all([a1, a2]).then(() => {
      spike.playEnd = performance.now();
    });
  }, [draw, slideX]);

  const reset = React.useCallback(() => {
    running.current.forEach((a) => a.stop());
    running.current = [];
    draw.set(0);
    slideX.set(SLIDE_FROM);
    spike.playEnd = 0;
  }, [draw, slideX]);

  (window as unknown as { __play: () => void; __reset: () => void }).__play = play;
  (window as unknown as { __play: () => void; __reset: () => void }).__reset = reset;

  return (
    <div>
      <div className="bar">
        <button id="play" onClick={play}>
          Play
        </button>
        <button id="reset" onClick={reset}>
          Reset
        </button>
        <button id="resize" onClick={() => setWide((w) => !w)}>
          Width: {wide ? "720" : "520"}
        </button>
        <span id="ptlabel">
          draggable point: [{pt[0].toFixed(2)}, {pt[1].toFixed(2)}]
        </span>
      </div>

      <div id="plotbox" style={{ width: wide ? 720 : 520 }}>
        <Mafs width="auto" height={520} viewBox={{ x: [-3.5, 3.5], y: [-3, 3] }} pan={false}>
          {/* --- Mafs' own static / interactive layer --- */}
          <Coordinates.Cartesian />
          <Plot.OfX y={CURVE} color={Theme.foreground} />
          <MovablePoint point={pt} onMove={setPt} color={Theme.yellow} />

          {/* --- L5: draw-on applied to Mafs-rendered paths --- */}
          <DrawOnMafsCurve draw={draw} y={CURVE_B} color={Theme.red} override={false} />
          <DrawOnMafsCurve draw={draw} y={(x) => CURVE_B(x) + 0.35} color={Theme.indigo} override />

          {/* --- OUR layers, direct children of <Mafs> --- */}
          <PixelLayer draw={draw} slideX={slideX} />
          <MathLayer draw={draw} />
        </Mafs>
      </div>

      <pre id="stats" />
    </div>
  );
}

// ---------------------------------------------------------------- mount

window.addEventListener("error", (e) => spike.errors.push(String(e.message)));
window.addEventListener("unhandledrejection", (e) =>
  spike.errors.push("unhandledrejection: " + String((e as PromiseRejectionEvent).reason)),
);
const origError = console.error;
console.error = (...args: unknown[]) => {
  spike.errors.push(args.map(String).join(" "));
  origError(...args);
};

createRoot(document.getElementById("root")!).render(<App />);

// Stats painted by a raw rAF loop — deliberately OUTSIDE React so that reading
// the render counters cannot itself cause a render.
const statsEl = () => document.getElementById("stats");
let lastFrame = performance.now();
let fps = 0;
(function paint() {
  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;
  fps = fps ? fps * 0.9 + (1000 / dt) * 0.1 : 1000 / dt;
  const el = statsEl();
  if (el) {
    const dur = spike.playEnd ? spike.playEnd - spike.playStart : now - spike.playStart;
    el.textContent = [
      `React renders   App=${spike.renders.App}  PixelLayer=${spike.renders.PixelLayer}  MathLayer=${spike.renders.MathLayer}`,
      `Motion ticks    draw=${spike.ticks.draw}  slide=${spike.ticks.slide}`,
      `values          draw=${(spike.values.draw ?? 0).toFixed(3)}  slideX=${(spike.values.slideX ?? 0).toFixed(3)}`,
      `anim            ${spike.playStart ? `${dur.toFixed(0)}ms` : "-"}  ticks/s=${
        spike.playStart && dur > 0 ? ((spike.ticks.draw / dur) * 1000).toFixed(1) : "-"
      }  rAF fps=${fps.toFixed(0)}`,
      `console errors  ${spike.errors.length}${spike.errors.length ? " :: " + spike.errors[0].slice(0, 160) : ""}`,
    ].join("\n");
  }
  requestAnimationFrame(paint);
})();
