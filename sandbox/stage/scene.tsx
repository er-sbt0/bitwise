// The scene layer: the `Plot.*` std-lib, over Mafs.
//
// The split is the one the W1 spike measured (docs/spikes/w1-hybrid/FINDINGS.md
// §5): **Mafs owns the static / interactive layer** (axes, sampled curves,
// draggable points) and every **handle-bound or draw-on mark is rendered by us,
// in PIXEL space, as a direct child of `<Mafs>`**. No overlay svg, no portal, no
// `--mafs-view-transform` group — a `pathLength` reveal inside one silently
// degrades into a permanently dotted line (FINDINGS §4), and an overlay would
// need its own resize + transform plumbing for nothing.
//
// Nothing here re-renders per animation frame: geometry is declarative, and the
// two animated channels (reveal fraction, handle position) are Motion values
// written straight to DOM attributes.
import * as React from "react";
import {
  Coordinates,
  Mafs,
  MovablePoint as MafsMovablePoint,
  Plot as MafsPlot,
  useTransformContext,
  vec,
} from "mafs";
import type { MotionValue } from "motion/react";
import { liveMarks, type Mark } from "./mark";
import { tokens } from "./tokens";

// ---- palette ----------------------------------------------------------------
// The named figure hues, projected out of the engine's design tokens so a mark
// and a scene-kit panel can never disagree on "blue". The COLORS/col names are
// kept because other code binds to them; only their source moved.
export const COLORS: Record<string, string> = {
  blue: tokens.color.blue,
  coral: tokens.color.coral,
  green: tokens.color.green,
  violet: tokens.color.violet,
  orange: tokens.color.orange,
  ink: tokens.color.ink,
};
export const col = (c?: string) => COLORS[c ?? "blue"] ?? COLORS.blue;

// ---- the one transform source ----------------------------------------------

/** Figure units ⇄ pixels, handed to `<Custom>` and used by every wrapper. */
export type PlotCtx = {
  xToPx(x: number): number;
  yToPx(y: number): number;
  pxToX(px: number): number;
  pxToY(py: number): number;
};

/**
 * The mechanism Mafs' own `Point` / `Line.Segment` use:
 * `vec.transform(p, matrixMult(viewTransform, userTransform))`. `userTransform`
 * must be in the product or marks break inside a `<Transform>`.
 *
 * `vec.Matrix` is a FLAT 6-tuple `[a,b,c,d,e,f]` — never index it as a 2-D
 * array (that produced the NaN stroke width that ate a hitbox in the spike).
 */
export function useToPx(): PlotCtx {
  const { viewTransform, userTransform } = useTransformContext();
  return React.useMemo(() => {
    const m = vec.matrixMult(viewTransform, userTransform);
    const inv = vec.matrixInvert(m);
    return {
      xToPx: (x: number) => vec.transform([x, 0], m)[0],
      yToPx: (y: number) => vec.transform([0, y], m)[1],
      pxToX: (px: number) => (inv ? vec.transform([px, 0], inv)[0] : px),
      pxToY: (py: number) => (inv ? vec.transform([0, py], inv)[1] : py),
    };
  }, [viewTransform, userTransform]);
}

/**
 * Write derived pixel geometry straight to the DOM whenever a mark value
 * changes — FINDINGS §3(c). Used instead of `motion.*` props for positions
 * carried on a `<g>`/`<text>`, where Motion maps `x`/`y` onto a CSS transform
 * rather than the SVG attribute.
 *
 * Deliberately no dependency array: `write` closes over this render's transform
 * and props, and re-subscribing costs nothing because renders only happen on
 * state change — never per frame.
 */
function useMarkBinding(values: MotionValue<number>[], write: () => void) {
  React.useLayoutEffect(() => {
    write();
    const offs = values.map((v) => v.on("change", write));
    return () => offs.forEach((o) => o());
  });
}

/** React's useId embeds `:`, which is illegal in a bare `url(#…)` reference. */
const useSvgId = (prefix: string) => prefix + React.useId().replace(/:/g, "");

// ---- the plane --------------------------------------------------------------

export type PlotProps = {
  x?: [number, number];
  y?: [number, number];
  grid?: boolean | "cartesian" | "polar";
  preserveAspect?: boolean;
  height?: number;
  children?: React.ReactNode;
};

/** Slack added to each axis so an edge tick label isn't sliced in half by the
 *  frame. Per-axis (Mafs' own `viewBox.padding` is one number in MATH units, so
 *  on a 7×14 domain it would be worth 4× as many pixels sideways as upward). */
const BLEED = 0.03;
const bleed = ([a, b]: [number, number]): [number, number] => {
  const d = (b - a) * BLEED;
  return [a - d, b + d];
};

