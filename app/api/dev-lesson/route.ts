// Dev-only: serves a lesson file off disk so `/dev` can mount a lesson with no
// LLM in the loop. Never referenced by the product path (`app/page.tsx`).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const DIR = join(process.cwd(), "sdk/examples");

export async function GET(req: Request) {
  const file = new URL(req.url).searchParams.get("file") || "newton.lesson.tsx";
  // Flat names only — no traversal, no subdirs. Keeps the read inside sdk/examples.
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    return Response.json({ error: `bad file name: ${file}` }, { status: 400 });
  }
  try {
    const code = await readFile(join(DIR, file), "utf8");
    return Response.json({ file, code });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 404 });
  }
}
