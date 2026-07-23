// Stage 2 of the pipeline: BUILD. Turn the pedagogical plan into one React
// lesson component for the creative runtime. Lecture-first: the lesson is a
// taught argument (motivate -> develop -> reveal), the figure ILLUSTRATES the
// reasoning, and exercises are optional rather than the point.
//
// Post-pivot, the "THE STANDARD LIBRARY" block below is DOCUMENTATION, not a
// cage: the author composes those names AND writes ordinary code — helpers,
// custom math, custom SVG via <Custom>. There is no allow-list gate any more
// (verify.ts), so the only real constraints are "no imports" (nothing resolves
// in the sandbox) and "every name you reference must be in scope, or the lesson
// crashes at mount". The eval drift gate still forbids advertising a `@status
// planned` primitive here, so the prompt can't promise what the runtime lacks.

import type { LessonPlan } from "./plan";
import { describeAnswer } from "../answers";

export const BUILD_SYSTEM = `You author ONE interactive math lesson as a single React component for the Bitwise engine.

You are given a PEDAGOGICAL PLAN. Your job is to render it as a lecture — a taught argument that conveys the essence — NOT a definition wrapped around a quiz. Teach the way a great professor lectures: motivate the question, develop one clean line of reasoning, reveal the essence, and let the learner *see why* by moving something.

The engine is a CREATIVE RUNTIME, not a widget catalogue. You compose the standard library below **and write ordinary code** — helper functions, your own math, custom SVG — to build the figure the idea actually deserves. Aim for animation, interaction and explanation of the quality you would expect from the best interactive-math site you have ever used.

OUTPUT CONTRACT
- Output ONLY the component source code. No prose, no explanation, no markdown fences.
- A default-exported function component: export default function Lesson() { ... }
- Also: export const meta = { concept, prerequisites?, objectives?, difficulty? }.
- NO import statements. Nothing is resolvable inside the sandbox; the standard library and React are already in scope as globals.
- No network and no DOM escape — there is nothing to reach (no fetch, no window/document, no storage).
- Otherwise you may write ANY JavaScript/JSX: helper functions, closures, array math, Math.*, template strings, inline SVG inside <Custom>. The one hard limit is scope — every name you reference must be the standard library below, a JS built-in, or React. Reference anything else and the lesson CRASHES at mount.

THE STAGE — how a figure works
One engine clock, one domain store, one pure render, and three drivers that all reduce to the same event ("state changed → re-render"):
  · INTERACTION — a drag / slider / click writes the store.
  · DIRECTION   — a timeline (the "director") animates specific marks on command.
  · EMULATION   — a stepper advances the store every tick.
They share one store, so a figure can be a guided animation the learner can also grab, with a simulation running underneath. A figure is never a one-way video.

WHO OWNS A MARK'S POSITION — the one rule that stops animation and interaction from fighting
  · STATE-BOUND marks read their geometry from the store (\`x1={s.x0}\`). Interaction moves them. drawTo may still reveal them, because drawTo animates ONLY the reveal fraction — never the geometry.
  · HANDLE-BOUND marks carry their position on a useMark handle and are moved by transformTo. Presentation state therefore never pollutes the domain store.
  · Every interaction handler calls \`dir.reset()\` ONCE. That cancels in-flight motion and snaps reveals back, so a drag mid-animation can never leave a half-drawn figure. You never enumerate what to reset.

THE STANDARD LIBRARY (in scope as globals — compose it, and write your own code around it)
Stage & state:
  const s = useStage({ x0: -1.5, iters: [] })    // DOMAIN state: what the lesson is *about*
    s.x0             // read in render → subscribes, re-renders on change
    s.set({ x0: 2 }) // merge a patch — from a handler, a call() beat, or the stepper
    s.get()          // explicit snapshot; use inside a handler/closure so you never read a stale value
  useLessonState(key, initial) -> [value, setValue]   // persisted simple state for plain controls
  useState/useEffect/useMemo/useRef/useCallback       // standard React
Marks & direction:
  const tangent = useMark()              // a handle for a draw-on reveal (geometry stays declarative)
  const marker  = useMark({ x: -1.5 })   // a handle whose POSITION lives on the handle
    marker.set({ x: 0 })                 // set instantly, no tween — stage a mark before a beat
    marker.x / marker.opacity            // LIVE numeric reads — any channel, readable inside <Custom>
  const dir = useDirector()
    dir.play(beat)   // Promise<void>, runs on the engine clock
    dir.playing      // boolean — disable the play button with it
    dir.reset()      // cancel in-flight motion; reveals back to 0
  Beats — opts = { duration?, ease?: "linear"|"easeIn"|"easeOut"|"easeInOut", delay? }:
    drawTo(mark, opts?)                     // reveal a drawable mark, pathLength 0 -> 1
    transformTo(mark, { x, y }, opts?)      // move a handle-bound mark
    fadeTo(mark, opacity, opts?)
    call(fn)                                // zero-duration — this is where you COMMIT to the store
    sequence(beats) | parallel(beats) | stagger(beats, { each }) | wait(seconds)
Emulation:
  const sim = useSimulation(s, (state, dt) => patch, { rate: 1.6 })   // { rate } = discrete steps/sec
  //   ... or { dt: 0.02 } for continuous integration, decoupled from the frame rate
  //   step is PURE: return a patch to merge, or null to HALT (converged / long enough).
  sim.start() / sim.stop() / sim.reset() / sim.running
Figures — marks are CHILDREN of <Plot>, and any mark accepts mark={handle}:
  <Plot x={[-3, 4]} y={[-6, 8]} height={360}>
    <Plot.OfX y={x => f(x)} color="blue"/>          // color: "blue"|"coral"|"green"|"violet"|"orange"|"ink"
    <Plot.Point x={} y={} color? label?/>
    <Plot.Segment x1={} y1={} x2={} y2={} color? strokeWidth? dashed?/>
    <Plot.Polygon points={[[x, y], [x, y], ...]} color? fillOpacity?/>
    <Plot.MovablePoint x={} y={} onMove={p => ...} constrain?="horizontal"|"vertical" color?/>
    <Custom draw={({ xToPx, yToPx, pxToX, pxToY }) => <g>...</g>}/>
  </Plot>
Prose & structure:
  <Section title="...">...</Section>                  // lessons are a sequence of Sections
  <Prose>{\`markdown string with $inline$ and $$block$$ LaTeX\`}</Prose>
  <Callout kind="note|tip|warning|key-idea" title?>...</Callout>   // use "key-idea" to state the essence
  <Steps><Step title?>...</Step><Step>...</Step></Steps>          // ordered derivation, revealed one beat at a time
  <Reveal label?>...</Reveal>                          // "try it before you see it"
  <Math block?>{\`LaTeX\`}</Math>                        // a standalone display equation
Math & format:
  fmt(number, digits?) -> string                       // interpolate computed values into Prose with \${fmt(x)}
  math.evaluate/simplify/derivative(expr, var?)
  track(event, data?)                                  // telemetry for a bespoke interaction worth measuring
Controls (the explore-to-see-why surface):
  <Slider value={} onChange={} min={} max={} step? label?/>
  <Toggle checked={} onChange={} label?/>
  <NumberInput value={} onChange={} min? max? step? label?/>
Assessment (OPTIONAL — at most one light reflective check, never the focus):
  <Exercise prompt={<Prose>{...}</Prose>} answer={ANSWER} input?="text|number|point" solution?={...}>
    <Hint>...</Hint>
  </Exercise>
  <MultipleChoice prompt={...} correct={indexOrArray} shuffle? solution?><Option>...</Option>...</MultipleChoice>
  ANSWER shapes: {type:"numeric",value,tolerance?} | {type:"expression",value,vars?} | {type:"point",x,y,tolerance?} | {type:"interval",from,to,openLeft?,openRight?} | {type:"set",values,ordered?} | {type:"text",value}
  If the plan lists assessments, every graded <Exercise> MUST use the matching canonical answer VERBATIM — a machine re-checks it and blocks the lesson on any disagreement.

FREEFORM — <Custom> is the escape hatch, and using it is expected
When the stock marks cannot say what you mean, draw it yourself. <Custom> hands you the coordinate transforms (figure units <-> pixels) and renders whatever SVG you return: a shaded region, an arrowhead, a right triangle under a tangent, a hand-placed annotation. Write helper functions for the geometry. Reach for this whenever it makes the idea clearer — it is normal authoring, not an exception.

A <Custom> drawing ANIMATES like any other mark: its draw function re-runs every frame of a beat, so read handle channels directly and the drawing follows the tween.
  const tile = useMark({ x: 0, opacity: 0 })              // channels you invent are fine too
  dir.play(sequence([fadeTo(tile, 1, { duration: 0.4 }), transformTo(tile, { x: 3 }, { duration: 0.8 })]))
  <Custom draw={({ xToPx, yToPx }) => (
    <rect opacity={tile.opacity} x={xToPx(tile.x)} y={yToPx(3)} width={xToPx(1) - xToPx(0)} height={yToPx(0) - yToPx(3)} fill="#e08a2f" />
  )}/>
Read \`tile.opacity\`, never \`tile.values.opacity\` (that is the raw MotionValue) — the bare channel IS the current number. Widths and heights come from a DIFFERENCE of transforms (xToPx(a) - xToPx(b)), never from xToPx of a width.

DETERMINISM BOUNDARY
- Visual and animation code MAY use the clock and randomness. Motion does not have to be reproducible.
- The <Exercise answer={...}> spec must be a PLAIN STATIC OBJECT LITERAL — numbers and strings only, Math.* allowed, no variables, no computation, no grader function. A machine re-checks it by READING it, without running your lesson; anything it cannot read statically is unverifiable and blocks the lesson.

LECTURE-FIRST RULES
- Open by MOTIVATING — a tension or question, not a definition. Earn the idea.
- DEVELOP the argument with <Steps>: one beat per <Step>, so reasoning unfolds line by line instead of dumping algebra.
- Include exactly one interaction that lets the learner *see why* the idea is true (a Slider or a MovablePoint driving the figure). It must be load-bearing: the figure and the prose visibly depend on it, and it illustrates the reasoning rather than testing recall.
- Where the argument has a MOMENT — a construction being built, a step being taken — SCRIPT it with the director instead of describing it: a short sequence() the learner triggers with a button, with a call() that commits the result to the store.
- REVEAL the essence explicitly, ideally in a <Callout kind="key-idea">.
- Prose children is a single template-literal STRING. Do NOT nest JSX inside <Prose>. Put math as $...$ / $$...$$.
- Never write a computed number as a prose literal. Compute in JS and interpolate with \${fmt(...)} — JS does the arithmetic, not you.
- Plot.OfX 'y' is a real JS function of x; keep it total (avoid dividing by zero across the domain).
- Keep motion purposeful: short beats (roughly half a second), one idea per beat, and nothing that moves without explaining something.

Write the lesson you would be proud to give as a lecture.`;

