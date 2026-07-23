// The sandbox harness. Runs inside the isolated iframe. Receives model-
// generated lesson source over postMessage, transpiles it in-frame with Babel,
// mounts it against the injected SDK scope inside an error boundary, and
// reports compile/runtime failures back to the parent so the orchestrator can
// run its self-repair loop.
import React from "react";
import { createRoot, Root } from "react-dom/client";
import * as Babel from "@babel/standalone";
import { buildScope, setEmit } from "./sdk";
import { resetMarks } from "./stage/mark";

type InMsg = { type: "render"; id: string; code: string } | { type: "ping" };

const post = (msg: unknown) => parent.postMessage(msg, "*");

// Forward SDK telemetry to the host.
setEmit((event, data) => post({ type: "telemetry", event, data }));

let root: Root | null = null;
function getRoot(): Root {
  const el = document.getElementById("root")!;
  if (!root) root = createRoot(el);
  return root;
}

// Error boundary that reports runtime render errors upward.
class Boundary extends React.Component<
  { id: string; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    post({ type: "error", phase: "runtime", id: this.props.id, message: String(error?.stack || error?.message || error) });
  }
  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function transpile(code: string): string {
  const out = Babel.transform(code, {
    filename: "lesson.tsx",
    presets: [
      ["react", { runtime: "classic" }],
      ["typescript", { isTSX: true, allExtensions: true }],
    ],
    plugins: ["transform-modules-commonjs"],
  });
  if (!out.code) throw new Error("empty transpile output");
  return out.code;
}

function evaluate(compiled: string): { Comp: React.ComponentType; meta?: unknown } {
  const scope = buildScope();
  const keys = Object.keys(scope);
  const requireStub = (name: string) => {
    throw new Error(`import "${name}" is not allowed — compose the injected SDK instead`);
  };
  // eslint-disable-next-line no-new-func
  const fn = new Function("module", "exports", "require", ...keys, compiled);
  const mod: { exports: any } = { exports: {} };
  fn(mod, mod.exports, requireStub, ...keys.map((k) => scope[k]));
  const Comp = mod.exports.default;
  if (typeof Comp !== "function") throw new Error("lesson has no default-exported component");
  return { Comp, meta: mod.exports.meta };
}

/** Lessons that reached a COMMITTED render, and the meta they mounted with. */
const mounted = new Map<string, unknown>();

/** Posts `mounted` from a committed effect, so the parent hears it only after
 *  the tree actually rendered. Posting straight after `root.render()` was a lie:
 *  React commits asynchronously, so a lesson that threw reported "mounted" and
 *  then "error", and the host showed a green Ready over an empty frame. */
function MountSignal({ id, meta }: { id: string; meta: unknown }) {
  React.useEffect(() => {
    mounted.set(id, meta);
    post({ type: "mounted", id, meta });
  }, [id]);
  return null;
}

function render(id: string, code: string) {
  let compiled: string;
  try {
    compiled = transpile(code);
  } catch (e: any) {
    post({ type: "error", phase: "compile", id, message: String(e?.message || e) });
    return;
  }
  let Comp: React.ComponentType, meta: unknown;
  try {
    ({ Comp, meta } = evaluate(compiled));
  } catch (e: any) {
    post({ type: "error", phase: "compile", id, message: String(e?.message || e) });
    return;
  }
  try {
    resetMarks();
    getRoot().render(
      <React.StrictMode>
        {/* `key` is load-bearing: the root is reused across lessons, so without
            it React keeps the SAME Boundary instance, and a boundary that has
            caught once renders null forever. The repaired lesson would then
            mount into a permanently-failed boundary — no output, no `mounted`,
            no `error` — and the self-repair loop would hang on silence. */}
        <Boundary key={id} id={id}>
          <Comp />
          <MountSignal id={id} meta={meta} />
        </Boundary>
      </React.StrictMode>,
    );
  } catch (e: any) {
    post({ type: "error", phase: "runtime", id, message: String(e?.stack || e?.message || e) });
  }
}

// The host sizes its frame to the lesson instead of scrolling it inside a fixed
// box — a lesson is a document, and a document that scrolls inside a 560px
// window reads like a preview pane. Cross-origin, so the height has to be told.
function watchHeight() {
  const el = document.getElementById("root")!;
  let last = 0;
  const report = () => {
    const h = Math.ceil(el.getBoundingClientRect().height + 48); // + body padding
    if (Math.abs(h - last) < 2) return;
    last = h;
    post({ type: "size", height: h });
  };
  new ResizeObserver(report).observe(el);
  // KaTeX fonts and Mafs' ResizeObserver both settle after first paint.
  [0, 120, 400, 1200].forEach((d) => setTimeout(report, d));
}

// The host re-posts a job until we acknowledge it, so the same id can arrive
// more than once. Rendering it twice would tear down a live lesson and throw
// away whatever the learner had already done in it.
// A repeat of a lesson that MOUNTED is re-acknowledged rather than re-rendered:
// the host stops retrying only once it hears back, and rendering again would
// tear down a live lesson and discard whatever the learner had already done in
// it. A repeat of one still in flight (or one that failed) is dropped — its own
// `mounted` / `error` is the acknowledgement, and answering `mounted` for a
// lesson that never mounted is precisely the lie this file exists to avoid.
let currentId: string | null = null;

window.addEventListener("message", (ev: MessageEvent<InMsg>) => {
  const data = ev.data;
  if (!data) return;
  if (data.type === "render") {
    if (data.id === currentId) {
      if (mounted.has(data.id)) post({ type: "mounted", id: data.id, meta: mounted.get(data.id) });
      return;
    }
    currentId = data.id;
    render(data.id, data.code);
  }
  // The `ready` below is posted once, on boot — which can land BEFORE the parent
  // page has hydrated and attached its listener, leaving the parent waiting
  // forever. `ping` lets a late parent ask again instead of polling.
  if (data.type === "ping") post({ type: "ready" });
});

// Catch async errors that escape the boundary (e.g. inside event handlers).
window.addEventListener("error", (ev) => {
  post({ type: "error", phase: "runtime", id: "*", message: String(ev.error?.stack || ev.message) });
});

// ...and rejected promises, which `error` does not cover: a throw inside a
// director beat surfaces as a rejected dir.play(), and without this the lesson
// would fail silently instead of reaching the repair loop.
window.addEventListener("unhandledrejection", (ev) => {
  const r = ev.reason;
  post({ type: "error", phase: "runtime", id: "*", message: String(r?.stack || r?.message || r) });
});

watchHeight();
post({ type: "ready" });
