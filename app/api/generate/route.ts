import { runPipeline, repairLesson } from "./pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

// Two modes:
//  - { concept }                 -> run the full plan->build->compile->critic->refine pipeline
//  - { repair: { code, error } } -> single build-only fix for a RUNTIME error the
//                                   sandbox caught after mount (client self-repair loop)
// Without ANTHROPIC_API_KEY, the pipeline serves a lecture-style mock so the whole
// shape is exercisable offline.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as any);
  const repair = body.repair as { code: string; error: string } | undefined;

  try {
    if (repair) {
      const code = await repairLesson(repair.code, `[${body.phase ?? "runtime"}] ${repair.error}`);
      return Response.json({ code });
    }
    const concept: string = body.concept || "the slope of a line";
    const { code, report } = await runPipeline(concept);
    return Response.json({ code, report });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
