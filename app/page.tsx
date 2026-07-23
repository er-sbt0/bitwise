"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const MAX_REPAIRS = 3;

const EXAMPLES = [
  "completing the square",
  "why e^x is its own derivative",
  "Bayes' theorem",
  "eigenvectors as directions that don't turn",
  "the central limit theorem",
];

type Status = "idle" | "generating" | "mounting" | "repairing" | "ready" | "error";

type Job = { id: string; code: string };

/** Mirrors app/api/generate/pipeline.ts. Declared locally rather than imported
 *  so this client bundle never reaches into a server module. */
type StageName = "plan" | "build" | "compile" | "verify" | "critic" | "refine";
type StageStatus = "start" | "ok" | "repair" | "revise" | "skip" | "error";
type StageEvent = { stage: StageName; status: StageStatus; detail?: string; payload?: any };
type PipelineReport = {
  source: "model" | "mock";
  model?: string;
  stages: StageEvent[];
  plan: any;
  critic: any;
  verify: { ok: boolean; checked: number; findings: { gate: string; severity: string; detail: string }[] } | null;
  repairs: number;
};

/** The pipeline, as the learner-facing story of what is being done. */
const STEPS: { key: StageName; name: string; what: string }[] = [
  { key: "plan", name: "Plan the pedagogy", what: "lecturer" },
  { key: "build", name: "Write the lesson", what: "author" },
  { key: "compile", name: "Transpile", what: "gate" },
  { key: "verify", name: "Re-check every answer", what: "CAS" },
  { key: "critic", name: "Critique & refine", what: "editor" },
];

const STATUS_LABEL: Record<Status, string> = {
  idle: "Ready when you are.",
  generating: "Authoring the lesson…",
  mounting: "Mounting the interactive…",
  repairing: "It errored — repairing itself…",
  ready: "Lesson ready.",
  error: "Couldn't finish this one.",
};

