import clsx from 'clsx'
import { Check, Globe } from 'lucide-react'
import { useRef, useState } from 'react'
import { EgyptFlag, SaudiFlag } from '../components/ui/Flags'
import { MenuPanel } from '../components/ui/Menu'
import { roundButtonClass, roundButtonFill } from '../components/ui/styles'
import type { MarketScope } from '../mocks/api'
import { useMarket } from '../lib/useMarket'
import { markets } from '../mocks/data'

/** The round icon for a market: its flag, or a globe for all markets. */
export function MarketIcon({ scope, className }: { scope: MarketScope; className?: string }) {
  if (scope === 'eg') return <EgyptFlag className={className} />
  if (scope === 'sa') return <SaudiFlag className={className} />
  if (scope === 'all') return <Globe className={clsx(className, 'text-fg-tertiary')} />
  // Markets added in Settings have no flag drawing: show their code instead.
  const code = markets.find((market) => market.id === scope)?.code ?? scope.toUpperCase()
  return (
    <span className={clsx(className, 'inline-flex items-center justify-center rounded-full bg-surface-muted text-[9px] font-semibold tracking-tight text-fg-secondary')} aria-hidden>
      {code}
    </span>
  )
}

/**
 * Round market button in the top bar. Users with one market just see its flag; others open a menu
 * limited to their markets (Management also gets All markets).
 */
export function MarketSwitcher() {
  const { scope, market, allowedMarkets, canSeeAll, locked, setScope } = useMarket()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const name = market?.name ?? 'All markets'

  if (locked) {
    return (
      <span className={clsx(roundButtonClass, 'bg-surface hover:ring-line')} title={name} aria-label={`Market: ${name}`} role="img">
        <MarketIcon scope={scope} className="size-6" />
      </span>
    )
  }

  const options: { scope: MarketScope; name: string }[] = [
    ...(canSeeAll ? [{ scope: 'all', name: 'All markets' }] : []),
    ...allowedMarkets.map((item) => ({ scope: item.id, name: item.name })),
  ]

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Market: ${name}`}
        title={`Market: ${name}`}
        className={clsx(roundButtonClass, roundButtonFill)}
      >
        <MarketIcon scope={scope} className="size-6" />
      </button>
      <MenuPanel open={open} onClose={() => setOpen(false)} triggerRef={triggerRef} label="Market" className="p-1.5 sm:w-56">
        <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">Market</p>
        {options.map((option) => (
          <button
            key={option.scope}
            type="button"
            role="menuitemradio"
            aria-checked={scope === option.scope}
            onClick={() => {
              setScope(option.scope)
              setOpen(false)
              triggerRef.current?.focus()
            }}
            className={clsx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted', scope === option.scope ? 'font-medium text-fg' : 'text-fg-secondary')}
          >
            <MarketIcon scope={option.scope} className="size-5 shrink-0" />
            <span className="flex-1">{option.name}</span>
            {scope === option.scope && <Check className="size-4 text-accent" />}
          </button>
        ))}
      </MenuPanel>
    </div>
  )
}
