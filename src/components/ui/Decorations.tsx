/**
 * Decorations.tsx
 * Inline SVG decorative components for customer-facing screens.
 * All are purely visual — aria-hidden, pointer-events-none, position absolute.
 * Keep each under ~3 KB; use opacity 5–15% so text stays readable.
 */

// ── Plate & Cutlery line-art (GreetingView background) ────────
// A top-down dinner plate with fork left and knife right, all in
// thin strokes. Rendered large and faint behind the welcome card.
export function PlateCutlerySvg({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 320 320"
      fill="none"
      className={className}
    >
      {/* Outer plate rim */}
      <circle cx="160" cy="160" r="130" stroke="currentColor" strokeWidth="6" />
      {/* Inner plate well */}
      <circle cx="160" cy="160" r="95" stroke="currentColor" strokeWidth="3" />
      {/* Decorative inner ring */}
      <circle cx="160" cy="160" r="75" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 4" />

      {/* Fork — left side */}
      {/* Handle */}
      <rect x="48" y="90" width="8" height="90" rx="4" stroke="currentColor" strokeWidth="2.5" />
      {/* Neck */}
      <rect x="50" y="72" width="4" height="22" rx="2" stroke="currentColor" strokeWidth="1.5" />
      {/* Tines */}
      <rect x="48" y="48" width="2" height="28" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="52" y="46" width="2" height="30" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="56" y="48" width="2" height="28" rx="1" stroke="currentColor" strokeWidth="1.5" />
      {/* Tine connector */}
      <path d="M48 72 Q52 80 56 72" stroke="currentColor" strokeWidth="1.5" fill="none" />

      {/* Knife — right side */}
      {/* Handle */}
      <rect x="264" y="90" width="8" height="90" rx="4" stroke="currentColor" strokeWidth="2.5" />
      {/* Handle detail lines */}
      <line x1="266" y1="110" x2="270" y2="110" stroke="currentColor" strokeWidth="1" />
      <line x1="266" y1="120" x2="270" y2="120" stroke="currentColor" strokeWidth="1" />
      <line x1="266" y1="130" x2="270" y2="130" stroke="currentColor" strokeWidth="1" />
      {/* Neck */}
      <rect x="266" y="72" width="4" height="22" rx="1" stroke="currentColor" strokeWidth="1.5" />
      {/* Blade */}
      <path d="M266 48 L270 48 Q275 55 270 72 L266 72 Z" stroke="currentColor" strokeWidth="1.5" />

      {/* Spoon — bottom */}
      {/* Handle */}
      <rect x="156" y="272" width="8" height="60" rx="4" stroke="currentColor" strokeWidth="2" />
      {/* Bowl */}
      <ellipse cx="160" cy="266" rx="12" ry="18" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

// ── Steam wisps (GreetingView — rises from top of card) ────────
// Three gentle S-curves at different heights, staggered timing.
export function SteamWispsSvg({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 80"
      fill="none"
      className={className}
    >
      <style>{`
        @keyframes wisp {
          0%   { opacity: 0; transform: translateY(0) scaleX(1); }
          30%  { opacity: 1; }
          100% { opacity: 0; transform: translateY(-20px) scaleX(0.8); }
        }
        .w1 { animation: wisp 2.4s ease-in-out infinite; }
        .w2 { animation: wisp 2.4s ease-in-out 0.8s infinite; }
        .w3 { animation: wisp 2.4s ease-in-out 1.6s infinite; }
      `}</style>
      <path className="w1" d="M30 70 Q26 55 32 45 Q38 35 34 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <path className="w2" d="M60 75 Q55 58 62 47 Q69 36 64 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <path className="w3" d="M90 72 Q87 57 93 46 Q99 35 95 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

// ── Placemat scatter (RequestView background) ──────────────────
// Loose fork, knife, spoon, and small star/dot shapes scattered
// across a wide canvas — like motifs printed on a paper placemat.
export function PlacematScatterSvg({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 400 700"
      fill="none"
      className={className}
    >
      {/* Fork top-left */}
      <g transform="translate(40,60) rotate(-20)">
        <rect x="0" y="30" width="6" height="50" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="10" width="1.5" height="22" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="4.5" y="8" width="1.5" height="24" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M1 30 Q3.5 36 6 30" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </g>
      {/* Spoon top-right */}
      <g transform="translate(330,80) rotate(15)">
        <rect x="0" y="28" width="5" height="48" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <ellipse cx="2.5" cy="22" rx="8" ry="12" stroke="currentColor" strokeWidth="1.5"/>
      </g>
      {/* Small plate mid-left */}
      <circle cx="60" cy="260" r="28" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="60" cy="260" r="18" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3"/>
      {/* Knife mid-right */}
      <g transform="translate(350,240) rotate(10)">
        <rect x="0" y="28" width="5" height="48" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M0 10 L5 10 Q9 17 5 28 L0 28 Z" stroke="currentColor" strokeWidth="1.5"/>
      </g>
      {/* Fork lower-right */}
      <g transform="translate(340,420) rotate(-10)">
        <rect x="0" y="28" width="6" height="50" rx="3" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="1" y="8" width="1.5" height="22" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <rect x="4.5" y="6" width="1.5" height="24" rx="1" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M1 28 Q3 34 6 28" stroke="currentColor" strokeWidth="1.5" fill="none"/>
      </g>
      {/* Small cup bottom-left */}
      <g transform="translate(40,500)">
        <path d="M5 0 Q0 30 8 45 L32 45 Q40 30 35 0 Z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <path d="M32 15 Q44 15 44 28 Q44 40 32 38" stroke="currentColor" strokeWidth="1.5" fill="none"/>
        <line x1="0" y1="50" x2="40" y2="50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </g>
      {/* Scatter dots */}
      {[
        [160, 120], [240, 180], [120, 340], [280, 360],
        [80, 460], [300, 520], [180, 580], [220, 80],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="3" stroke="currentColor" strokeWidth="1.5"/>
      ))}
      {/* Star/asterisk motifs */}
      {[
        [200, 150], [100, 400], [300, 300],
      ].map(([cx, cy], i) => (
        <g key={i} transform={`translate(${cx},${cy})`}>
          <line x1="0" y1="-7" x2="0" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="-7" y1="0" x2="7" y2="0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <line x1="-5" y1="-5" x2="5" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          <line x1="5" y1="-5" x2="-5" y2="5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
        </g>
      ))}
    </svg>
  )
}

// ── Corner herb sprig (YouAreInView card corners) ──────────────
// A small leafy branch, mirrored for top-right and bottom-left.
export function CornerSprigSvg({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 80 80"
      fill="none"
      className={className}
      style={flip ? { transform: 'rotate(180deg)' } : undefined}
    >
      {/* Stem */}
      <path d="M70 10 C55 28 38 48 18 68" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      {/* Leaf 1 */}
      <path d="M70 10 C80 22 76 36 62 32 C56 20 62 10 70 10Z" fill="currentColor" fillOpacity="0.5"/>
      <line x1="70" y1="10" x2="62" y2="32" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      {/* Leaf 2 */}
      <path d="M54 28 C62 18 74 20 70 34 C60 38 52 36 54 28Z" fill="currentColor" fillOpacity="0.4"/>
      <line x1="54" y1="28" x2="70" y2="34" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      {/* Leaf 3 */}
      <path d="M40 45 C30 36 30 22 44 24 C50 36 46 48 40 45Z" fill="currentColor" fillOpacity="0.35"/>
      <line x1="40" y1="45" x2="44" y2="24" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
      {/* Leaf 4 — small trailing */}
      <path d="M26 58 C18 50 20 40 30 42 C34 52 30 60 26 58Z" fill="currentColor" fillOpacity="0.28"/>
      <line x1="26" y1="58" x2="30" y2="42" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  )
}

// ── Confetti scatter (YouAreInView) ────────────────────────────
// Tiny shapes: dots, lines, small diamonds — celebratory scatter.
export function ConfettiSvg({ className }: { className?: string }) {
  const shapes = [
    { x: 30,  y: 40,  r: 4, type: 'circle' },
    { x: 270, y: 30,  r: 3, type: 'circle' },
    { x: 55,  y: 120, r: 5, type: 'circle' },
    { x: 245, y: 110, r: 4, type: 'circle' },
    { x: 20,  y: 200, r: 3, type: 'circle' },
    { x: 280, y: 195, r: 5, type: 'circle' },
    { x: 140, y: 25,  r: 3, type: 'circle' },
    { x: 165, y: 380, r: 4, type: 'circle' },
    // diamonds
    { x: 80,  y: 70,  type: 'diamond' },
    { x: 220, y: 60,  type: 'diamond' },
    { x: 40,  y: 300, type: 'diamond' },
    { x: 260, y: 280, type: 'diamond' },
    // lines
    { x: 110, y: 50,  type: 'line' },
    { x: 190, y: 45,  type: 'line', angle: 45 },
    { x: 70,  y: 160, type: 'line', angle: -30 },
    { x: 240, y: 155, type: 'line', angle: 60 },
  ]

  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 300 400"
      fill="none"
      className={className}
    >
      {shapes.map((s, i) => {
        if (s.type === 'circle') return (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="currentColor"/>
        )
        if (s.type === 'diamond') return (
          <rect key={i} x={s.x - 5} y={s.y - 5} width="10" height="10"
            transform={`rotate(45,${s.x},${s.y})`} fill="currentColor"/>
        )
        if (s.type === 'line') return (
          <line key={i}
            x1={s.x - 8} y1={s.y} x2={s.x + 8} y2={s.y}
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            transform={`rotate(${s.angle ?? 0},${s.x},${s.y})`}/>
        )
        return null
      })}
    </svg>
  )
}

// ── Order state micro-illustrations ───────────────────────────
// Small 40×40 icons used in OrderTrackingView per order status.

export function WaitingClockSvg({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40" fill="none" className={className}>
      <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="2"/>
      <circle cx="20" cy="20" r="12" stroke="currentColor" strokeWidth="1" strokeDasharray="3 2" opacity="0.4"/>
      {/* Clock hands */}
      <line x1="20" y1="20" x2="20" y2="10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="20" y1="20" x2="27" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      <circle cx="20" cy="20" r="2" fill="currentColor"/>
      {/* Tick marks */}
      <line x1="20" y1="6" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="20" y1="32" x2="20" y2="34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="20" x2="8" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="32" y1="20" x2="34" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

export function PreparingPanSvg({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40" fill="none" className={className}>
      {/* Pan body */}
      <ellipse cx="20" cy="26" rx="14" ry="8" stroke="currentColor" strokeWidth="2"/>
      {/* Pan rim */}
      <path d="M6 26 Q6 20 20 20 Q34 20 34 26" stroke="currentColor" strokeWidth="2" fill="none"/>
      {/* Handle */}
      <path d="M34 24 L40 22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Steam wisps */}
      <path d="M14 18 Q12 13 15 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M20 17 Q18 11 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
      <path d="M26 18 Q25 13 28 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.6"/>
    </svg>
  )
}

export function ReadyBellSvg({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40" fill="none" className={className}>
      {/* Bell dome */}
      <path d="M8 28 Q8 14 20 12 Q32 14 32 28 Z" stroke="currentColor" strokeWidth="2" fill="none"/>
      {/* Bell base/rim */}
      <path d="M6 28 L34 28" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      {/* Clapper */}
      <circle cx="20" cy="32" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      {/* Hanger */}
      <line x1="20" y1="12" x2="20" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="20" cy="7" r="2" stroke="currentColor" strokeWidth="1.5"/>
      {/* Ring lines — indicating ringing */}
      <path d="M4 20 Q2 17 4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
      <path d="M36 20 Q38 17 36 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
    </svg>
  )
}

export function ServedCheckSvg({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40" fill="none" className={className}>
      {/* Plate */}
      <circle cx="20" cy="22" r="14" stroke="currentColor" strokeWidth="2"/>
      <circle cx="20" cy="22" r="9" stroke="currentColor" strokeWidth="1" opacity="0.4"/>
      {/* Cloche/cover dome */}
      <path d="M8 22 Q8 10 20 8 Q32 10 32 22" stroke="currentColor" strokeWidth="2" fill="none"/>
      {/* Cloche handle */}
      <circle cx="20" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}
