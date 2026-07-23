# Bitwise Lesson SDK

The **only stable contract** in Bitwise. Everything else — lessons, the concept
graph, the learner path — is AI-improvised and disposable. This surface is not.

A lesson is a single React component the model writes on the fly. It never
imports anything: the SDK is injected as in-scope globals inside a
network-isolated sandbox. The model *composes* these primitives; it does not
invent interactivity from scratch. That is what buys flexibility without
sacrificing reliability.

```
                 ┌─────────────────────────────────────────┐
   sdk.d.ts  ───▶│ 1. Runtime      implements the surface   │
  (one source    │ 2. Prompt       documents it to Claude   │
   of truth)     │ 3. Verifier     defines allowed idents   │
                 └─────────────────────────────────────────┘
```

`sdk.d.ts` feeds all three consumers. The prompt docs and the verifier's
allow-list are **generated from it**, so they can never drift.

---

## The contract a lesson must satisfy

```tsx
// A lesson is a default-exported component. No imports — the SDK is in scope.
export default function Lesson() {
  return (
    <Section title="…">
      <Prose>{`Markdown with $inline$ and $$block$$ math.`}</Prose>
      {/* …compose SDK primitives… */}
    </Section>
  )
}

// Optional but recommended: structured metadata for the learner model.
// Curriculum is improvised, so this is how the orchestrator learns what a
// freshly-authored lesson was actually about.
export const meta: LessonMeta = {
  concept: "vertex-form-parabolas",
  prerequisites: ["parabolas", "function-transformations"],
  objectives: ["Predict how a, h, k move the vertex", "Convert to vertex form"],
}
```

Hard rules the verifier enforces on every generation:

1. **Default export is a function component.** Optional `export const meta`.
2. **No `import` / `require` / `fetch` / `eval` / DOM globals.** Only the
   injected SDK identifiers and standard JS built-ins are allowed.
3. **Computed values are never stated as prose literals.** `<Prose>` is a pure
   markdown string; put values in with template interpolation wrapped in `fmt`,
   e.g. `` `The vertex is at (${fmt(h)}, ${fmt(k)}).` ``. JS does the arithmetic,
   not the model. (This is best-effort lint + critic — see below.)
4. **Answers are declarative where possible** (see below) so the verifier can
   independently re-check them with a CAS before a learner sees the lesson.

---

## The answer model (why this exists)

The model must **never be the source of truth for correctness.** Exercises take
a typed `AnswerSpec`; the runtime grades with a CAS (mathjs / nerdamer), and the
authoring pipeline's *verify* stage re-evaluates the same spec against the
lesson plan's canonical answer. Declarative specs (`numeric`, `expression`,
`choice`, `set`, `interval`, `point`) are fully re-checkable. The `custom`
grader is an escape hatch — allowed, but flagged as higher-risk and given extra
scrutiny in the critic pass.

`expression` answers use **symbolic equivalence**, so `2`, `4/2`, and `√4` all
match, and `x^2 - 1` matches `(x-1)(x+1)`. Learners are never marked wrong for
writing the same thing a different way.

**What's guaranteed vs. best-effort.** Answer *correctness* is hard-guaranteed:
the CAS re-checks every declarative spec against the plan's canonical answer, so
a wrong grader is caught before mount. The "no prose literals" rule is *not*
statically decidable (a legitimate "half of −6 is −9" looks like a literal), so
it's enforced as a lint nudge plus the critic pass — the interpolation habit is
what actually prevents drift.

---

## Design decisions (locked)

| # | Decision | Why |
|---|----------|-----|
| 1 | Injected globals, no imports | Keeps the sandbox closed; nothing to resolve; verifier can enumerate the surface. |
| 2 | Compositional viz (`<Plot>` + child marks) | Mirrors Mafs; maximally expressive for math without a combinatorial prop API. |
| 3 | Declarative, CAS-checkable answers | Makes independent verification possible; symbolic equivalence is learner-fair. |
| 4 | State via `useLessonState` | Persistence + telemetry are automatic and invisible to the model. |
| 5 | `meta` export carries curriculum signal | Improvised lessons still feed a structured learner model. |
| 6 | SDK is versioned; lessons are ephemeral | Break the SDK freely — regenerate, never migrate. |

---

## v0 core subset

The runtime doesn't implement the whole surface at once. The **core tier** is
what v0 ships and what the first prompt documents:

> `useLessonState` · `fmt` · `math` · `Section` · `Prose` · `Callout` ·
> `Reveal` · `Hint` · `Plot` (+ `OfX`, `Point`, `MovablePoint`) · `Slider` ·
> `Toggle` · `NumberInput` · `Exercise` · `MultipleChoice` / `Option`

Everything else is **ext** — implemented when a lesson first needs it. Each
declaration in `sdk.d.ts` carries a `@tier core | ext` tag; the prompt generator
and the runtime's implemented-set both read from it. Because lessons are
ephemeral, growing the surface costs nothing downstream.

## Layout of this package

- `sdk.d.ts` — the complete typed surface. **Source of truth.**
- `examples/parabola.lesson.tsx` — a realistic lesson; also used as a few-shot
  example in the authoring prompt.

Backing libraries per category are listed in `sdk.d.ts`. Nothing here is
implemented yet — this is the contract we build the runtime against.
