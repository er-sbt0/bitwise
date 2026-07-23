// Runtime implementation of the Bitwise Lesson SDK core tier (see sdk/sdk.d.ts
// for the contract). This runs INSIDE the sandbox iframe. Everything exported
// via buildScope() is injected as an in-scope global for model-generated
// lesson code. Implementations are intentionally lightweight for M0 — the
// contract is what's stable, not this code.
import React from "react";
import { create, all } from "mathjs";
import katex from "katex";
import { marked } from "marked";

const math = create(all, {});

// ---- telemetry bridge (wired by runtime.tsx) --------------------------------
let emitFn: (event: string, data?: unknown) => void = () => {};
export function setEmit(fn: (event: string, data?: unknown) => void) {
  emitFn = fn;
}
function track(event: string, data?: Record<string, unknown>) {
  emitFn(event, data);
}

// ---- formatting + math engine -----------------------------------------------
function fmt(v: number, digits = 3): string {
  if (!isFinite(v)) return String(v);
  return String(Number(v.toFixed(digits)));
}

function evalNumber(input: string): number {
  try {
    const r = math.evaluate(input);
    return typeof r === "number" ? r : NaN;
  } catch {
    return NaN;
  }
}

function exprEquivalent(a: string, b: string, vars: string[] = ["x"]): boolean {
  try {
    if (math.simplify(`(${a}) - (${b})`).toString() === "0") return true;
  } catch {
    /* fall through to numeric sampling */
  }
  try {
    const ca = math.compile(a);
    const cb = math.compile(b);
    const samples = [-2.3, -1.1, 0.7, 1.9, 3.3, -0.5];
    let checked = 0;
    for (const base of samples) {
      const scope: Record<string, number> = {};
      vars.forEach((v, i) => (scope[v] = base + i * 0.41));
      const va = ca.evaluate(scope);
      const vb = cb.evaluate(scope);
      if (!isFinite(va) || !isFinite(vb)) continue;
      if (Math.abs(va - vb) > 1e-6 * (1 + Math.abs(va))) return false;
      checked++;
    }
    return checked > 0;
  } catch {
    return false;
  }
}

const mathAPI = {
  evaluate: (expr: string, scope?: Record<string, number>) => math.evaluate(expr, scope),
  compile: (expr: string) => {
    const c = math.compile(expr);
    return (scope?: Record<string, number>) => c.evaluate(scope ?? {});
  },
  simplify: (expr: string) => math.simplify(expr).toString(),
  derivative: (expr: string, v = "x") => math.derivative(expr, v).toString(),
  equivalent: (a: string, b: string) => exprEquivalent(a, b, ["x"]),
  format: (v: number, opts?: { digits?: number }) => fmt(v, opts?.digits ?? 3),
};

// ---- grading ----------------------------------------------------------------
type GradeResult = { correct: boolean; feedback?: string };

function parsePoint(input: string): [number, number] | null {
  const m = input.match(/-?\s*\(?\s*([^,]+?)\s*,\s*([^)]+?)\s*\)?\s*$/);
  if (!m) return null;
  const x = evalNumber(m[1]);
  const y = evalNumber(m[2]);
  if (isNaN(x) || isNaN(y)) return null;
  return [x, y];
}

function grade(spec: any, input: string): GradeResult {
  const raw = (input ?? "").trim();
  switch (spec.type) {
    case "numeric": {
      const v = evalNumber(raw);
      if (isNaN(v)) return { correct: false, feedback: "Enter a number." };
      const tol = spec.tolerance ?? 1e-6;
      return { correct: Math.abs(v - spec.value) <= tol };
    }
    case "expression":
      return { correct: exprEquivalent(raw, String(spec.value), spec.vars ?? ["x"]) };
    case "point": {
      const p = parsePoint(raw);
      if (!p) return { correct: false, feedback: "Enter a point like (3, 5)." };
      const tol = spec.tolerance ?? 1e-6;
      return { correct: Math.abs(p[0] - spec.x) <= tol && Math.abs(p[1] - spec.y) <= tol };
    }
    case "text": {
      const want = Array.isArray(spec.value) ? spec.value : [spec.value];
      const norm = (s: string) => (spec.caseSensitive ? s : s.toLowerCase()).trim();
      return { correct: want.some((w: string) => norm(w) === norm(raw)) };
    }
    case "set": {
      const got = raw.split(/[,\s]+/).map(evalNumber).filter((n) => !isNaN(n)).sort((a, b) => a - b);
      const want = spec.values.map((v: any) => evalNumber(String(v))).sort((a: number, b: number) => a - b);
      return { correct: got.length === want.length && got.every((g, i) => Math.abs(g - want[i]) <= 1e-6) };
    }
    case "custom":
      try {
        return spec.grade(raw);
      } catch {
        return { correct: false, feedback: "Grader error." };
      }
    default:
      throw new Error(`Unsupported answer type: ${spec.type}`);
  }
}