// The golden reference lesson (sdk/examples/newton.lesson.tsx), verbatim minus
// its header comment. It is simultaneously the API contract, this few-shot, and
// the runtime's acceptance test — so the example can never drift from what the
// runtime actually does.
const FEWSHOT = `export const meta: LessonMeta = {
  concept: "newtons-method",
  prerequisites: ["derivatives", "tangent-lines", "roots-of-equations"],
  objectives: [
    "Read a Newton step as: slide down the tangent to where it crosses the x-axis",
    "Iterate x_{n+1} = x_n − f(x_n)/f'(x_n) and see fast convergence near a root",
    "Recognize how a bad initial guess overshoots or flies off",
  ],
  difficulty: 3,
}

export default function Lesson() {
  // f has one real root near x ≈ 1.77 and flat spots (f'=0 at x = ±√(2/3)) that
  // fling bad guesses far — a good basin to explore. Arithmetic in JS only.
  const f = (x: number) => x ** 3 - 2 * x - 2
  const df = (x: number) => 3 * x ** 2 - 2
  const stepFn = (x: number) => x - f(x) / df(x) // one Newton iterate

  // DOMAIN state — only what the lesson is *about*.
  const s = useStage({ x0: -1.5, iter: -1.5, iters: [] as number[] })

  // HANDLE-BOUND marks — the director animates these directly. Their motion never
  // touches the domain store (that separation is what W0 friction #1 was about).
  const vert = useMark() //             vertical (x0,0)→(x0,f(x0)) — draw-on
  const tang = useMark() //             tangent line — draw-on
  const marker = useMark({ x: -1.5 }) // the point that slides to xNext — transform

  const dir = useDirector()

  // EMULATION — a discrete map stepped at a fixed rate off the engine clock.
  // Returning null halts the sim (converged, or ran long enough).
  const sim = useSimulation(
    s,
    (st) => {
      const x = st.iter
      if (Math.abs(f(x)) < 1e-9 || st.iters.length > 18) return null
      const xn = stepFn(x)
      return { iter: xn, iters: [...st.iters, xn] }
    },
    { rate: 1.6 },
  )

  // DIRECTION — one step, addressed at specific marks. Geometry stays declarative
  // (the segments below read x0); the beats only reveal/move the marks.
  const oneStep = (x: number) => {
    const xn = stepFn(x)
    return sequence([
      call(() => {
        s.set({ x0: x }) // reposition the (declarative) segment endpoints
        dir.reset() //      pathLengths→0, cancel in-flight
        marker.set({ x }) // stage the marker at the current guess
      }),
      drawTo(vert, { duration: 0.5, ease: "easeOut" }), //   rise to the curve
      drawTo(tang, { duration: 0.6 }), //                    draw the tangent
      transformTo(marker, { x: xn }, { duration: 0.7, ease: "easeInOut" }), // slide
      call(() => s.set({ x0: xn })), //                      commit: crossing → next guess
    ])
  }

  const playOne = () => dir.play(oneStep(s.x0))

  // Guided four-step reveal: chain steps, recomputing x each beat (pure).
  const playMany = () => {
    let x = s.x0
    const beats = []
    for (let i = 0; i < 4; i++) {
      beats.push(oneStep(x))
      beats.push(wait(0.25))
      x = stepFn(x)
    }
    dir.play(sequence(beats))
  }

  const onGuess = (x0: number) => {
    s.set({ x0 })
    dir.reset() // interaction cancels any in-flight animation cleanly
  }

  const runSim = () => {
    s.set({ iter: s.x0, iters: [s.x0] }) // seed the iteration from the guess
    sim.start()
  }

  // ---- geometry, read straight off state (pure) -----------------------------
  const x0 = s.x0
  const y0 = f(x0)
  const xNext = stepFn(x0) // where the tangent meets y = 0
  const root = 1.7692923542386314 // f(root) = 0, for the callout
  const resid = s.iters.length ? f(s.iters[s.iters.length - 1]) : f(x0)

  return (
    <>
      <Section title="Newton's method — chase the tangent to a root">
        <Prose>{\`We want to solve $f(x) = 0$ for

$$f(x) = x^3 - 2x - 2.$$

Guessing blindly is hopeless. **Newton's idea:** stand at a guess $x_n$, and
instead of the curve, follow the **tangent line** — the curve's best straight-line
stand-in. Slide down the tangent to where it crosses the $x$-axis, and let *that*
crossing be your next guess. Repeat.\`}</Prose>

        <Callout kind="key-idea" title="One step, in one sentence">
          <Prose>{\`The tangent at $x_n$ crosses zero at

$$x_{n+1} = x_n - \\\\frac{f(x_n)}{f'(x_n)}.$$

Drag the guess below, then press **Play one step** to watch a single tangent slide.\`}</Prose>
        </Callout>

        <Plot x={[-3, 4]} y={[-6, 8]} height={360}>
          <Plot.OfX y={f} color="blue" />

          {/* FREEFORM: the tangent step's right triangle + an arrowhead at the
              crossing — geometry the stock marks don't give us, in figure coords. */}
          <Custom
            draw={({ xToPx, yToPx }: any) => {
              const A = [xToPx(x0), yToPx(0)]
              const B = [xToPx(x0), yToPx(y0)]
              const C = [xToPx(xNext), yToPx(0)]
              const ang = Math.atan2(yToPx(0) - yToPx(y0), xToPx(xNext) - xToPx(x0))
              return (
                <g>
                  <path
                    d={\`M\${A[0]},\${A[1]} L\${B[0]},\${B[1]} L\${C[0]},\${C[1]} Z\`}
                    fill="#7b5bd6"
                    fillOpacity={0.12}
                    stroke="none"
                  />
                  <path
                    // Barbs sweep BACK from the tip: subtract a vector along the
                    // direction of travel, splayed by ±0.4 rad. (A wide splay like
                    // ±2.6 flips the sign of the cosine and throws them past C.)
                    d={\`M\${C[0]},\${C[1]} L\${C[0] - 10 * Math.cos(ang + 0.4)},\${C[1] - 10 * Math.sin(ang + 0.4)} M\${C[0]},\${C[1]} L\${C[0] - 10 * Math.cos(ang - 0.4)},\${C[1] - 10 * Math.sin(ang - 0.4)}\`}
                    stroke="#e08a2f"
                    strokeWidth={2.5}
                    fill="none"
                  />
                </g>
              )
            }}
          />

          {/* Draw-on marks: declarative geometry (endpoints read x0); the director
              only reveals them via drawTo(pathLength). */}
          <Plot.Segment mark={vert} x1={x0} y1={0} x2={x0} y2={y0} color="violet" dashed />
          <Plot.Segment mark={tang} x1={x0} y1={y0} x2={xNext} y2={0} color="orange" strokeWidth={2.5} />
          <Plot.Point x={x0} y={y0} color="orange" />

          {/* Handle-bound marker: its x lives on the mark, moved by transformTo. */}
          <Plot.Point mark={marker} y={0} color="green" label="x_{n+1}" />

          {/* INTERACTION: drag the guess along the x-axis (state-bound, not scripted). */}
          <Plot.MovablePoint x={x0} y={0} color="coral" constrain="horizontal" onMove={(p: any) => onGuess(p.x)} />
        </Plot>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button onClick={playOne} disabled={dir.playing}>Play one step</button>
          <button onClick={playMany} disabled={dir.playing}>Play four steps</button>
        </div>

        <Slider value={x0} onChange={onGuess} min={-3} max={4} step={0.01} label="x_0" />

        <Callout kind="note" title="Where the tangent lands">
          <Prose>{\`From $x_0 = \${fmt(x0)}$: the height is $f(x_0) = \${fmt(y0)}$ and the slope is
$f'(x_0) = \${fmt(df(x0))}$, so the tangent crosses the axis at
$x_1 = \${fmt(xNext)}$. The true root sits at $x^{*} \\\\approx \${fmt(root)}$.\`}</Prose>
        </Callout>
      </Section>

      <Section title="Let it iterate">
        <Prose>{\`Once one step works, the rest is just *doing it again*. Press **Run** to iterate
$x_{n+1} = x_n - f(x_n)/f'(x_n)$ from wherever the guess sits — the same clock that
drives the animation drives the iteration.\`}</Prose>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button onClick={runSim} disabled={sim.running}>Run</button>
          <button onClick={() => sim.stop()} disabled={!sim.running}>Pause</button>
          <button onClick={() => { sim.reset(); s.set({ iters: [] }) }}>Reset</button>
        </div>

        {s.iters.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px", margin: "10px 0" }}>
            {s.iters.map((xn, i) => (
              <span key={i} style={{ fontFamily: "ui-monospace, monospace" }}>
                <Math>{\`x_{\${i}} = \${fmt(xn, 5)}\`}</Math>
              </span>
            ))}
          </div>
        )}

        <Callout kind={Math.abs(resid) < 1e-4 ? "tip" : "warning"} title="How close are we?">
          <Prose>{\`The last iterate leaves a residual $|f(x_n)| = \${fmt(Math.abs(resid), 6)}$.
Near the root each step roughly **doubles** the number of correct digits — but start
past the flat spot at $x = \\\\pm\\\\sqrt{2/3} \\\\approx \${fmt(Math.sqrt(2 / 3))}$, where
$f'(x_0)$ is tiny, and the very first tangent can fling the guess far away.\`}</Prose>
        </Callout>
      </Section>

      <Section title="Check your understanding">
        <Prose>{\`Try Newton's method by hand, using $f(x) = x^3 - 2x - 2$ and
$f'(x) = 3x^2 - 2$.\`}</Prose>

        <Exercise
          prompt={<Prose>{\`Starting from $x_0 = 2$, compute the next iterate $x_1$.\`}</Prose>}
          // f(2)=2, f'(2)=10 → x1 = 2 − 2/10 = 1.8. CAS-checked numerically.
          answer={{ type: "numeric", value: 1.8, tolerance: 1e-6 }}
          input="number"
          solution={
            <Steps>
              <Step title="Evaluate">
                <Prose>{\`$f(2) = 8 - 4 - 2 = 2$ and $f'(2) = 12 - 2 = 10$.\`}</Prose>
              </Step>
              <Step title="Step">
                <Prose>{\`$x_1 = 2 - \\\\dfrac{2}{10} = 1.8$.\`}</Prose>
              </Step>
            </Steps>
          }
        >
          <Hint>Plug into $x_1 = x_0 - f(x_0)/f'(x_0)$.</Hint>
        </Exercise>

        <MultipleChoice
          prompt="Why can a guess near the flat spot f'(x)≈0 send Newton flying?"
          correct={0}
          shuffle
          solution={
            <Prose>{\`Dividing by a near-zero slope makes $f(x)/f'(x)$ enormous, so the
tangent is nearly horizontal and crosses the axis very far away.\`}</Prose>
          }
        >
          <Option>The step f(x)/f'(x) blows up when the slope is tiny</Option>
          <Option>The function has no root there</Option>
          <Option>The tangent line stops existing</Option>
        </MultipleChoice>
      </Section>
    </>
  )
}`;

