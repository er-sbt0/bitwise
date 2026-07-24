// The one source of design tokens for the creative runtime.
//
// Every figure has to read as one system — a `Plot.*` primitive and a scene-kit
// panel that pick their blue independently drift apart the moment either is
// tweaked. So the raw values live here, in a single engine-owned module, and
// both the scene layer (`scene.tsx`, the `Plot.*` marks) and the SDK primitives
// (`sdk.tsx`'s shared styles) consume them. Change craft in one place, the whole
// runtime inherits it.
//
// This is INTERNAL engine plumbing: it is deliberately NOT threaded through
// `buildScope()`, so lesson authors never touch it. Values are frozen verbatim
// from what the code already shipped — this module reorganises the constants, it
// does not restyle anything.
//
// Plain TS, zero imports: it has to be safe to pull into both scene.tsx and
// sdk.tsx without dragging a dependency into the sandbox bundle.

export const tokens = {
  // Six named brand hues (the figure palette) plus the neutrals the chrome is
  // built from. Kept as the exact hex the code shipped so nothing regresses.
  color: {
    // brand
    blue: "#2f6df0",
    coral: "#e0554d",
    green: "#2ca05a",
    violet: "#7b5bd6",
    orange: "#e08a2f",
    ink: "#14171d",
    // neutrals
    text: "#16191f", // default body / control text
    textMuted: "#8a93a3", // secondary labels, the "note" callout bar
    paper: "#fcfdff", // raised surface (cards) — a hair off pure white
    surface: "#f7f8fb", // recessed fill (button gradient foot)
    line: "#e4e7ee", // hairline border (cards)
    lineStrong: "#ccd3e0", // interactive border (buttons, inputs)
    lineSoft: "#e3e6ec", // faint rule (the Steps connector)
  },

  // Spacing scale in px. The 12/16/20/32 rhythm the SDK already lays out on.
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },

  // Corner radii in px. sm/md match the existing 8 (controls) / 12 (cards) usage.
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },

  type: {
    // The system stack the SDK already renders in, and a mono for symbol labels.
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: "ui-monospace, monospace",
    // A small size scale (rem) spanning the SDK's eyebrow → heading range.
    size: {
      xs: "0.72rem",
      sm: "0.8rem",
      base: "0.95rem",
      md: "1rem",
      lg: "1.4rem",
    },
  },

  // SVG stroke weights in px. base is the standard mark weight, thick the
  // emphasised segment, thin a hairline.
  stroke: { thin: 1.5, base: 2.5, thick: 3 },

  shadow: {
    sm: "0 1px 2px rgba(20, 23, 29, 0.06)",
    md: "0 4px 16px rgba(20, 23, 29, 0.1)",
  },

  // Named Motion spring presets, as plain objects to spread into Motion's
  // `animate(..., { type: "spring", ...preset })`. Used by the director later.
  spring: {
    gentle: { stiffness: 170, damping: 26 },
    snappy: { stiffness: 320, damping: 30 },
    bouncy: { stiffness: 260, damping: 14 },
  },

  // Eased-tween durations in SECONDS. base is the director's DEFAULT_DURATION.
  duration: { fast: 0.3, base: 0.6, slow: 0.9 },
} as const;
