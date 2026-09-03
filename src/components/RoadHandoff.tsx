/** Decorative, synchronized handover scene; no timers or external assets. */
export function RoadHandoff() {
  return <div className="road-handoff mx-auto mt-5 max-w-5xl overflow-hidden" aria-hidden="true">
    <svg viewBox="0 0 900 110" className="block w-full" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 84H880" stroke="currentColor" strokeOpacity=".2" strokeWidth="2" strokeDasharray="8 8" />
      <g className="handoff-car" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round">
        <path d="M-54 6L-46-9H-26L-11-26H19L36-8L53-3V12H-54Z" fill="var(--handoff-car-fill)" />
        <path d="M-20-9L-8-22H16L29-9Z" fill="var(--handoff-window-fill)" />
        <path d="M5-22V-9M-4-2H3M44 2H51" />
        <circle cx="-33" cy="13" r="9" fill="var(--handoff-wheel-fill)" /><circle cx="33" cy="13" r="9" fill="var(--handoff-wheel-fill)" />
        <circle cx="-33" cy="13" r="3" fill="currentColor" /><circle cx="33" cy="13" r="3" fill="currentColor" />
        <path className="handoff-door" d="M-19-7L-19 10L9 19V-2Z" fill="var(--handoff-car-fill)" />
      </g>
      <g className="handoff-driver" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <circle cy="-30" r="6" fill="var(--handoff-person-fill)" />
        <path d="M0-22V0M0 0L-7 17M0 0L7 17M0-15L-9-5" />
        <path className="handoff-driver-arm" d="M0-15L13-9L21-9" />
      </g>
      <g className="handoff-recipient" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <circle cy="-30" r="6" fill="var(--handoff-person-fill)" />
        <path d="M0-22V0M0 0L-7 17M0 0L7 17M0-15L9-5" />
        <path d="M0-15L-12-9L-20-9" />
      </g>
      <g className="handoff-key" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round">
        <circle r="4" fill="#fef3c7" /><path d="M4 0H15M11 0V4M15 0V3" />
      </g>
    </svg>
  </div>;
}
