/** Share of a target as a ring (0–100; over 100 shows a full ring). */
export function ProgressRing({ value, size = 44, label }: { value: number; size?: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={label} className="-rotate-90 shrink-0">
      <circle cx={22} cy={22} r={18} fill="none" strokeWidth={5} className="stroke-surface-muted" />
      {clamped > 0 && (
        <circle
          cx={22}
          cy={22}
          r={18}
          fill="none"
          strokeWidth={5}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${clamped} 100`}
          stroke="var(--chart-primary)"
          className="motion-safe:animate-ring"
        />
      )}
    </svg>
  )
}
