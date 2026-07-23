import { runPipeline, repairLesson, type StageEvent } from "./pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

// Two modes:
//  - { concept }                 -> run the full plan->build->compile->critic->refine pipeline
//  - { repair: { code, error } } -> single build-only fix for a RUNTIME error the
//                                   sandbox caught after mount (client self-repair loop)
// Without ANTHROPIC_API_KEY, the pipeline serves a lecture-style mock so the whole
// shape is exercisable offline.
//
// A full pass is MINUTES long. `{ stream: true }` therefore answers with NDJSON —
// one JSON object per line — so the client can show the pipeline working instead
// of a spinner over a dead frame:
//
//   {"t":"stage","stage":"plan","status":"start"}
//   {"t":"stage","stage":"plan","status":"ok","detail":"…","payload":{…}}
//   {"t":"done","code":"…","report":{…}}          (or {"t":"error","error":"…"})
//
// The non-streaming shape is unchanged, and is still what the repair path uses.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as any);
  const repair = body.repair as { code: string; error: string } | undefined;

  try {
    if (repair) {
      const code = await repairLesson(repair.code, `[${body.phase ?? "runtime"}] ${repair.error}`);
      return Response.json({ code });
    }
    const concept: string = body.concept || "the slope of a line";
    if (!body.stream) {
      const { code, report } = await runPipeline(concept);
      return Response.json({ code, report });
    }
    return streamPipeline(concept);
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

function streamPipeline(concept: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      };
      try {
        const { code, report } = await runPipeline(concept, (e: StageEvent) => send({ t: "stage", ...e }));
        send({ t: "done", code, report });
      } catch (e: any) {
        send({ t: "error", error: String(e?.message || e) });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      // Without this a proxy (or Next's own dev compression) can hold the first
      // chunks back, which would defeat the entire point of streaming.
      "x-accel-buffering": "no",
    },
  });
}
