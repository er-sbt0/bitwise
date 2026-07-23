"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_REPAIRS = 3;

type Status = "idle" | "generating" | "mounting" | "repairing" | "ready" | "error";

type Job = { id: string; code: string };

const STAGE_LABEL: Record<Status, string> = {
  idle: "Ready",
  generating: "Authoring the lesson…",
  mounting: "Building the interactive…",
  repairing: "Found a problem — repairing…",
  ready: "Ready.",
  error: "Gave up after repairs.",
};

export default function Page() {
  const [concept, setConcept] = useState("completing the square");
  const [status, setStatus] = useState<Status>("idle");
  const [job, setJob] = useState<Job | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [source, setSource] = useState<string>("");
  const [log, setLog] = useState<{ event: string; data?: any }[]>([]);
  const [notice, setNotice] = useState<string>("");

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeReady = useRef(false);
  const attempts = useRef(0);
  const jobRef = useRef<Job | null>(null);
  jobRef.current = job;

  const callGenerate = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    [],
  );

  const startGenerate = useCallback(async () => {
    attempts.current = 0;
    setMeta(null);
    setLog([]);
    setNotice("");
    setStatus("generating");
    const out = await callGenerate({ concept });
    if (out.error) {
      setNotice(out.error);
      setStatus("error");
      return;
    }
    setSource(out.source);
    setStatus("mounting");
    setJob({ id: crypto.randomUUID(), code: out.code });
  }, [concept, callGenerate]);

  // Push code into the sandbox once it (and the frame) are ready.
  useEffect(() => {
    if (job && iframeReady.current) {
      iframeRef.current?.contentWindow?.postMessage({ type: "render", id: job.id, code: job.code }, "*");
    }
  }, [job]);

  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      switch (m.type) {
        case "ready": {
          iframeReady.current = true;
          // If a job was queued before the frame booted, send it now.
          const j = jobRef.current;
          if (j) iframeRef.current?.contentWindow?.postMessage({ type: "render", id: j.id, code: j.code }, "*");
          break;
        }
        case "mounted": {
          if (jobRef.current && m.id === jobRef.current.id) {
            setMeta(m.meta);
            setStatus("ready");
          }
          break;
        }
        case "telemetry": {
          setLog((l) => [...l.slice(-40), { event: m.event, data: m.data }]);
          break;
        }
        case "error": {
          const j = jobRef.current;
          if (!j || (m.id !== j.id && m.id !== "*")) break;
          if (attempts.current >= MAX_REPAIRS) {
            setNotice(m.message);
            setStatus("error");
            break;
          }
          attempts.current += 1;
          setStatus("repairing");
          const out = await callGenerate({ concept, repair: { code: j.code, error: `[${m.phase}] ${m.message}` } });
          if (out.error) {
            setNotice(out.error);
            setStatus("error");
            break;
          }
          setStatus("mounting");
          setJob({ id: crypto.randomUUID(), code: out.code });
          break;
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [concept, callGenerate]);

  const busy = status === "generating" || status === "mounting" || status === "repairing";

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px" }}>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: "ui-monospace, monospace", fontSize: ".72rem", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)" }}>
          Bitwise · M0 vertical slice
        </div>
        <h1 style={{ fontSize: "2rem", margin: "6px 0 4px" }}>Author an interactive math lesson, live.</h1>
        <p style={{ color: "var(--ink-soft)", margin: 0 }}>
          Type a concept. The engine writes a React lesson against the SDK, transpiles it, and mounts it in an isolated sandbox — repairing itself if it errors.
        </p>
      </header>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          value={concept}
          onChange={(e) => setConcept(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !busy && startGenerate()}
          placeholder="e.g. completing the square"
          style={{ flex: 1, minWidth: 240, padding: "10px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--surface)" }}
        />
        <button
          onClick={startGenerate}
          disabled={busy}
          style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: busy ? "#9db4ee" : "var(--accent)", color: "#fff", fontWeight: 600, cursor: busy ? "default" : "pointer" }}
        >
          {busy ? "Working…" : "Generate lesson"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 300px", gap: 20, alignItems: "start" }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden", minHeight: 460 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: "1px solid var(--line)", fontSize: ".85rem" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: status === "ready" ? "var(--green)" : status === "error" ? "var(--coral)" : busy ? "var(--accent)" : "#c8cdd8" }} />
            <strong>{STAGE_LABEL[status]}</strong>
            {source && <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", color: "var(--ink-soft)" }}>source: {source}{attempts.current ? ` · repair ${attempts.current}/${MAX_REPAIRS}` : ""}</span>}
          </div>
          <iframe
            ref={iframeRef}
            src="/sandbox.html"
            sandbox="allow-scripts"
            title="Lesson sandbox"
            style={{ width: "100%", height: 560, border: "none", background: "#fff" }}
          />
        </div>

        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Panel title="Lesson meta">
            {meta ? (
              <pre style={preStyle}>{JSON.stringify(meta, null, 2)}</pre>
            ) : (
              <span style={{ color: "var(--ink-soft)", fontSize: ".85rem" }}>Appears once a lesson mounts.</span>
            )}
          </Panel>
          <Panel title="Telemetry">
            {log.length === 0 ? (
              <span style={{ color: "var(--ink-soft)", fontSize: ".85rem" }}>Slider drags & answer checks stream here.</span>
            ) : (
              <div style={{ fontFamily: "ui-monospace, monospace", fontSize: ".72rem", maxHeight: 220, overflow: "auto" }}>
                {log.map((e, i) => (
                  <div key={i} style={{ padding: "2px 0", borderBottom: "1px solid #f0f1f4" }}>
                    <span style={{ color: "var(--accent)" }}>{e.event}</span>{" "}
                    {e.data != null && <span style={{ color: "var(--ink-soft)" }}>{JSON.stringify(e.data)}</span>}
                  </div>
                ))}
              </div>
            )}
          </Panel>
          {notice && (
            <Panel title="Notice">
              <pre style={{ ...preStyle, color: "var(--coral)" }}>{notice}</pre>
            </Panel>
          )}
        </aside>
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
      <div style={{ fontFamily: "ui-monospace, monospace", fontSize: ".68rem", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-soft)", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

const preStyle: React.CSSProperties = {
  margin: 0,
  fontFamily: "ui-monospace, monospace",
  fontSize: ".72rem",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