// ---- palette ----------------------------------------------------------------
const COLORS: Record<string, string> = {
  blue: "#2f6df0",
  coral: "#e0554d",
  green: "#2ca05a",
  violet: "#7b5bd6",
  orange: "#e08a2f",
  ink: "#14171d",
};
const col = (c?: string) => COLORS[c ?? "blue"] ?? COLORS.blue;

// ---- prose (markdown + KaTeX) -----------------------------------------------
function renderProse(src: string): string {
  const parts: string[] = [];
  let s = src.replace(/\$\$([\s\S]+?)\$\$/g, (_m, e) => {
    parts.push(katex.renderToString(e.trim(), { displayMode: true, throwOnError: false }));
    return `@@M${parts.length - 1}@@`;
  });
  s = s.replace(/\$([^$\n]+?)\$/g, (_m, e) => {
    parts.push(katex.renderToString(e.trim(), { displayMode: false, throwOnError: false }));
    return `@@M${parts.length - 1}@@`;
  });
  let html = marked.parse(s, { async: false }) as string;
  html = html.replace(/@@M(\d+)@@/g, (_m, i) => parts[Number(i)]);
  return html;
}

function Prose({ children }: { children: string }) {
  return <div dangerouslySetInnerHTML={{ __html: renderProse(children ?? "") }} />;
}

// NOTE: named DisplayMath, not Math — a local `function Math` would shadow the
// global `Math` for the whole module, turning every `Math.ceil/abs/min/...` call
// below into a call on this component (→ runtime throw). Exposed to lessons as
// `Math` via buildScope().
function DisplayMath({ children, block }: { children: string; block?: boolean }) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(children ?? "", { displayMode: !!block, throwOnError: false }),
      }}
    />
  );
}

// ---- structure --------------------------------------------------------------
function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section style={{ margin: "0 0 32px" }}>
      {title && <h2 style={{ fontSize: "1.4rem", margin: "0 0 12px" }}>{title}</h2>}
      {children}
    </section>
  );
}

const CALLOUT_TONE: Record<string, { bg: string; bar: string; label: string }> = {
  note: { bg: "#eef1f6", bar: "#8a93a3", label: "Note" },
  tip: { bg: "#e9f6ee", bar: "#2ca05a", label: "Tip" },
  warning: { bg: "#fdeeec", bar: "#e0554d", label: "Warning" },
  "key-idea": { bg: "#eaf1fe", bar: "#2f6df0", label: "Key idea" },
};

function Callout({
  kind = "note",
  title,
  children,
}: {
  kind?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const t = CALLOUT_TONE[kind] ?? CALLOUT_TONE.note;
  return (
    <div style={{ background: t.bg, borderLeft: `3px solid ${t.bar}`, borderRadius: 8, padding: "12px 16px", margin: "16px 0" }}>
      <div style={{ fontSize: ".72rem", letterSpacing: ".08em", textTransform: "uppercase", color: t.bar, fontWeight: 700, marginBottom: 4 }}>
        {title ?? t.label}
      </div>
      {children}
    </div>
  );
}

function Reveal({ label, children }: { label?: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div style={{ margin: "12px 0" }}>
      <button onClick={() => setOpen((o) => !o)} style={btnStyle}>
        {open ? "Hide" : label ?? "Reveal"}
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </div>
  );
}

// Hints render inside <Exercise>; standalone they just show as a reveal.
function Hint({ children }: { children: React.ReactNode }) {
  return <Reveal label="Hint">{children}</Reveal>;
}

// Ordered walkthrough for guided derivations: steps reveal one at a time so the
// learner follows the argument line by line instead of seeing the whole wall of
// algebra at once. <Steps> owns the numbered rail + progressive reveal; each
// <Step> just carries a title + body (read from its props, like <Option>).
function Step({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ margin: "8px 0" }}>
      {title && <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>}
      {children}
    </div>
  );
}