export default function Page() {
  const [concept, setConcept] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [job, setJob] = useState<Job | null>(null);
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [plan, setPlan] = useState<any>(null);
  const [report, setReport] = useState<PipelineReport | null>(null);
  const [meta, setMeta] = useState<any>(null);
  const [log, setLog] = useState<{ event: string; data?: any }[]>([]);
  const [notice, setNotice] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [frameHeight, setFrameHeight] = useState(560);
  const [repairs, setRepairs] = useState(0);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const jobRef = useRef<Job | null>(null);
  jobRef.current = job;
  // The job id the sandbox has acknowledged. Delivery retries until it matches.
  const [delivered, setDelivered] = useState<string | null>(null);
  const deliveredRef = useRef<string | null>(null);
  deliveredRef.current = delivered;
  const attempts = useRef(0);
  const runId = useRef(0);

  const busy = status === "generating" || status === "mounting" || status === "repairing";
  const showLesson = status === "ready" || (status === "repairing" && !!meta);

  // ── delivery ───────────────────────────────────────────────────────────────
  // The frame posts `ready` exactly once, on boot — which routinely lands BEFORE
  // this page hydrates and can attach a listener. Waiting for it meant the code
  // was never posted at all: the run finished, the meta panel filled in, and the
  // frame sat empty forever. So don't wait for a handshake — re-post the job
  // until the sandbox acknowledges it by id.
  useEffect(() => {
    if (!job || delivered === job.id) return;
    const send = () =>
      iframeRef.current?.contentWindow?.postMessage({ type: "render", id: job.id, code: job.code }, "*");
    send();
    const t = setInterval(send, 250);
    // If the frame never answers, say so instead of spinning forever.
    const giveUp = setTimeout(() => {
      if (deliveredRef.current !== job.id) {
        setNotice(
          "The sandbox accepted the lesson but never reported back — it neither mounted nor errored. " +
            "Reload the page and try again; if it keeps happening, rebuild the sandbox bundle (npm run build:sandbox).",
        );
        setStatus("error");
      }
    }, 15000);
    return () => {
      clearInterval(t);
      clearTimeout(giveUp);
    };
  }, [job, delivered]);

  // ── sandbox messages ───────────────────────────────────────────────────────
  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const m = ev.data;
      if (!m || typeof m !== "object") return;
      const j = jobRef.current;
      switch (m.type) {
        case "size":
          if (typeof m.height === "number") setFrameHeight(Math.max(320, Math.min(20000, m.height)));
          break;
        case "mounted":
          if (j && m.id === j.id) {
            setDelivered(j.id);
            setMeta(m.meta);
            setStatus("ready");
          }
          break;
        case "telemetry":
          setLog((l) => [...l.slice(-60), { event: m.event, data: m.data }]);
          break;
        case "error": {
          if (!j || (m.id !== j.id && m.id !== "*")) break;
          if (m.id === j.id) setDelivered(j.id);
          if (attempts.current >= MAX_REPAIRS) {
            setNotice(m.message);
            setStatus("error");
            break;
          }
          attempts.current += 1;
          setRepairs(attempts.current);
          setStatus("repairing");
          setEvents((e) => [...e, { stage: "build", status: "repair", detail: `[${m.phase}] ${m.message}` }]);
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ repair: { code: j.code, error: m.message }, phase: m.phase }),
          });
          const out = await res.json().catch(() => ({ error: "the repair request failed" }));
          if (out.error) {
            setNotice(out.error);
            setStatus("error");
            break;
          }
          setEvents((e) => [...e, { stage: "build", status: "revise", detail: "repaired and re-mounted" }]);
          setStatus("mounting");
          setJob({ id: crypto.randomUUID(), code: out.code });
          break;
        }
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // ── the clock (the wait is part of the product) ────────────────────────────
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  // ── generate ───────────────────────────────────────────────────────────────
  const generate = useCallback(
    async (topic: string) => {
      const trimmed = topic.trim();
      if (!trimmed) return;
      const mine = ++runId.current;
      attempts.current = 0;
      setRepairs(0);
      setEvents([]);
      setPlan(null);
      setReport(null);
      setMeta(null);
      setLog([]);
      setNotice("");
      setElapsed(0);
      setStatus("generating");

      try {
        const res = await fetch("/api/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ concept: trimmed, stream: true }),
        });
        if (!res.ok || !res.body) throw new Error(`the authoring service answered ${res.status}`);

        // NDJSON: one event per line, so the pipeline is visible while it runs.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (runId.current !== mine) return; // superseded by a newer run
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let msg: any;
            try {
              msg = JSON.parse(line);
            } catch {
              continue;
            }
            if (msg.t === "stage") {
              setEvents((e) => [...e, msg as StageEvent]);
              if (msg.stage === "plan" && msg.payload) setPlan(msg.payload);
            } else if (msg.t === "done") {
              setReport(msg.report);
              setStatus("mounting");
              setJob({ id: crypto.randomUUID(), code: msg.code });
            } else if (msg.t === "error") {
              setNotice(msg.error);
              setStatus("error");
            }
          }
        }
      } catch (e: any) {
        if (runId.current !== mine) return;
        setNotice(String(e?.message || e));
        setStatus("error");
      }
    },
    [],
  );

  const stepState = (key: StageName) => {
    const mine = events.filter((e) => e.stage === key);
    if (!mine.length) return { state: "idle" as const, detail: "" };
    const last = mine[mine.length - 1];
    const repaired = mine.some((e) => e.status === "repair");
    if (last.status === "start") return { state: "active" as const, detail: "" };
    if (last.status === "error") return { state: "bad" as const, detail: last.detail ?? "" };
    if (last.status === "skip") return { state: "warn" as const, detail: last.detail ?? "" };
    return { state: repaired ? ("warn" as const) : ("ok" as const), detail: last.detail ?? "" };
  };

  const verify = report?.verify;

  return (
    <main className="app">
      <header className="topbar">
        <div className="brand">
          Bitwise<span>.</span>
        </div>
        <div className="tag">creative runtime</div>
        <div className="spacer" />
        {report?.model && <div className="tag">{report.source === "mock" ? "offline mock" : report.model}</div>}
      </header>

      {status === "idle" && (
        <section className="hero">
          <h1>
            Ask for a concept. Get an <em>interactive lesson</em>, written live.
          </h1>
          <p>
            A lecturer plans the argument, an author writes it as a React lesson against the Bitwise
            standard library, a CAS re-checks every graded answer, and it mounts in an isolated
            sandbox — repairing itself if it breaks.
          </p>
        </section>
      )}

      <div className="composer">
        <div className="field">
          <span className="glyph">⌕</span>
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && generate(concept)}
            placeholder="a concept to teach — e.g. completing the square"
            aria-label="Concept to teach"
          />
        </div>
        <button className="go" onClick={() => generate(concept)} disabled={busy || !concept.trim()}>
          {busy ? `Working… ${fmtTime(elapsed)}` : "Author the lesson"}
        </button>
      </div>

      <div className="chips">
        <span className="label">Try</span>
        {EXAMPLES.map((x) => (
          <button
            key={x}
            className="chip"
            disabled={busy}
            onClick={() => {
              setConcept(x);
              generate(x);
            }}
          >
            {x}
          </button>
        ))}
      </div>

      <div className="stage-grid">
        <div>
          {status !== "idle" && (
            <div className="statusbar">
              <span
                className={`dot ${busy ? "busy" : status === "ready" ? "ok" : status === "error" ? "bad" : ""}`}
              />
              <strong>{STATUS_LABEL[status]}</strong>
              <div className="meta">
                {busy && <span>{fmtTime(elapsed)}</span>}
                {repairs > 0 && <span>self-repair {repairs}/{MAX_REPAIRS}</span>}
                {report && <span>{report.repairs} pipeline repair{report.repairs === 1 ? "" : "s"}</span>}
                {verify && <span>{verify.checked} answer{verify.checked === 1 ? "" : "s"} re-checked</span>}
              </div>
            </div>
          )}

          {!showLesson && status !== "idle" && <Authoring plan={plan} status={status} notice={notice} />}

          {status === "idle" && (
            <div className="authoring">
              <div className="kicker">the sandbox</div>
              <h2>Nothing mounted yet.</h2>
              <p className="essence">
                Whatever you ask for is written from scratch — figures, animation, controls and all —
                then mounted here in a cross-origin frame with no network access.
              </p>
            </div>
          )}

          {/* Never unmounted: a fresh iframe would restart the boot handshake. */}
          <div className={`paper ${showLesson ? "" : "hidden"}`}>
            <iframe
              ref={iframeRef}
              src="/sandbox.html"
              sandbox="allow-scripts"
              title="Lesson sandbox"
              style={{ height: frameHeight }}
            />
          </div>
        </div>

        <aside>
          <div className="panel">
            <h3>
              Pipeline
              {busy && <span className="count">{fmtTime(elapsed)}</span>}
            </h3>
            <div className="pipeline">
              {STEPS.map((s) => {
                const { state, detail } = stepState(s.key);
                return (
                  <div key={s.key} className={`step ${state}`}>
                    <span className="icon">
                      {state === "ok" ? "✓" : state === "bad" ? "!" : state === "warn" ? "~" : state === "active" ? "•" : ""}
                    </span>
                    <div className="name">
                      {s.name}
                      <span className="what">{s.what}</span>
                    </div>
                    {detail && <div className="detail">{clip(detail, 220)}</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {verify && verify.findings.length > 0 && (
            <div className="panel">
              <h3>
                Verifier
                <span className="count">{verify.ok ? "passed" : "blocked"}</span>
              </h3>
              <ul className="findings">
                {verify.findings.map((f, i) => (
                  <li key={i}>
                    <span className={`sev ${f.severity}`}>{f.severity}</span>
                    {f.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {meta && (
            <div className="panel">
              <h3>Lesson meta</h3>
              <pre className="dump">{JSON.stringify(meta, null, 2)}</pre>
            </div>
          )}

          <div className="panel">
            <h3>
              Telemetry
              {log.length > 0 && <span className="count">{log.length}</span>}
            </h3>
            {log.length === 0 ? (
              <p className="empty">Slider drags and answer checks stream here.</p>
            ) : (
              <div className="tele">
                {log.map((e, i) => (
                  <div key={i}>
                    <span className="ev">{e.event}</span>
                    <span>{e.data != null ? JSON.stringify(e.data) : ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notice && (
            <div className="panel notice">
              <h3>What went wrong</h3>
              <pre className="dump">{notice}</pre>
              <button className="linkish" onClick={() => generate(concept)} style={{ marginTop: 10 }}>
                Try again
              </button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

/** The wait, shown as work: the plan lands well before the code does, so the
 *  lecture's outline is on screen while it is still being written. */
function Authoring({ plan, status, notice }: { plan: any; status: Status; notice: string }) {
  if (status === "error" && !plan) {
    return (
      <div className="authoring">
        <div className="kicker">stopped</div>
        <h2>The run didn't finish.</h2>
        <p className="essence">{notice || "No lesson was produced."}</p>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="authoring">
        <div className="kicker">planning the lecture</div>
        <h2>Deciding how to teach it…</h2>
        <p className="essence">
          The essence, the through-line, the one interaction that makes the idea visible — chosen
          before a line of code exists.
        </p>
        <div className="skeleton" style={{ width: "72%" }} />
        <div className="skeleton" style={{ width: "88%" }} />
        <div className="skeleton" style={{ width: "54%" }} />
      </div>
    );
  }
  return (
    <div className="authoring">
      <div className="kicker">{status === "error" ? "the plan (build failed)" : "writing this lesson"}</div>
      <h2>{plan.title ?? plan.concept}</h2>
      <p className="essence">{plan.essence}</p>
      <ul className="beats">
        {(plan.develop ?? []).map((b: string, i: number) => (
          <li key={i}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
