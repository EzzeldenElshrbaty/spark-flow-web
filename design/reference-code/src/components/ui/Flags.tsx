import { useId } from 'react'

// Round flags drawn as SVG (flag emoji don't render on Windows). Simplified for small sizes: the
// emblems are suggested, not exact.

export function EgyptFlag({ className }: { className?: string }) {
  const clip = useId()
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <clipPath id={clip}>
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="32" height="32" fill="#fff" />
        <rect width="32" height="10.67" fill="#ce1126" />
        <rect y="21.33" width="32" height="10.67" fill="#000" />
        {/* Eagle of Saladin, simplified. */}
        <path d="M16 12.2c-1.3 0-2.1.9-2.1 2v3.6l-1.6 1.1h7.4l-1.6-1.1v-3.6c0-1.1-.8-2-2.1-2z" fill="#c09300" />
      </g>
    </svg>
  )
}

export function SaudiFlag({ className }: { className?: string }) {
  const clip = useId()
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <clipPath id={clip}>
        <circle cx="16" cy="16" r="16" />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect width="32" height="32" fill="#006c35" />
        {/* The inscription, suggested by script-like strokes, and the sword below it. */}
        <path d="M8.5 13.2c1.4-1.2 2.2.4 3.4-.6m1.6.6c1-1.3 1.9.5 3-.5m1.7.5c1.1-1.2 2 .4 3.1-.6m1.6.6c.9-.9 1.5-.2 2.2-.5" stroke="#fff" strokeWidth="1.2" fill="none" strokeLinecap="round" />
        <path d="M9 19.3h13.6l1.4-.9v1.8l-1.4-.9" stroke="#fff" strokeWidth="1.1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
