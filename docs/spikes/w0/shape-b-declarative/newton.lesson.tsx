/**
 * SPIKE W0 — SHAPE B ("fully declarative components").
 *
 * Realistic model output for the Stage runtime, authored in the declarative
 * shape: there are NO imperative director calls. Every driver is JSX.
 *   - interaction ── <Plot.MovablePoint onMove={...}>          (drag the guess)
 *   - direction  ── <Timeline><Draw/><Draw/><Animate/></...>   (a timed step)
 *   - emulation  ── <Simulate step={...} running={...}/>        (iterate to a root)
 *   - freeform   ── <Custom>{({xToPx,yToPx}) => <path/>}</...>  (shaded triangle)
 *
 * Concept: Newton's method — following the tangent to a root of f(x)=x^3-2x-2.
 *
 * House rules honoured: no imports (std-lib is injected in scope); no computed
 * number is ever a prose literal (always `${fmt(...)}`); graded answers are
 * declarative CAS specs. The exact std-lib signatures this file assumes are
 * documented in ./api.md.
 */

export const meta: LessonMeta = {
  concept: "newtons-method",
  prerequisites: ["derivatives", "tangent-lines", "roots-of-equations"],
  objectives: [
    "Read Newton's update as: slide down the tangent to where it hits the x-axis",
    "Predict fast convergence near a root and blow-up from a flat-slope start",
    "Iterate x_{n+1} = x_n − f(x_n)/f'(x_n) by hand and by machine",
  ],
  difficulty: 3,
}

