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

THE DEFAULT SHAPE — a Deck of Screens, one idea per screen
A taught lesson is a \`<Deck>\` of \`<Screen>\`s, not one long scroll. Each beat of the plan's \`develop[]\` becomes its OWN \`<Screen>\`: a title, a SHORT bit of prose, and the interactive figure as the star of that screen. The learner taps through them (the deck owns the navigation — a slider inside a screen never doubles as "next"). Prose shrinks; the figure carries the idea. A single \`<Section>\` is still fine for a simple one-surface lesson, but reach for the deck whenever you are teaching a sequence.

CONCRETE PICTURES, NOT ALWAYS A PLOT
Reach for a bespoke \`<Scene>\` — a pixel grid, tokens, shapes, arrows, brackets — whenever the concept is about counts, sets, groupings, geometry, structure, or a process. A \`<Scene>\` is a blank canvas: you draw the idea's actual picture, not its graph. Use \`<Plot>\` (Cartesian axes) ONLY when the concept genuinely IS a function or a curve. Do NOT default to a plot — most ideas are not curves.

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
  Beats — opts = { duration?, ease?: "linear"|"easeIn"|"easeOut"|"easeInOut", delay?, spring? }:
    drawTo(mark, opts?)                     // reveal a drawable mark, pathLength 0 -> 1 (timed unless you pass spring)
    transformTo(mark, { x, y }, opts?)      // move a handle-bound mark — springs by DEFAULT (a natural physical settle)
    fadeTo(mark, opacity, opts?)            // timed unless you pass spring
    call(fn)                                // zero-duration — this is where you COMMIT to the store
    sequence(beats) | parallel(beats) | stagger(beats, { each }) | wait(seconds)
    spring: true | "gentle" | "snappy" | "bouncy"  // on ANY beat: a self-timed physics settle — don't also pass duration/ease
Emulation:
  const sim = useSimulation(s, (state, dt) => patch, { rate: 1.6 })   // { rate } = discrete steps/sec
  //   ... or { dt: 0.02 } for continuous integration, decoupled from the frame rate
  //   step is PURE: return a patch to merge, or null to HALT (converged / long enough).
  sim.start() / sim.stop() / sim.reset() / sim.running
Figures — pick the surface the idea deserves; marks/atoms are CHILDREN, and any of them accepts mark={handle}.
  <Scene> — a blank bespoke-drawing canvas (no axes), for concrete pictures (default surface for counts/sets/geometry/structure). Coordinates are figure units, y-up (same as Plot); units stay square by default. Colors are palette names blue/coral/green/violet/orange/ink or neutrals like "line".
  <Scene x={[0,10]} y={[0,10]} height={} preserveAspect background?>   // a blank bespoke-drawing canvas (no axes)
    <Scene.Grid rows={} cols={} x?={} y?={} fill={(row,col,index)=>colorName} gap? radius?/>   // rows×cols cells; per-cell color; recolors smoothly
    <Scene.Rect x={} y={} width={} height={} color? fillOpacity? radius? mark?/>
    <Scene.Circle x={} y={} r={} color? fillOpacity? mark?/>
    <Scene.Line x1={} y1={} x2={} y2={} color? strokeWidth? dashed? mark?/>
    <Scene.Arrow from={[x,y]} to={[x,y]} color? mark?/>
    <Scene.Bracket from={[x,y]} to={[x,y]} label? color? depth?/>
    <Scene.Region points={[[x,y],...]} color? fillOpacity? mark?/>
    <Scene.Label x={} y={} color? size? anchor?>{"text"}</Scene.Label>
    <Custom draw={({xToPx,yToPx})=>…}/>   // works inside <Scene> too
  </Scene>
  <Plot> — Cartesian axes, ONLY when the concept genuinely IS a function/curve:
  <Plot x={[-3, 4]} y={[-6, 8]} height={360}>
    <Plot.OfX y={x => f(x)} color="blue"/>          // color: "blue"|"coral"|"green"|"violet"|"orange"|"ink"
    <Plot.Point x={} y={} color? label?/>
    <Plot.Segment x1={} y1={} x2={} y2={} color? strokeWidth? dashed?/>
    <Plot.Polygon points={[[x, y], [x, y], ...]} color? fillOpacity?/>
    <Plot.MovablePoint x={} y={} onMove={p => ...} constrain?="horizontal"|"vertical" color?/>
    <Custom draw={({ xToPx, yToPx, pxToX, pxToY }) => <g>...</g>}/>
  </Plot>
Prose & structure:
  <Deck><Screen title="...">…one idea…</Screen><Screen title="...">…</Screen></Deck>   // THE DEFAULT SHAPE: one idea per screen, tapped through
  <Screen title?>...</Screen>                          // a single full-attention screen inside a <Deck> (a figure + a little prose)
  <Section title="...">...</Section>                  // one scrolling surface — for a simple single-idea lesson, not a taught sequence
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
- DEVELOP the argument as SCREENS: each develop[] beat is its own <Screen> with one figure as the star. Within a screen, use <Steps> (one beat per <Step>) when a single derivation needs to unfold line by line instead of dumping algebra.
- Include exactly one interaction that lets the learner *see why* the idea is true (a Slider or a MovablePoint driving the figure). It must be load-bearing: the figure and the prose visibly depend on it, and it illustrates the reasoning rather than testing recall.
- Where the argument has a MOMENT — a construction being built, a step being taken — SCRIPT it with the director instead of describing it: a short sequence() the learner triggers with a button, with a call() that commits the result to the store.
- REVEAL the essence explicitly, ideally in a <Callout kind="key-idea">.
- Prose children is a single template-literal STRING. Do NOT nest JSX inside <Prose>. Put math as $...$ / $$...$$.
- LaTeX NEVER goes in JSX text — not in <Hint>, <Option>, <Step>, <Callout>, anywhere. JSX reads a brace as an expression, so \`<Hint>Use \\frac{d}{dx}</Hint>\` references two variables named d and dx and the lesson dies with "ReferenceError: d is not defined". Always wrap it: \`<Hint><Prose>{\`Use $\\\\frac{d}{dx}$\`}</Prose></Hint>\`. A machine checks this before the lesson runs and blocks it.
- Never write a computed number as a prose literal. Compute in JS and interpolate with \${fmt(...)} — JS does the arithmetic, not you.
- Plot.OfX 'y' is a real JS function of x; keep it total (avoid dividing by zero across the domain).
- Keep motion purposeful: short beats (roughly half a second), one idea per beat, and nothing that moves without explaining something.

Write the lesson you would be proud to give as a lecture.`;

