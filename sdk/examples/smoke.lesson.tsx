/**
 * Smoke fixture for the browser harness — the smallest lesson that exercises
 * the *live* SDK end to end (state → slider → plot). Deliberately uses nothing
 * from the unbuilt Stage runtime, so it stays green as W1 lands and proves the
 * harness itself (mount detection, screenshots, drags) is working.
 *
 * No imports — the SDK is injected in scope inside the sandbox.
 */

export const meta: LessonMeta = {
  concept: "harness-smoke",
  prerequisites: [],
  objectives: ["Prove the sandbox mounts and a slider drives the plot"],
  difficulty: 1,
}

export default function Lesson() {
  const [a, setA] = useLessonState("a", 1)

  return (
    <Section title="Smoke test">
      <Prose>{`Drag the slider — the curve $y = a\\,x^2$ should follow.`}</Prose>

      <Plot x={[-4, 4]} y={[-4, 4]}>
        <Plot.OfX y={(x: number) => a * x * x} color="blue" />
      </Plot>

      <Slider value={a} onChange={setA} min={-2} max={2} step={0.1} label="a" />

      <Prose>{`Current slope factor: $a = ${fmt(a)}$.`}</Prose>
    </Section>
  )
}
