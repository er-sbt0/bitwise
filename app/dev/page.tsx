"use client";

// Dev-only fixture route. Mounts a lesson read straight off disk (via
// /api/dev-lesson) in the real sandbox iframe — same postMessage protocol as
// app/page.tsx, but with no LLM in the loop, so `scripts/browser-test.mjs` can
// drive lessons visually. Not linked from the product UI.

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "mounting" | "ready" | "error";

export default function DevPage() {
  const [file, setFile] = useState("newton.lesson.tsx");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [meta, setMeta] = useState<any>(null);
  const [log, setLog] = useState<{ event: string; data?: any }[]>([]);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [job, setJob] = useState<{ id: string; code: string } | null>(null);
  const jobRef = useRef<typeof job>(null);
  jobRef.current = job;

  // Read ?file= from the URL directly — avoids the Suspense bailout that
  // useSearchParams forces on a prerendered client page.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("file");
    const name = q || "newton.lesson.tsx";
    setFile(name);
    setStatus("mounting");
    fetch(`/api/dev-lesson?file=${encodeURIComponent(name)}`)
      .then((r) => r.json())
      .then((out) => {
        if (out.error) {
          setError(out.error);
          setStatus("error");
          return;
        }
        setJob({ id: crypto.randomUUID(), code: out.code });
      })
      .catch((e) => {
        setError(String(e?.message || e));
        setStatus("error");
      });
  }, []);

  // The frame's `ready` is one-shot and often fires before this page hydrates
  // in dev, so don't wait for it — re-post the job until the frame answers.
  useEffect(() => {
    if (!job || status !== "mounting") return;
    const post = () =>
      iframeRef.current?.contentWindow?.postMessage({ type: "render", id: job.id, code: job.code }, "*");
    post();
    const t = setInterval(post, 300);
    return () => clearInterval(t);
  }, [job, status]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      switch (m.type) {
        case "mounted":
          if (jobRef.current && m.id === jobRef.current.id) {
            setMeta(m.meta);
            setStatus("ready");
          }
          break;
        case "telemetry":
          setLog((l) => [...l.slice(-60), { event: m.event, data: m.data }]);
          break;
        case "error":
          setError(`[${m.phase}] ${m.message}`);
          setStatus("error");
          break;
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "20px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, fontSize: ".85rem" }}>
        <strong style={{ fontFamily: "ui-monospace, monospace" }}>dev fixture</strong>
        <span style={{ fontFamily: "ui-monospace, monospace", color: "var(--ink-soft)" }}>{file}</span>
        {/* Machine-readable mount state for scripts/browser-test.mjs. */}
        <div id="dev-status" data-status={status} data-error={error} data-file={file}>
          {status}
        </div>
      </div>

      {error && (
        <pre id="dev-error" style={{ margin: "0 0 12px", padding: 12, background: "#fff3f2", border: "1px solid var(--coral)", borderRadius: 8, color: "var(--coral)", fontSize: ".75rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {error}
        </pre>
      )}

      <iframe
        id="sandbox-frame"
        ref={iframeRef}
        src="/sandbox.html"
        sandbox="allow-scripts"
        title="Lesson sandbox"
        style={{ width: "100%", height: 720, border: "1px solid var(--line)", borderRadius: 12, background: "#fff" }}
      />

      <details style={{ marginTop: 12, fontSize: ".75rem" }}>
        <summary>meta + telemetry</summary>
        <pre id="dev-meta" style={{ fontFamily: "ui-monospace, monospace", fontSize: ".7rem", whiteSpace: "pre-wrap" }}>
          {JSON.stringify({ meta, log }, null, 2)}
        </pre>
      </details>
    </main>
  );
}
