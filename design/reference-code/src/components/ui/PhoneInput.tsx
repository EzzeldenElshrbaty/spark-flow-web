import clsx from 'clsx'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { dialPlan, dialPlans, planOf } from '../../lib/phone'

/**
 * A phone number with its country code in a list beside it. The code starts as the market's (or the
 * saved number's) and can be changed. `value` is the full number, e.g. "+966 50 123 4567", or "" when empty.
 */
export function PhoneInput({
  value,
  onChange,
  marketId,
  onBlur,
  invalid,
}: {
  value: string
  onChange: (value: string) => void
  marketId: string
  onBlur?: () => void
  invalid?: boolean
}) {
  const plans = dialPlans()
  const [planId, setPlanId] = useState(() => (planOf(value) ?? dialPlan(marketId)).id)
  // An empty number follows the form's market when that changes.
  const [lastMarket, setLastMarket] = useState(marketId)
  if (lastMarket !== marketId) {
    setLastMarket(marketId)
    if (!value.trim()) setPlanId(dialPlan(marketId).id)
  }
  const plan = plans.find((item) => item.id === planId) ?? dialPlan(marketId)
  // What's shown after the code: the saved number without its code.
  const local = value.startsWith(plan.code) ? value.slice(plan.code.length).trimStart() : value
  const join = (code: string, number: string) => (number.trim() ? (/^(\+|00)/.test(number.trim()) ? number : `${code} ${number}`) : '')

  return (
    <span className={clsx('flex rounded-lg border bg-surface focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-accent-soft', invalid ? 'border-red-500' : 'border-line')}>
      <span className="relative flex shrink-0 items-center gap-1 border-r border-line pl-3 pr-2 text-sm text-fg-secondary">
        {plan.code}
        <ChevronDown className="size-3.5 text-fg-muted" />
        <select
          className="absolute inset-0 cursor-pointer opacity-0"
          value={plan.id}
          aria-label="Country code"
          onChange={(event) => {
            const next = plans.find((item) => item.id === event.target.value) ?? plan
            setPlanId(next.id)
            onChange(join(next.code, local))
          }}
        >
          {plans.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name} ({item.code})
            </option>
          ))}
        </select>
      </span>
      <input
        className="w-full min-w-0 flex-1 rounded-r-lg bg-transparent px-3 py-2 text-sm text-fg placeholder:text-fg-subtle focus:outline-none"
        type="tel"
        inputMode="tel"
        value={local}
        onChange={(event) => {
          const typed = event.target.value
          // A number pasted or typed with + or 00 brings its own country.
          const own = /^(\+|00)/.test(typed.trim()) ? planOf(typed) : null
          if (own) setPlanId(own.id)
          onChange(join(plan.code, typed))
        }}
        onBlur={onBlur}
        aria-invalid={invalid}
        placeholder={plan.example}
      />
    </span>
  )
}