function Steps({ children }: { children: React.ReactNode }) {
  const steps = React.Children.toArray(children) as React.ReactElement<{ title?: string; children?: React.ReactNode }>[];
  const total = steps.length;
  const [shown, setShown] = React.useState(1);
  return (
    <div style={{ margin: "16px 0" }}>
      {steps.slice(0, shown).map((step, i) => {
        const last = i === total - 1;
        const title = step.props?.title;
        return (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ flex: "0 0 auto", width: 26, height: 26, borderRadius: "50%", background: "#2f6df0", color: "#fff", fontSize: ".8rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {i + 1}
              </div>
              {!last && <div style={{ width: 2, flex: 1, background: "#e3e6ec", margin: "4px 0" }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
              {title && <div style={{ fontWeight: 600, margin: "3px 0 4px" }}>{title}</div>}
              {step.props?.children}
            </div>
          </div>
        );
      })}
      {shown < total && (
        <button onClick={() => setShown((s) => Math.min(total, s + 1))} style={{ ...btnStyle, marginLeft: 38 }}>
          Next step · {shown}/{total}
        </button>
      )}
    </div>
  );
}

// ---- controls ---------------------------------------------------------------
function Slider({ value, onChange, min, max, step = 0.1, label, showValue = true }: any) {
  return (
    <label style={rowStyle}>
      {label != null && <span style={labelStyle}>{label}</span>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ flex: 1 }} />
      {showValue && <span style={valStyle}>{fmt(value)}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label }: any) {
  return (
    <label style={rowStyle}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label != null && <span>{label}</span>}
    </label>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, label }: any) {
  return (
    <label style={rowStyle}>
      {label != null && <span style={labelStyle}>{label}</span>}
      <input type="number" value={value} min={min} max={max} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: 90 }} />
    </label>
  );
}

// ---- coordinate plane -------------------------------------------------------
type PlotCtx = {
  xToPx: (x: number) => number;
  yToPx: (y: number) => number;
  pxToX: (px: number) => number;
  pxToY: (px: number) => number;
  xd: [number, number];
  yd: [number, number];
  w: number;
  h: number;
  svgRef: React.RefObject<SVGSVGElement | null>;
};
const PlotContext = React.createContext<PlotCtx | null>(null);
const usePlot = () => {
  const c = React.useContext(PlotContext);
  if (!c) throw new Error("Plot marks must be inside <Plot>");
  return c;
};

function Plot(props: any) {
  const w = 480;
  const h = props.height ?? 320;
  const pad = 26;
  const xd: [number, number] = props.x ?? [-5, 5];
  const yd: [number, number] = props.y ?? [-5, 5];
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const xToPx = (x: number) => pad + ((x - xd[0]) / (xd[1] - xd[0])) * (w - 2 * pad);
  const yToPx = (y: number) => h - pad - ((y - yd[0]) / (yd[1] - yd[0])) * (h - 2 * pad);
  const pxToX = (px: number) => xd[0] + ((px - pad) / (w - 2 * pad)) * (xd[1] - xd[0]);
  const pxToY = (px: number) => yd[0] + ((h - pad - px) / (h - 2 * pad)) * (yd[1] - yd[0]);
  const ctx: PlotCtx = { xToPx, yToPx, pxToX, pxToY, xd, yd, w, h, svgRef };

  const gridLines: React.ReactNode[] = [];
  for (let gx = Math.ceil(xd[0]); gx <= xd[1]; gx++) {
    gridLines.push(<line key={`gx${gx}`} x1={xToPx(gx)} y1={pad} x2={xToPx(gx)} y2={h - pad} stroke="#eceef2" />);
  }
  for (let gy = Math.ceil(yd[0]); gy <= yd[1]; gy++) {
    gridLines.push(<line key={`gy${gy}`} x1={pad} y1={yToPx(gy)} x2={w - pad} y2={yToPx(gy)} stroke="#eceef2" />);
  }
  return (
    <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} style={{ width: "100%", maxWidth: w, border: "1px solid #e3e6ec", borderRadius: 10, background: "#fff", display: "block", margin: "12px 0", touchAction: "none" }}>
      {gridLines}
      {yd[0] <= 0 && yd[1] >= 0 && <line x1={pad} y1={yToPx(0)} x2={w - pad} y2={yToPx(0)} stroke="#b7bdc9" />}
      {xd[0] <= 0 && xd[1] >= 0 && <line x1={xToPx(0)} y1={pad} x2={xToPx(0)} y2={h - pad} stroke="#b7bdc9" />}
      <PlotContext.Provider value={ctx}>{props.children}</PlotContext.Provider>
    </svg>
  );
}

