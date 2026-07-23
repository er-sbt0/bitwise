import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM, userPrompt } from "./prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

// Served when ANTHROPIC_API_KEY is unset, so the sandbox + self-repair loop can
// be exercised offline. Uses only implemented core-tier components.
const MOCK_LESSON = `export const meta = { concept: "vertex-form-parabolas" }

export default function Lesson() {
  const [a, setA] = useLessonState("a", 1)
  const [h, setH] = useLessonState("h", 0)
  const [k, setK] = useLessonState("k", 0)
  const f = (x) => a * (x - h) ** 2 + k
  return (
    <>
      <Section title="Vertex form">
        <Prose>{\`Every parabola can be written as $f(x) = a(x-h)^2 + k$. The point $(h, k)$ is the vertex. Drag the sliders and watch it move.\`}</Prose>
        <Plot x={[-6, 6]} y={[-6, 6]}>
          <Plot.OfX y={f} color="blue" />
          <Plot.Point x={h} y={k} color="coral" label="vertex" />
        </Plot>
        <Slider value={a} onChange={setA} min={-3} max={3} step={0.1} label="a" />
        <Slider value={h} onChange={setH} min={-4} max={4} step={0.5} label="h" />
        <Slider value={k} onChange={setK} min={-4} max={4} step={0.5} label="k" />
        <Callout kind="key-idea" title="Read it straight off">
          <Prose>{\`The vertex is at $(\${fmt(h)}, \${fmt(k)})$ — no algebra needed.\`}</Prose>
        </Callout>
      </Section>
      <Section title="Check yourself">
        <MultipleChoice prompt={<Prose>{\`What does making $a$ negative do?\`}</Prose>} correct={1}>
          <Option>Shifts the vertex left</Option>
          <Option>Flips the parabola to open downward</Option>
          <Option>Has no visible effect</Option>
        </MultipleChoice>
        <Exercise
          prompt={<Prose>{\`The parabola $f(x) = 2(x-3)^2 + 5$ has its vertex where?\`}</Prose>}
          answer={{ type: "point", x: 3, y: 5 }}
          input="point"
          solution={<Prose>{\`Vertex form gives $(h,k)$ directly: $(3, 5)$.\`}</Prose>}
        >
          <Hint>Compare to $a(x-h)^2 + k$.</Hint>
        </Exercise>
      </Section>
    </>
  )
}`;

function stripFences(text: string): string {
  const fenced = text.match(/```(?:tsx?|jsx?|javascript)?\s*([\s\S]*?)```/);
  return (fenced ? fenced[1] : text).trim();
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}) as any);
  const concept: string = body.concept || "the slope of a line";
  const repair = body.repair as { code: string; error: string } | undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ code: MOCK_LESSON, source: "mock" });
  }

  const client = new Anthropic();
  const model = process.env.BITWISE_MODEL || "claude-opus-4-8";
  try {
    const msg = await client.messages.create({
      model,
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userPrompt(concept, repair) }],
    });
    const text = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return Response.json({ code: stripFences(text), source: "model", model });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
