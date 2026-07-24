/**
 * GOLDEN REFERENCE LESSON — "Bayes' theorem as 100 people, not algebra."
 *
 * The sharpest possible contrast with `newton.lesson.tsx`: that lesson is a curve
 * on axes driven by a director timeline; this one is DELIBERATELY NON-PLOT — a
 * `Scene.Grid` of 100 cells (people), recolored live by a slider, wrapped in a
 * `Deck` of one-idea screens. It is the Phase-3 kit's acceptance test and the
 * few-shot the authoring prompt will lead with for "concrete picture" lessons.
 *
 * ── PHASE-3 KIT EXERCISED HERE ──────────────────────────────────────────────
 *   Deck / Screen                 — full-attention screens, one idea each.
 *   Scene + Scene.Grid            — the centerpiece: a 10×10 grid whose per-cell
 *                                   `fill(row,col,index)` recolors (CSS-transition)
 *                                   as the base-rate slider drags.
 *   Scene.Rect + Scene.Label      — an in-canvas legend for the four categories.
 *   Custom + useMark + fadeTo(spring) — a spotlight scrim that springs in to dim
 *                                   the test-negatives so the positives pop.
 *
 * ── THE IDEA (natural frequencies) ──────────────────────────────────────────
 *   100 people. Base rate p → nSick sick. A test with sensitivity `se` and
 *   false-positive rate `fp` splits them into four integer counts over 100:
 *     TP (sick, +)  FN (sick, −)  FP (well, +)  TN (well, −).
 *   Posterior P(sick | +) = TP / (TP + FP). Rarity makes that small even for an
 *   accurate test — the whole "aha".
 *
 * House rule (unchanged): no computed number is ever a prose literal — always
 * ${fmt(...)}. Prose children is ONE markdown template string; LaTeX only via $…$.
 */

export const meta: LessonMeta = {
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
  // reads as four clean runs. `index` is 0..99, row 0 at the top.
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
        <Prose>{`About **1 in 100** people have a certain condition. There is a test for it that is
roughly **90% accurate**. You take it, and it comes back **positive**.

How likely is it that you *actually* have the condition?

Most people say "about 90%." Hold that thought. We are going to stop trusting the
percentages and **count real people** instead — and the true answer is far smaller.`}</Prose>
      </Screen>

      <Screen title="Start with 100 people">
        <Prose>{`Here are 100 people, one per cell. The condition's **base rate** — how common it is —
decides how many are actually sick (coral). Drag it and watch the sick block grow and shrink.`}</Prose>

        <Scene x={[0, 10]} y={[0, 10]} height={340}>
          <Scene.Grid rows={10} cols={10} fill={sickVsWell} gap={0.1} radius={0.12} />
        </Scene>

        {rateSlider}

        <Prose>{`At a base rate of $${fmt(s.p * 100, 0)}\\%$, that is **${fmt(c.nSick)} sick** and
**${fmt(c.nWell)} healthy** out of 100.`}</Prose>
      </Screen>

      <Screen title="Now give everyone the test">
        <Prose>{`The test is not perfect. Of the sick it **catches ${fmt(se * 100, 0)}%** (coral) and misses
the rest (violet). Of the healthy it wrongly **flags ${fmt(fp * 100, 0)}%** (orange); the rest come
back clear (grey). Four groups — still exactly 100 people.`}</Prose>

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

        <Prose>{`Counting heads: **${fmt(c.TP)} caught**, ${fmt(c.FN)} missed, **${fmt(c.FP)} false alarms**,
and ${fmt(c.TN)} cleared.`}</Prose>
      </Screen>

      <Screen title="Who actually tested positive?">
        <Prose>{`A "+" result comes from **two** groups: the truly sick who were caught (coral) and the
healthy who were falsely flagged (orange). Press the button to spotlight them — everyone who
tested *negative* dims away.`}</Prose>

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
          <Prose>{`**${fmt(c.pos)} people test positive**, but only **${fmt(c.TP)} of them are truly sick**. So

$$P(\\text{sick} \\mid +) = \\frac{${fmt(c.TP)}}{${fmt(c.TP)} + ${fmt(c.FP)}} = ${fmt(c.post * 100, 0)}\\%.$$

At a base rate of $${fmt(s.p * 100, 0)}\\%$, a positive result is **more often a false alarm than the real thing** — drag the rate up and watch that flip.`}</Prose>
        </Callout>
      </Screen>

      <Screen title="Why the paradox">
        <Callout kind="key-idea" title="Rarity beats accuracy">
          <Prose>{`When a condition is **rare**, the handful of true positives is swamped by false positives
drawn from the huge healthy majority. A ${fmt(se * 100, 0)}%-accurate test can still be wrong most
of the time it shouts "positive" — not because the test is bad, but because there are so many
more healthy people available to misflag.

The remedy is not a better test; it is to think in **natural frequencies**: out of 100 real
people, how many with a positive result are actually sick? Count, and the panic dissolves.`}</Prose>
        </Callout>
      </Screen>
    </Deck>
  )
}