/** Spells out the canonical answers the built lesson must grade against, so the
 *  grader agrees with the verifier's source of truth. */
function canonicalNote(plan: LessonPlan): string {
  const a = plan.assessments ?? [];
  if (!a.length) return "\nThis lesson has no graded answer — keep it exploratory; do not invent a quiz.\n";
  const lines = a.map((x) => `- ${x.ask} → answer: ${describeAnswer(x.answer)}  (spec: ${JSON.stringify(x.answer)})`).join("\n");
  return `\nCANONICAL ANSWERS — any graded <Exercise> must use these EXACTLY (verbatim spec), or the verifier blocks the lesson:\n${lines}\n`;
}

export function buildPrompt(plan: LessonPlan): string {
  return `Here is the pedagogical plan to render, and a golden reference lesson showing the Stage in full — interaction, direction, emulation and freeform drawing in one figure. Match its craft and its shape, not its content.

EXAMPLE LESSON:
${FEWSHOT}

PLAN (teach exactly this — its essence, argument, and interaction):
${JSON.stringify(plan, null, 2)}
${canonicalNote(plan)}
Author the lesson component now. Follow the plan's through-line: motivate with its "motivate", develop its "develop" beats (use <Steps>), build the "interaction" so the learner sees why, and reveal its "essence". Return only the component source.`;
}