function PlotRoot({
  x = [-5, 5],
  y = [-5, 5],
  grid = true,
  preserveAspect = false,
  height = 320,
  children,
}: PlotProps) {
  return (
    <div className="bw-plot">
      <Mafs
        width="auto"
        height={height}
        pan={false}
        zoom={false}
        // `ssr` is Mafs' only lever for a non-zero FIRST-paint width: with
        // width="auto" it renders literally nothing until its ResizeObserver
        // reports, which costs a lesson its opening frame (FINDINGS §4).
        ssr
        // Default is exact-fit, not "contain": the author picked x/y as the
        // region they want to SEE, and `contain` would letterbox a tall domain
        // into a wide column. Everything we draw is in pixel space, so a
        // non-uniform scale distorts nothing; `preserveAspect` opts back in.
        preserveAspectRatio={preserveAspect ? "contain" : false}
        viewBox={{ x: bleed(x), y: bleed(y), padding: 0 }}
      >
        {grid !== false && (grid === "polar" ? <Coordinates.Polar /> : <Coordinates.Cartesian />)}
        {children}
      </Mafs>
    </div>
  );
}

/**
 * Re-render this subtree while ANY live mark is animating.
 *
 * Everything else in this file writes derived geometry straight to the DOM and
 * never re-renders per frame — but a `<Custom>` draw function computes its whole
 * SVG in JS, so there is nothing to write *to*: the only way its geometry can
 * follow a tween is to run the function again. Subscription is automatic rather
 * than declared, because the failure mode of a forgotten `marks={…}` prop is
 * silent (the beat plays, the figure sits still) — and it costs nothing at rest,
 * since a MotionValue only fires while a beat is actually running.
 *
 * Coalesced onto one frame: a beat that moves x, y and opacity together is one
 * render, not three.
 */
function useAnimationTick(enabled: boolean) {
  const [, bump] = React.useReducer((n: number) => n + 1, 0);
  // No dependency array on purpose (same reasoning as useMarkBinding): the set
  // of live marks changes as the lesson mounts, and re-subscribing is cheap
  // because renders only happen on state change — never per frame.
  React.useLayoutEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        bump();
      });
    };
    const offs = liveMarks().flatMap((m) => Object.values(m.values).map((v) => v.on("change", schedule)));
    return () => {
      offs.forEach((o) => o());
      if (raf) cancelAnimationFrame(raf);
    };
  });
}

/**
 * The freeform hatch (generalises the old `PlotCtx`). A `<Plot>` child that gets
 * the transforms and renders whatever SVG the author returns, in pixel space.
 *
 * The draw function may read mark channels live — `corner.opacity`, `tile.x` —
 * and re-runs on every animation frame of a director beat, so hand-drawn SVG
 * animates exactly like a stock mark. Pass `static` to opt out for a figure that
 * genuinely never moves.
 */
export function Custom({
  draw,
  static: isStatic,
}: {
  draw: (ctx: PlotCtx) => React.ReactNode;
  static?: boolean;
}) {
  const t = useToPx();
  useAnimationTick(!isStatic);
  return <>{draw(t)}</>;
}

// ---- marks ------------------------------------------------------------------

type OfXProps = {
  y: (x: number) => number;
  color?: string;
  style?: "solid" | "dashed" | "dotted";
  mark?: Mark;
};

function OfX({ y, color, style, mark }: OfXProps) {
  const t = useToPx();
  const weight = 2.5;
  // Draw-on for a MAFS-rendered path is the documented fallback, not the
  // default: Mafs styles Parametric with `vector-effect: non-scaling-stroke`,
  // which makes Chrome compute the dash pattern in screen space and throws away
  // the pathLength normalisation. Overriding it means the stroke width has to be
  // expressed in math units (FINDINGS §4) — so on a non-uniform plane (the
  // `preserveAspect={false}` default) a revealed curve's stroke thickens along
  // whichever axis is compressed. Pass `preserveAspect` if that shows.
  const pxPerX = Math.abs(t.xToPx(1) - t.xToPx(0)) || 1;
  return (
    <MafsPlot.OfX
      y={y}
      color={col(color)}
      weight={weight}
      style={style === "dashed" ? "dashed" : "solid"}
      svgPathProps={
        mark
          ? {
              ref: (el) => mark.attach(el, { draw: true }),
              style: { vectorEffect: "none", strokeWidth: weight / pxPerX },
            }
          : undefined
      }
    />
  );
}

type PointProps = {
  x?: number;
  y?: number;
  color?: string;
  label?: string;
  mark?: Mark;
};

/** `x_{n+1}` / `x_1` → base + subscript. Labels are short symbol names, not
 *  prose; a KaTeX render would need a foreignObject for no extra meaning. */
function labelParts(s: string): [string, string] {
  const m = /^([^_]+)_\{?([^}]*)\}?$/.exec(s);
  return m ? [m[1], m[2]] : [s, ""];
}