// The golden reference lesson (sdk/examples/bayes.lesson.tsx), verbatim minus
// its header comment. It is simultaneously the API contract, this few-shot, and
// the runtime's acceptance test — so the example can never drift from what the
// runtime actually does.
const FEWSHOT = `export const meta: LessonMeta = {
  concept: "bayes-theorem",
  prerequisites: ["conditional-probability", "percentages"],
  objectives: [
    "Read Bayes' theorem as natural frequencies over 100 people, not algebra",
    "See why a positive test for a rare condition is usually a false alarm",
    "Compute P(sick | test +) = TP / (TP + FP) by counting people",
  ],
  difficulty: 2,
}

export default function Lesson() {
  // Fixed, documented test characteristics.
  //   se = sensitivity      = P(+ | sick)  — the test catches 90% of the sick.
  //   fp = false-pos. rate  = P(+ | well)  — it wrongly flags 9% of the healthy.
  // These are the classic screening numbers: at a 1% base rate they give the
  // famous ≈10% posterior (nSick=1, TP=1, FP=9 → 1/10).
  const se = 0.9
  const fp = 0.09

  // 100 people as INTEGER counts — natural frequencies, nothing to trust on faith.
  const counts = (p: number) => {
    const nSick = Math.round(p * 100)
    const nWell = 100 - nSick
    const TP = Math.round(nSick * se) //  sick, test +   (caught)
    const FN = nSick - TP //              sick, test −   (missed)
    const FP = Math.round(nWell * fp) //  well, test +   (false alarm)
    const TN = nWell - FP //              well, test −   (all clear)
    const pos = TP + FP //                everyone who sees a "+" result
    const post = pos > 0 ? TP / pos : 0 // P(sick | +), guarded
    return { nSick, nWell, TP, FN, FP, TN, pos, post }
  }

  const s = useStage({ p: 0.08, dimmed: false })
  const dir = useDirector()
  const scrim = useMark({ opacity: 0 }) // the screen-4 spotlight, sprung by fadeTo

  const c = counts(s.p)

  // Row-major colour blocks laid down in order [ TP | FN | FP | TN ], so the grid
  // reads as four clean runs. \`index\` is 0..99, row 0 at the top.
  const t1 = c.TP //           coral  ends here
  const t2 = c.TP + c.FN //    violet ends here
  const t3 = c.TP + c.FN + c.FP // orange ends here (rest is neutral TN)
  const sickVsWell = (_r: number, _c: number, i: number) => (i < c.nSick ? "coral" : "line")
  const fourWay = (_r: number, _c: number, i: number) =>
    i < t1 ? "coral" : i < t2 ? "violet" : i < t3 ? "orange" : "line"

  // A cell tests POSITIVE iff it is a true positive (coral) or false positive
  // (orange) — the two blocks that are NOT contiguous, so we list the rest.
  const isPositive = (i: number) => i < t1 || (i >= t2 && i < t3)
  const negatives: number[] = []
  for (let i = 0; i < 100; i++) if (!isPositive(i)) negatives.push(i)

  // Toggle the spotlight: spring the scrim's opacity 0↔1 (a gentle physics settle).
  const spotlight = () => {
    const on = !s.dimmed
    s.set({ dimmed: on })
    dir.play(fadeTo(scrim, on ? 1 : 0, { spring: "gentle" }))
  }

  const legend: [string, string][] = [
    ["coral", "sick · caught (+)"],
    ["violet", "sick · missed (−)"],
    ["orange", "well · false alarm (+)"],
    ["line", "well · all clear (−)"],
  ]

  const rateSlider = (
    <Slider value={s.p} onChange={(p) => s.set({ p })} min={0.01} max={0.5} step={0.01} label="rate" />
  )

  return (
    <Deck>
      <Screen title="A positive test — should you panic?">
        <Prose>{\`About **1 in 100** people have a certain condition. There is a test for it that is
roughly **90% accurate**. You take it, and it comes back **positive**.

How likely is it that you *actually* have the condition?

Most people say "about 90%." Hold that thought. We are going to stop trusting the
percentages and **count real people** instead — and the true answer is far smaller.\`}</Prose>
      </Screen>

      <Screen title="Start with 100 people">
        <Prose>{\`Here are 100 people, one per cell. The condition's **base rate** — how common it is —
decides how many are actually sick (coral). Drag it and watch the sick block grow and shrink.\`}</Prose>

        <Scene x={[0, 10]} y={[0, 10]} height={340}>
          <Scene.Grid rows={10} cols={10} fill={sickVsWell} gap={0.1} radius={0.12} />
        </Scene>

        {rateSlider}

        <Prose>{\`At a base rate of $\${fmt(s.p * 100, 0)}\\\\%$, that is **\${fmt(c.nSick)} sick** and
**\${fmt(c.nWell)} healthy** out of 100.\`}</Prose>
      </Screen>

      <Screen title="Now give everyone the test">
        <Prose>{\`The test is not perfect. Of the sick it **catches \${fmt(se * 100, 0)}%** (coral) and misses
the rest (violet). Of the healthy it wrongly **flags \${fmt(fp * 100, 0)}%** (orange); the rest come
back clear (grey). Four groups — still exactly 100 people.\`}</Prose>

        <Scene x={[0, 14.5]} y={[0, 10]} height={340}>
          <Scene.Grid rows={10} cols={10} x={[0, 10]} y={[0, 10]} fill={fourWay} gap={0.1} radius={0.12} />
          {legend.map(([color, text], k) => {
            const y = 8.6 - k * 1.5
            return (
              <React.Fragment key={color}>
                <Scene.Rect x={10.6} y={y} width={0.8} height={0.8} color={color} fillOpacity={1} radius={0.12} />
                <Scene.Label x={11.7} y={y + 0.4} anchor="start" size={14}>{text}</Scene.Label>
              </React.Fragment>
            )
          })}
        </Scene>

        {rateSlider}

        <Prose>{\`Counting heads: **\${fmt(c.TP)} caught**, \${fmt(c.FN)} missed, **\${fmt(c.FP)} false alarms**,
and \${fmt(c.TN)} cleared.\`}</Prose>
      </Screen>

      <Screen title="Who actually tested positive?">
        <Prose>{\`A "+" result comes from **two** groups: the truly sick who were caught (coral) and the
healthy who were falsely flagged (orange). Press the button to spotlight them — everyone who
tested *negative* dims away.\`}</Prose>

        <Scene x={[0, 10]} y={[0, 10]} height={340}>
          <Scene.Grid rows={10} cols={10} x={[0, 10]} y={[0, 10]} fill={fourWay} gap={0.1} radius={0.12} />
          <Custom
            draw={({ xToPx, yToPx }) => (
              <g>
                {negatives.map((i) => {
                  const row = Math.floor(i / 10)
                  const colIx = i % 10
                  const x = xToPx(colIx + 0.05)
                  const yTop = yToPx(10 - row - 0.05)
                  const w = xToPx(colIx + 0.95) - x
                  const h = yToPx(9 - row + 0.05) - yTop
                  return (
                    <rect key={i} x={x} y={yTop} width={w} height={h} rx={3} fill="#fcfdff" opacity={scrim.opacity * 0.82} />
                  )
                })}
              </g>
            )}
          />
        </Scene>

        <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
          <button onClick={spotlight}>{s.dimmed ? "Show everyone" : "Spotlight the positives"}</button>
        </div>

        {rateSlider}

        <Callout kind="note" title="The count that decides it">
          <Prose>{\`**\${fmt(c.pos)} people test positive**, but only **\${fmt(c.TP)} of them are truly sick**. So

$$P(\\\\text{sick} \\\\mid +) = \\\\frac{\${fmt(c.TP)}}{\${fmt(c.TP)} + \${fmt(c.FP)}} = \${fmt(c.post * 100, 0)}\\\\%.$$

At a base rate of $\${fmt(s.p * 100, 0)}\\\\%$, a positive result is **more often a false alarm than the real thing** — drag the rate up and watch that flip.\`}</Prose>
        </Callout>
      </Screen>

      <Screen title="Why the paradox">
        <Callout kind="key-idea" title="Rarity beats accuracy">
          <Prose>{\`When a condition is **rare**, the handful of true positives is swamped by false positives
drawn from the huge healthy majority. A \${fmt(se * 100, 0)}%-accurate test can still be wrong most
of the time it shouts "positive" — not because the test is bad, but because there are so many
more healthy people available to misflag.

The remedy is not a better test; it is to think in **natural frequencies**: out of 100 real
people, how many with a positive result are actually sick? Count, and the panic dissolves.\`}</Prose>
        </Callout>
      </Screen>
    </Deck>
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
  return `Here is the pedagogical plan to render, and a golden reference lesson: a bespoke-scene deck — a recoloring pixel grid across tap-through screens, with a spring spotlight. Match its craft and its shape (a Deck of Screens built on a bespoke Scene), not its content.

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