export default function Lesson() {
  // f(x) = x^3 - 2x - 2 has one real root near x ≈ 1.769; f'(x)=0 at x≈±0.816,
  // so a guess near the humps has a near-flat tangent and flies off — a good basin.
  const f = (x: number) => x ** 3 - 2 * x - 2
  const fp = (x: number) => 3 * x ** 2 - 2
  const newton = (x: number) => x - f(x) / fp(x)

  const XD: [number, number] = [-3, 3]
  const YD: [number, number] = [-6, 6]

  // One reactive store, one setter. All three drivers write here.
  const [s, set] = useStage({
    x0: -0.5, // the guess the learner drags; anchor of the tangent geometry
    xMark: -0.5, // animated marker position (the "ball" that rolls down the axis)
    step: "idle" as "idle" | "playing", // gates the static preview vs the animation
    playToken: 0, // bump to fire the single-step Timeline
    revealToken: 0, // bump to fire the staggered multi-step Timeline
    running: false, // emulation on/off
    history: [] as number[], // iterates produced by <Simulate>
  })

  // Derived, purely, from the current guess. Snapshot at render — fine for a
  // SINGLE step (x0 hasn't moved yet when Play fires). See api.md §c for why
  // this snapshot-at-render property is the crux of Shape B.
  const fx = f(s.x0)
  const fpx = fp(s.x0)
  const xNext = newton(s.x0)

  // The staircase for the multi-step reveal, UNROLLED PURELY in render. Because
  // Newton's recurrence is a closed pure function we can precompute every beat's
  // target here — no beat depends on another beat's mid-flight store write.
  const trace: Array<[number, number]> = []
  {
    let x = s.x0
    for (let i = 0; i < 6 && isFinite(x) && Math.abs(x) < 12; i++) {
      const nx = newton(x)
      if (!isFinite(nx)) break
      trace.push([x, nx])
      x = nx
    }
  }

  const converged = s.history.length > 0 && Math.abs(f(s.history[s.history.length - 1])) < 1e-4
  const diverged = s.history.length > 0 && !isFinite(s.history[s.history.length - 1])

  return (
    // <Stage> provides the store setter to the declarative motion drivers
    // (Animate / Timeline / Simulate) via context, so they can write without
    // threading `set` through every prop. Marks read plain `s` from closure.
    <Stage set={set}>
      <Section title="Newton's method — chase the tangent to a root">
        <Prose>{`To solve $f(x)=0$, you don't need a formula for the root — you need
a good guess and the **tangent line**. Stand at your guess $x_n$, climb straight up
to the curve at $\\bigl(x_n,\\ f(x_n)\\bigr)$, then **slide down the tangent** to where
it crosses the $x$-axis. That crossing is your next, usually better, guess:

$$x_{n+1} \\;=\\; x_n \\;-\\; \\frac{f(x_n)}{f'(x_n)}.$$

Here $f(x)=x^3-2x-2$. **Drag the blue guess** along the axis and watch the tangent
swing. Near the root the steps shrink fast; park the guess on a nearly-flat part of
the curve and the tangent hurls you far away.`}</Prose>

        <Plot x={XD} y={YD} height={360}>
          <Plot.OfX y={f} color="blue" />

          {/* FREEFORM — the shaded right-triangle of the tangent step. The marks
              give us lines and points but not a filled figure-coordinate polygon,
              so we drop to <Custom> and emit a <path> in figure coords. Legs:
              vertical = f(x0), horizontal = f(x0)/f'(x0); hypotenuse = the tangent. */}
          {s.step === "idle" && isFinite(xNext) && (
            <Custom>
              {({ xToPx, yToPx }) => (
                <path
                  d={`M ${xToPx(s.x0)} ${yToPx(0)}
                      L ${xToPx(s.x0)} ${yToPx(fx)}
                      L ${xToPx(xNext)} ${yToPx(0)} Z`}
                  fill="rgba(224,138,47,0.14)"
                  stroke="none"
                />
              )}
            </Custom>
          )}

          {/* STATIC PREVIEW (idle only): the live geometry that tracks the drag.
              During an animated step this is hidden and the Timeline draws it. */}
          {s.step === "idle" && (
            <>
              <Plot.Segment from={[s.x0, 0]} to={[s.x0, fx]} color="violet" dashed />
              <Plot.Line point={[s.x0, fx]} slope={fpx} color="orange" clip={XD} />
              <Plot.Point x={s.x0} y={fx} color="orange" />
              {isFinite(xNext) && <Plot.Point x={xNext} y={0} color="coral" label="x_{n+1}" />}
            </>
          )}

          {/* DIRECTION — one Newton step as a sequenced, timed Timeline. Children
              ARE the beats and play in order when `play` changes value:
                beat 1  draw the vertical up to the curve
                beat 2  draw the tangent line
                beat 3  slide the marker down to xNext (a store-value tween)
              onDone commits the new guess, so the preview re-forms around it. */}
          <Timeline
            play={s.playToken}
            onStart={() => set({ step: "playing" })}
            onDone={() => set({ x0: xNext, xMark: xNext, step: "idle" })}
          >
            <Draw duration={0.35}>
              <Plot.Segment from={[s.x0, 0]} to={[s.x0, fx]} color="violet" dashed />
            </Draw>
            <Draw duration={0.5}>
              <Plot.Line point={[s.x0, fx]} slope={fpx} color="orange" clip={XD} />
            </Draw>
            <Animate to={{ xMark: xNext }} from={{ xMark: s.x0 }} duration={0.6} ease="cubicOut" />
          </Timeline>

          {/* The rolling marker reads the tweened store value. When idle it sits
              on the current guess (x0 and xMark are kept in sync). */}
          <Plot.Point x={s.xMark} y={0} color="blue" r={7} />

          {/* INTERACTION — drag the guess. `lockY` keeps it pinned to the x-axis;
              onMove writes both x0 and the marker so the preview snaps to it. */}
          <Plot.MovablePoint
            x={s.x0}
            y={0}
            lockY
            color="blue"
            onMove={(p) => set({ x0: p.x, xMark: p.x, running: false, history: [] })}
          />

          {/* MULTI-STEP REVEAL — the staircase, staggered. Each precomputed step
              is one <Draw> of a 2-segment path (up to the curve, down the tangent).
              `stagger` offsets each child's start; they draw-on one after another. */}
          <Timeline play={s.revealToken} stagger={0.18}>
            {trace.map(([xk, xk1], i) => (
              <Draw key={i} duration={0.6}>
                <Plot.Path
                  points={[
                    [xk, 0],
                    [xk, f(xk)],
                    [xk1, 0],
                  ]}
                  color="green"
                />
              </Draw>
            ))}
          </Timeline>
        </Plot>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button
            style={btn}
            disabled={s.step === "playing" || !isFinite(xNext)}
            onClick={() => set({ playToken: s.playToken + 1 })}
          >
            Play one step ▸
          </button>
          <button style={btn} onClick={() => set({ revealToken: s.revealToken + 1 })}>
            Reveal the staircase
          </button>
        </div>

        <Callout kind="key-idea" title="One step, in numbers">
          <Prose>{`From $x_n = ${fmt(s.x0)}$ the curve sits at $f(x_n) = ${fmt(fx)}$ and the
slope is $f'(x_n) = ${fmt(fpx)}$. The tangent meets the axis at

$$x_{n+1} = ${fmt(s.x0)} - \\frac{${fmt(fx)}}{${fmt(fpx)}} = ${fmt(xNext)}.$$

That jump of $${fmt(Math.abs(xNext - s.x0))}$ is exactly the horizontal leg of the
shaded triangle — base $= f(x_n)/f'(x_n)$, height $= f(x_n)$.`}</Prose>
        </Callout>
      </Section>

      <Section title="Let the machine iterate">
        <Prose>{`Pressing the tangent trick over and over is just a loop. **Run** it: the
stepper applies $x_{n+1}=x_n-f(x_n)/f'(x_n)$ from your current guess and lists the
iterates. Start near the root and it snaps in; start on a hump and watch it wander.`}</Prose>

        {/* EMULATION — a discrete stepper. `step` receives the LIVE store each
            tick (not a render snapshot), so the recurrence chains correctly even
            though this JSX is evaluated once. `every` sets the tick interval on
            the engine clock; `stop` halts and clears `running`. */}
        <Simulate
          running={s.running}
          every={0.45}
          step={(st) => {
            const xn = st.history.length ? st.history[st.history.length - 1] : st.x0
            const nx = newton(xn)
            return { history: [...st.history, nx] }
          }}
          stop={(st) => {
            const last = st.history[st.history.length - 1]
            return st.history.length >= 12 || !isFinite(last) || Math.abs(f(last)) < 1e-6
          }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <button style={btn} disabled={s.running} onClick={() => set({ running: true })}>
            {s.history.length ? "Keep running" : "Run from this guess"}
          </button>
          <button style={btn} onClick={() => set({ running: false })}>
            Pause
          </button>
          <button style={btn} onClick={() => set({ running: false, history: [], xMark: s.x0 })}>
            Reset
          </button>
        </div>

        {s.history.length > 0 && (
          <Callout kind={diverged ? "warning" : converged ? "tip" : "note"} title="Iterates">
            <Prose>{`Starting at $x_0 = ${fmt(s.x0)}$:

$$${["x_0=" + fmt(s.x0), ...s.history.map((x, i) => `x_{${i + 1}}=${fmt(x)}`)].join(",\\;")}.$$

${
  diverged
    ? `The slope went near-zero and the tangent flung the guess out of range — **no
convergence** from here. Nudge $x_0$ toward the root and try again.`
    : converged
      ? `The last iterate satisfies $f(x) \\approx 0$ to tolerance — **converged** to the
root near $x \\approx ${fmt(s.history[s.history.length - 1])}$. Notice how the digits
locked in: near a simple root Newton roughly **doubles** the correct digits each step.`
      : `Still moving — press **Keep running** to take more steps.`
}`}</Prose>
          </Callout>
        )}
      </Section>

      <Section title="Check your grip">
        <Exercise
          prompt={
            <Prose>{`Take one Newton step for $f(x)=x^3-2x-2$ starting from $x_0 = 2$.
Give $x_1$ (round to three decimals).`}</Prose>
          }
          // f(2)=2, f'(2)=10 → x1 = 2 - 2/10 = 1.8. CAS-checked numeric.
          answer={{ type: "numeric", value: 1.8, tolerance: 5e-4 }}
          input="number"
          solution={
            <Steps>
              <Step title="Evaluate">
                <Prose>{`$f(2) = 8 - 4 - 2 = 2$ and $f'(x)=3x^2-2$, so $f'(2)=10$.`}</Prose>
              </Step>
              <Step title="Update">
                <Prose>{`$x_1 = 2 - \\tfrac{2}{10} = 1.8$ — already close to the root near $1.769$.`}</Prose>
              </Step>
            </Steps>
          }
        >
          <Hint>Use $x_1 = x_0 - f(x_0)/f'(x_0)$.</Hint>
          <Hint>$f(2)=2$, $f'(2)=10$.</Hint>
        </Exercise>

        <Exercise
          prompt={
            <Prose>{`Newton's update is $x - f(x)/f'(x)$. For $f(x)=x^3-2x-2$, write that
update rule as a single simplified expression in $x$.`}</Prose>
          }
          // Symbolic equivalence: (2x^3 + 2)/(3x^2 - 2) also matches.
          answer={{ type: "expression", value: "x - (x^3 - 2x - 2)/(3x^2 - 2)", vars: ["x"] }}
          input="math"
          solution={
            <Prose>{`Substitute $f$ and $f'$: $x - \\dfrac{x^3-2x-2}{3x^2-2}$, which tidies to
$\\dfrac{2x^3+2}{3x^2-2}$.`}</Prose>
          }
        />

        <MultipleChoice
          prompt="Why does a guess near x ≈ 0.816 send Newton flying?"
          correct={1}
          shuffle
          solution={
            <Prose>{`At $x=\\pm\\sqrt{2/3}\\approx 0.816$ the derivative $f'(x)=3x^2-2$ is
**zero**, so the tangent is horizontal. Dividing by a near-zero slope makes the step
enormous — the tangent crosses the axis far away.`}</Prose>
          }
        >
          <Option>The function has no root there</Option>
          <Option>The tangent is nearly flat, so f'(x) ≈ 0 and the step blows up</Option>
          <Option>Newton's method only works for x &gt; 0</Option>
        </MultipleChoice>
      </Section>
    </Stage>
  )
}

const btn: React.CSSProperties = {
  padding: "6px 12px",
  border: "1px solid #c8cdd8",
  borderRadius: 6,
  background: "#f4f5f7",
  cursor: "pointer",
  font: "inherit",
}