Plot.OfX = function OfX({ y, color }: { y: (x: number) => number; color?: string }) {
  const { xd, w, xToPx, yToPx } = usePlot();
  const n = 200;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const x = xd[0] + ((xd[1] - xd[0]) * i) / n;
    const yv = y(x);
    if (isFinite(yv)) pts.push(`${xToPx(x).toFixed(1)},${yToPx(yv).toFixed(1)}`);
    else pts.push("");
  }
  // split at gaps so asymptotes don't draw vertical lines
  const segs = pts.join(" ").split(/\s{2,}|(?:^| )(?= )/).filter(Boolean);
  return (
    <>
      {segs.map((seg, i) => (
        <polyline key={i} points={seg} fill="none" stroke={col(color)} strokeWidth={2.5} />
      ))}
    </>
  );
};

Plot.Point = function Point({ x, y, color, label }: any) {
  const { xToPx, yToPx } = usePlot();
  return (
    <g>
      <circle cx={xToPx(x)} cy={yToPx(y)} r={5} fill={col(color)} />
      {label && (
        <text x={xToPx(x) + 8} y={yToPx(y) - 8} fontSize={12} fill={col(color)}>
          {label}
        </text>
      )}
    </g>
  );
};

Plot.MovablePoint = function MovablePoint({ x, y, onMove, color }: any) {
  const { xToPx, yToPx, pxToX, pxToY, svgRef, xd, yd } = usePlot();
  const dragging = React.useRef(false);
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const move = (e: PointerEvent) => {
    if (!dragging.current || !svgRef.current) return;
    const r = svgRef.current.getBoundingClientRect();
    const sx = (svgRef.current.viewBox.baseVal.width || r.width) / r.width;
    const sy = (svgRef.current.viewBox.baseVal.height || r.height) / r.height;
    const px = (e.clientX - r.left) * sx;
    const py = (e.clientY - r.top) * sy;
    onMove({ x: clamp(pxToX(px), xd[0], xd[1]), y: clamp(pxToY(py), yd[0], yd[1]) });
  };
  const up = () => {
    dragging.current = false;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  const down = () => {
    dragging.current = true;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <g>
      <circle cx={xToPx(x)} cy={yToPx(y)} r={12} fill={col(color)} opacity={0.15} />
      <circle cx={xToPx(x)} cy={yToPx(y)} r={7} fill={col(color)} stroke="#fff" strokeWidth={2} style={{ cursor: "grab" }} onPointerDown={down} />
    </g>
  );
};

// ---- assessment -------------------------------------------------------------
function Exercise({ prompt, answer, input, solution, hints, onResult, children }: any) {
  const [val, setVal] = React.useState("");
  const [result, setResult] = React.useState<GradeResult | null>(null);
  const [attempts, setAttempts] = React.useState(0);
  const [showSol, setShowSol] = React.useState(false);
  const inputKind = input ?? (answer?.type === "point" ? "point" : answer?.type === "numeric" ? "number" : "text");

  const submit = () => {
    const r = grade(answer, val);
    const n = attempts + 1;
    setResult(r);
    setAttempts(n);
    track("exercise", { type: answer?.type, correct: r.correct, attempts: n });
    onResult?.({ ...r, attempts: n });
  };

  const hintList: React.ReactNode[] = hints
    ? hints.map((h: string, i: number) => <Hint key={i}>{h}</Hint>)
    : React.Children.toArray(children);

  return (
    <div style={{ border: "1px solid #e3e6ec", borderRadius: 10, padding: 16, margin: "16px 0" }}>
      <div style={{ marginBottom: 10 }}>{prompt}</div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={inputKind === "point" ? "(x, y)" : inputKind === "number" ? "number" : "answer"}
          style={{ padding: "6px 10px", border: "1px solid #c8cdd8", borderRadius: 6, minWidth: 120 }}
        />
        <button onClick={submit} style={{ ...btnStyle, background: "#2f6df0", color: "#fff", borderColor: "#2f6df0" }}>
          Check
        </button>
        {result && (
          <span style={{ fontWeight: 600, color: result.correct ? "#2ca05a" : "#e0554d" }}>
            {result.correct ? "Correct" : result.feedback ?? "Not quite"}
          </span>
        )}
      </div>
      {hintList.length > 0 && <div style={{ marginTop: 10 }}>{hintList}</div>}
      {solution && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowSol((s) => !s)} style={btnStyle}>
            {showSol ? "Hide solution" : "Show solution"}
          </button>
          {showSol && <div style={{ marginTop: 8 }}>{solution}</div>}
        </div>
      )}
    </div>
  );
}

