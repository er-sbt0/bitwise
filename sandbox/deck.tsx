// A Deck presents a lesson as a sequence of full-attention SCREENS — one idea
// each — instead of one long scroll. It IS the lesson surface: a polished card
// whose body is a single screen at a time and whose footer carries the
// navigation. Screens hold the interactive figures, so navigation is EXPLICIT
// (buttons, dots, keys) rather than a whole-surface tap that would fight a
// slider or a draggable point living inside a screen.
//
// Lives in its own module so sdk.tsx stays lean; sdk.tsx imports { Deck, Screen }
// and threads both through buildScope(). Styled entirely from the design tokens.
import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { tokens } from "./stage/tokens";

// <Screen> mostly carries props the <Deck> reads (like <Step> for <Steps>). On
// its own it still renders sensibly: a heading above its one idea.
function Screen({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <h2 style={{ fontSize: tokens.type.size.lg, fontFamily: tokens.type.sans, margin: "0 0 16px", color: tokens.color.ink }}>
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

function useReducedMotion(): boolean {
  const [reduce, setReduce] = React.useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
  React.useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

function Deck({ children }: { children: React.ReactNode }) {
  const screens = React.Children.toArray(children).filter(React.isValidElement) as React.ReactElement<{
    title?: string;
    children?: React.ReactNode;
  }>[];
  const total = screens.length;

  const [index, setIndex] = React.useState(0);
  // Direction of the last move: +1 forward, -1 back. Drives the slide.
  const [dir, setDir] = React.useState(1);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Clamp if the child count shrinks under us.
  const active = Math.min(index, Math.max(0, total - 1));
  React.useEffect(() => {
    if (active !== index) setIndex(active);
  }, [active, index]);

  // Keys work immediately: focus the deck's own container on mount. The listener
  // lives on THIS container (not window), so stacked decks never fight.
  React.useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const go = React.useCallback(
    (next: number, direction: number) => {
      const clamped = Math.max(0, Math.min(total - 1, next));
      if (clamped === active) return;
      setDir(direction);
      setIndex(clamped);
    },
    [total, active],
  );

  const next = React.useCallback(() => go(active + 1, 1), [go, active]);
  const back = React.useCallback(() => go(active - 1, -1), [go, active]);

  // Guard against zero screens with a graceful empty state.
  if (total === 0) {
    return (
      <div style={{ ...frameStyle, textAlign: "center", color: tokens.color.textMuted, fontFamily: tokens.type.sans }}>
        This deck has no screens yet.
      </div>
    );
  }

  const onFirst = active === 0;
  const onLast = active === total - 1;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      back();
    }
  };

  const slideDist = 28;
  const anim = reduce
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, x: dir * slideDist },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: dir * -slideDist },
        transition: { type: "spring" as const, ...tokens.spring.snappy, opacity: { duration: 0.18 } },
      };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="group"
      aria-roledescription="deck"
      style={frameStyle}
    >
      {/* Content area — a stable min-height keeps the footer from jumping as we
          move between a short screen and a tall one. */}
      <div style={{ position: "relative", minHeight: 320, overflow: "hidden" }}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={active}
            initial={anim.initial}
            animate={anim.animate}
            exit={anim.exit}
            transition={anim.transition}
          >
            {screens[active]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer nav row: Back · progress dots + count · Continue/Done. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: tokens.space.md,
          marginTop: tokens.space.xl,
          paddingTop: tokens.space.lg,
          borderTop: `1px solid ${tokens.color.line}`,
        }}
      >
        <button
          onClick={back}
          disabled={onFirst}
          aria-label="Previous screen"
          style={{
            ...subtleBtn,
            visibility: onFirst ? "hidden" : "visible",
          }}
        >
          ← Back
        </button>

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: tokens.space.sm }}>
          <div style={{ display: "flex", gap: tokens.space.xs }}>
            {screens.map((_, i) => {
              const on = i === active;
              return (
                <button
                  key={i}
                  onClick={() => go(i, i > active ? 1 : -1)}
                  aria-label={`Go to screen ${i + 1}`}
                  aria-current={on ? "true" : undefined}
                  style={{
                    width: on ? 22 : 9,
                    height: 9,
                    padding: 0,
                    border: "none",
                    borderRadius: tokens.radius.pill,
                    cursor: "pointer",
                    background: on ? tokens.color.blue : tokens.color.lineStrong,
                    transition: "width .2s ease, background .2s ease",
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontFamily: tokens.type.mono, fontSize: tokens.type.size.sm, color: tokens.color.textMuted }}>
            {active + 1} / {total}
          </span>
        </div>

        {onLast ? (
          <button disabled aria-label="You've reached the end" style={{ ...primaryBtn, opacity: 0.45, cursor: "default" }}>
            Done
          </button>
        ) : (
          <button onClick={next} style={primaryBtn}>
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}

// ---- styles (all from tokens) ----------------------------------------------
const frameStyle: React.CSSProperties = {
  border: `1px solid ${tokens.color.line}`,
  borderRadius: tokens.radius.lg,
  padding: "24px 26px",
  margin: "24px 0",
  background: tokens.color.paper,
  boxShadow: tokens.shadow.md,
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "9px 18px",
  border: `1px solid ${tokens.color.blue}`,
  borderRadius: tokens.radius.sm,
  background: tokens.color.blue,
  color: "#fff",
  cursor: "pointer",
  fontFamily: tokens.type.sans,
  fontSize: tokens.type.size.base,
  fontWeight: 600,
};

const subtleBtn: React.CSSProperties = {
  padding: "9px 14px",
  border: "1px solid transparent",
  borderRadius: tokens.radius.sm,
  background: "transparent",
  color: tokens.color.textMuted,
  cursor: "pointer",
  fontFamily: tokens.type.sans,
  fontSize: tokens.type.size.base,
  fontWeight: 550,
};

export { Deck, Screen };