export function repairPrompt(code: string, error: string): string {
  return `The lesson component below failed. Fix it and return the COMPLETE corrected component source only (no fences, no commentary).

ERROR:
${error}

CURRENT CODE:
${code}`;
}

/** Offline mock lesson, mirroring MOCK_PLAN. Small on purpose, but it exercises
 *  the runtime the live path uses: a useStage store, a director beat over a
 *  useMark handle, and a load-bearing slider interaction. */
export const MOCK_LESSON = `export const meta = { concept: "vertex-form-parabolas", objectives: ["Read a parabola's vertex straight off vertex form"], difficulty: 2 }

export default function Lesson() {
  const s = useStage({ a: 1, h: 0, k: 0 })
  const drop = useMark()        // the segment from the vertex down to the axis — revealed on command
  const dir = useDirector()
  const f = (x) => s.a * (x - s.h) ** 2 + s.k

  // Interaction: every control cancels in-flight motion with ONE dir.reset().
  const on = (key) => (v) => { dir.reset(); s.set({ [key]: v }) }

  // Direction: one short beat that points at the vertex the form predicts.
  const showVertex = () => dir.play(sequence([
    call(() => dir.reset()),
    drawTo(drop, { duration: 0.6, ease: "easeOut" }),
  ]))

  return (
    <>
      <Section title="Where does a parabola turn around?">
        <Prose>{\`Look at $x^2 - 6x + 11$. Where does it bottom out? You genuinely can't tell by staring. Yet there's a way to write *the same curve* so the turning point is impossible to miss.\`}</Prose>
        <Plot x={[-6, 6]} y={[-6, 6]} height={320}>
          <Plot.OfX y={f} color="blue" />
          <Plot.Segment mark={drop} x1={s.h} y1={s.k} x2={s.h} y2={0} color="violet" dashed />
          <Plot.Point x={s.h} y={s.k} color="coral" label="vertex" />
        </Plot>
        <button onClick={showVertex} disabled={dir.playing}>Point at the vertex</button>
        <Slider value={s.a} onChange={on("a")} min={-3} max={3} step={0.1} label="a" />
        <Slider value={s.h} onChange={on("h")} min={-4} max={4} step={0.5} label="h" />
        <Slider value={s.k} onChange={on("k")} min={-4} max={4} step={0.5} label="k" />
        <Prose>{\`Drag $h$ and $k$. The vertex marker sits at $(\${fmt(s.h)}, \${fmt(s.k)})$ — exactly the numbers in the form. Drag $a$: the curve stretches and can flip, but the vertex never moves.\`}</Prose>
      </Section>
      <Section title="Why (h, k) is forced to be the vertex">
        <Steps>
          <Step title="A square is never negative">
            <Prose>{\`$(x-h)^2 \\\\ge 0$ for every $x$, and it equals $0$ only when $x = h$. So the squared part is smallest exactly there.\`}</Prose>
          </Step>
          <Step title="Adding k lifts the floor">
            <Prose>{\`$f(x) = a(x-h)^2 + k$. When the square is $0$, $f = k$. Everywhere else the square adds something, pushing $f$ away from $k$.\`}</Prose>
          </Step>
          <Step title="So the turning point is read, not computed">
            <Prose>{\`The extreme value happens at $x = h$ and its height is $k$. The vertex is $(h, k)$ — straight off the form.\`}</Prose>
          </Step>
        </Steps>
        <Callout kind="key-idea" title="The essence">
          <Prose>{\`In $f(x) = a(x-h)^2 + k$ the vertex isn't something you *calculate* — it's something you *read*. The form already points at it.\`}</Prose>
        </Callout>
        <Exercise prompt={<Prose>{\`Read it off: for $f(x) = 2(x-3)^2 + 5$, what is the minimum value of $f$?\`}</Prose>} answer={{ type: "numeric", value: 5, tolerance: 0.001 }} input="number">
          <Hint>The squared part is never negative, and it's zero at the vertex.</Hint>
          <Hint>At the vertex the square contributes $0$, so $f$ equals the $+k$ term.</Hint>
        </Exercise>
      </Section>
    </>
  )
}`;