function Point({ x, y, color, label, mark }: PointProps) {
  const t = useToPx();
  const g = React.useRef<SVGGElement | null>(null);
  const c = col(color);
  const [base, sub] = label ? labelParts(label) : ["", ""];

  // Each coordinate falls back to the handle INDEPENDENTLY — a mark-bound point
  // routinely pins one axis by prop and lets `transformTo` own the other.
  useMarkBinding(mark ? [mark.values.x, mark.values.y] : [], () => {
    const px = t.xToPx(x ?? (mark ? mark.get("x") : 0));
    const py = t.yToPx(y ?? (mark ? mark.get("y") : 0));
    g.current?.setAttribute("transform", `translate(${px},${py})`);
  });

  return (
    <g
      ref={(el) => {
        g.current = el;
        // draw:false — a point has no reveal, and a 0 fraction would blank it.
        mark?.attach(el, { draw: false });
      }}
    >
      <circle r={5} fill={c} />
      {label && (
        <text x={9} y={-9} fontSize={13} fill={c} className="mafs-shadow">
          {base}
          {sub && (
            <tspan dy={4} fontSize={10}>
              {sub}
            </tspan>
          )}
        </text>
      )}
    </g>
  );
}

type SegmentProps = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color?: string;
  strokeWidth?: number;
  dashed?: boolean;
  mark?: Mark;
};

function Segment({ x1, y1, x2, y2, color, strokeWidth = 3, dashed, mark }: SegmentProps) {
  const t = useToPx();
  const id = useSvgId("bwseg");
  const [ax, ay] = [t.xToPx(x1), t.yToPx(y1)];
  const [bx, by] = [t.xToPx(x2), t.yToPx(y2)];
  return (
    <>
      {/* `dashed` and the reveal both want stroke-dasharray, and attach() owns
          it — so the dashes come from a mask instead: a static dashed white
          stroke that the solid, progressively-revealed line is cut by.
          maskUnits MUST be userSpaceOnUse; the default objectBoundingBox region
          is degenerate for an axis-parallel segment (zero-width bbox ⇒ the
          element disappears entirely), and the golden lesson's drop line is
          exactly that. */}
      {dashed && (
        <mask id={id} maskUnits="userSpaceOnUse" x={-9999} y={-9999} width={19998} height={19998}>
          <line
            x1={ax}
            y1={ay}
            x2={bx}
            y2={by}
            stroke="#fff"
            strokeWidth={strokeWidth + 2}
            strokeDasharray="7 5"
          />
        </mask>
      )}
      <line
        ref={(el) => mark?.attach(el, { draw: true })}
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={col(color)}
        strokeWidth={strokeWidth}
        // butt, not round: a round cap paints a dot at pathLength 0 (FINDINGS §4).
        strokeLinecap="butt"
        mask={dashed ? `url(#${id})` : undefined}
      />
    </>
  );
}

type PolygonProps = {
  points: [number, number][];
  color?: string;
  fillOpacity?: number;
  mark?: Mark;
};

function Polygon({ points, color, fillOpacity = 0.15, mark }: PolygonProps) {
  const t = useToPx();
  const c = col(color);
  const pts = points.map(([px, py]) => `${t.xToPx(px)},${t.yToPx(py)}`).join(" ");
  // A pathLength reveal draws the OUTLINE only — SVG has no way to reveal a
  // fill, so a drawn-on polygon fills as soon as its first edge appears.
  return (
    <polygon
      ref={(el) => mark?.attach(el, { draw: true })}
      points={pts}
      fill={c}
      fillOpacity={fillOpacity}
      stroke={c}
      strokeWidth={2}
      strokeLinejoin="round"
    />
  );
}

type MovablePointProps = {
  x: number;
  y: number;
  onMove: (p: { x: number; y: number }) => void;
  constrain?: "horizontal" | "vertical" | ((p: { x: number; y: number }) => { x: number; y: number });
  color?: string;
  mark?: Mark;
};

function MovablePoint({ x, y, onMove, constrain, color, mark }: MovablePointProps) {
  // Mafs' own `MovablePoint` takes only a constraint FUNCTION (the string form
  // lives in `useMovablePoint`, which owns its own state and so can't be driven
  // from the store). Translating the two names here keeps the point controlled.
  const constrainFn = React.useMemo(() => {
    if (constrain === "horizontal") return ([px]: vec.Vector2): vec.Vector2 => [px, y];
    if (constrain === "vertical") return ([, py]: vec.Vector2): vec.Vector2 => [x, py];
    if (typeof constrain === "function") {
      return ([px, py]: vec.Vector2): vec.Vector2 => {
        const p = constrain({ x: px, y: py });
        return [p.x, p.y];
      };
    }
    return (p: vec.Vector2): vec.Vector2 => p;
  }, [constrain, x, y]);

  return (
    <g ref={(el) => mark?.attach(el, { draw: false })}>
      <MafsMovablePoint
        point={[x, y]}
        onMove={([px, py]) => onMove({ x: px, y: py })}
        constrain={constrainFn}
        color={col(color)}
      />
    </g>
  );
}

// ---- assembly ---------------------------------------------------------------

export const Plot = Object.assign(PlotRoot, {
  OfX,
  Point,
  Segment,
  Polygon,
  MovablePoint,
});
