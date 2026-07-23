// The sandbox harness. Runs inside the isolated iframe. Receives model-
// generated lesson source over postMessage, transpiles it in-frame with Babel,
// mounts it against the injected SDK scope inside an error boundary, and
// reports compile/runtime failures back to the parent so the orchestrator can
// run its self-repair loop.
import React from "react";
import { createRoot, Root } from "react-dom/client";
import * as Babel from "@babel/standalone";
import { buildScope, setEmit } from "./sdk";

type InMsg = { type: "render"; id: string; code: string };

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
    getRoot().render(
      <React.StrictMode>
        <Boundary id={id}>
          <Comp />
        </Boundary>
      </React.StrictMode>,
    );
    post({ type: "mounted", id, meta });
  } catch (e: any) {
    post({ type: "error", phase: "runtime", id, message: String(e?.stack || e?.message || e) });
  }
}

window.addEventListener("message", (ev: MessageEvent<InMsg>) => {
  const data = ev.data;
  if (data && data.type === "render") render(data.id, data.code);
});

// Catch async errors that escape the boundary (e.g. inside event handlers).
window.addEventListener("error", (ev) => {
  post({ type: "error", phase: "runtime", id: "*", message: String(ev.error?.stack || ev.message) });
});

post({ type: "ready" });