function MultipleChoice({ prompt, correct, shuffle, solution, children }: any) {
  const options = React.Children.toArray(children);
  const order = React.useMemo(() => {
    const idx = options.map((_, i) => i);
    if (shuffle) for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(((i * 9301 + 49297) % 233280) / 233280 * (i + 1)); // deterministic-ish
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    return idx;
  }, [options.length, shuffle]);
  const correctSet = new Set<number>(Array.isArray(correct) ? correct : [correct]);
  const [picked, setPicked] = React.useState<number | null>(null);
  const [showSol, setShowSol] = React.useState(false);

  return (
    <div style={{ border: "1px solid #e3e6ec", borderRadius: 10, padding: 16, margin: "16px 0" }}>
      <div style={{ marginBottom: 10 }}>{prompt}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {order.map((origIdx) => {
          const chosen = picked === origIdx;
          const isRight = correctSet.has(origIdx);
          const bg = picked == null ? "#fff" : chosen ? (isRight ? "#e9f6ee" : "#fdeeec") : isRight ? "#e9f6ee" : "#fff";
          return (
            <button
              key={origIdx}
              onClick={() => {
                setPicked(origIdx);
                track("choice", { correct: isRight });
              }}
              style={{ ...btnStyle, textAlign: "left", background: bg }}
            >
              {options[origIdx]}
            </button>
          );
        })}
      </div>
      {picked != null && (
        <div style={{ marginTop: 8, fontWeight: 600, color: correctSet.has(picked) ? "#2ca05a" : "#e0554d" }}>
          {correctSet.has(picked) ? "Correct" : "Try again"}
        </div>
      )}
      {solution && picked != null && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowSol((s) => !s)} style={btnStyle}>
            {showSol ? "Hide" : "Why?"}
          </button>
          {showSol && <div style={{ marginTop: 8 }}>{solution}</div>}
        </div>
      )}
    </div>
  );
}

function Option({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

// ---- hooks ------------------------------------------------------------------
function useLessonState<T>(key: string, initial: T): [T, (n: T | ((p: T) => T)) => void] {
  const [v, setV] = React.useState<T>(initial);
  const set = React.useCallback(
    (next: T | ((p: T) => T)) => {
      setV((prev) => {
        const nv = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        track("state", { key, value: nv as unknown });
        return nv;
      });
    },
    [key],
  );
  return [v, set];
}

function useTime({ paused }: { paused?: boolean } = {}): number {
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    if (paused || reduce) return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setT((performance.now() - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, reduce]);
  return t;
}

// ---- shared styles ----------------------------------------------------------
const btnStyle: React.CSSProperties = { padding: "6px 12px", border: "1px solid #c8cdd8", borderRadius: 6, background: "#f4f5f7", cursor: "pointer", font: "inherit" };
const rowStyle: React.CSSProperties = { display: "flex", gap: 10, alignItems: "center", margin: "8px 0" };
const labelStyle: React.CSSProperties = { fontFamily: "ui-monospace, monospace", minWidth: 24, color: "#2f6df0", fontWeight: 600 };
const valStyle: React.CSSProperties = { fontFamily: "ui-monospace, monospace", minWidth: 44, textAlign: "right" };

// ---- the injected global scope ----------------------------------------------
export function buildScope() {
  return {
    React,
    useState: React.useState,
    useEffect: React.useEffect,
    useMemo: React.useMemo,
    useRef: React.useRef,
    useCallback: React.useCallback,
    useLessonState,
    useTime,
    track,
    fmt,
    math: mathAPI,
    Section,
    Prose,
    Math: DisplayMath,
    Callout,
    Steps,
    Step,
    Reveal,
    Hint,
    Plot,
    Slider,
    Toggle,
    NumberInput,
    Exercise,
    MultipleChoice,
    Option,
  } as Record<string, unknown>;
}
