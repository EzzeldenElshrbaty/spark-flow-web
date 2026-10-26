import clsx from 'clsx'
import {
  AppWindow,
  Boxes,
  Briefcase,
  Clock,
  Cloud,
  CalendarDays,
  DoorOpen,
  Globe,
  Layers,
  Mail,
  MessageCircle,
  Phone,
  PhoneOutgoing,
  ShieldCheck,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { formatDate } from '../../lib/format'
import { isOpen, toggleService } from '../../lib/leadRules'
import type { Lead, LeadStatus } from '../../mocks/leads'
import { NextStepView } from '../followUps/shared'
import { useServices } from './useServices'

const statusStyle: Record<LeadStatus, { pill: string; dot: string }> = {
  New: { pill: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300', dot: 'bg-sky-500' },
  Assigned: { pill: 'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300', dot: 'bg-amber-500' },
  Contacted: { pill: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300', dot: 'bg-violet-500' },
  'Meeting held': { pill: 'bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300', dot: 'bg-teal-500' },
  Qualified: { pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300', dot: 'bg-emerald-500' },
  Disqualified: { pill: 'bg-surface-muted text-fg-tertiary', dot: 'bg-fg-subtle' },
}

/** Status as a soft pill with a coloured dot. New leads with no rep read "Unassigned". */
export function LeadStatusBadge({ lead }: { lead: Pick<Lead, 'status' | 'repId'> }) {
  const style = statusStyle[lead.status]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', style.pill)}>
      <span className={clsx('size-1.5 rounded-full', style.dot)} aria-hidden />
      {lead.status === 'New' && !lead.repId ? 'Unassigned' : lead.status}
    </span>
  )
}

// Soft colours for initials avatars, picked by a hash of the name so a person keeps the same colour.
const avatarTones = [
  'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200',
]

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .replace(/^(Dr\.|Eng\.)\s+/, '')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        avatarTones[Math.abs(hash) % avatarTones.length],
        size === 'sm' ? 'size-6 text-[10px]' : 'size-9 text-xs',
      )}
      aria-hidden
    >
      {initials}
    </span>
  )
}

const channelIcon: Record<string, LucideIcon> = {
  'Website form': Globe,
  Email: Mail,
  'Phone call': Phone,
  WhatsApp: MessageCircle,
  'Walk-in': DoorOpen,
  LinkedIn: Briefcase,
  Event: CalendarDays,
  'Cold call': PhoneOutgoing,
}

export function ChannelLabel({ channel, className }: { channel: string; className?: string }) {
  const Icon = channelIcon[channel] ?? Globe
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon className="size-3.5 shrink-0 text-fg-muted" />
      <span className="truncate">{channel}</span>
    </span>
  )
}

/** The lead's next step in lists: the step itself, "No next step", or why there isn't one. */
export function NextActionChip({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const muted = clsx('text-fg-muted', compact ? 'text-xs' : 'text-sm')
  if (!isOpen(lead)) return <span className="text-sm text-fg-subtle">—</span>
  if (!lead.repId) return <span className={muted}>Waiting for a salesperson</span>
  if (lead.followUpOn)
    return (
      <span className={clsx('inline-flex items-center gap-1', muted)}>
        <Clock className="size-3.5" /> Not now · back {formatDate(lead.followUpOn)}
      </span>
    )
  return <NextStepView step={lead.nextAction} compact={compact} />
}

// Icons for the starting services; services added in Settings use a generic icon.
const serviceIcon: Record<string, LucideIcon> = {
  'svc-website': AppWindow,
  'svc-app': Smartphone,
  'svc-system': Boxes,
  'svc-cloud': Cloud,
  'svc-ai': Sparkles,
  'svc-security': ShieldCheck,
  'svc-full': Layers,
}

/** Toggle pills for "Services interested in": active services, plus any inactive one already picked. */
export function ServicePicker({ value, onChange, invalid }: { value: string[]; onChange: (services: string[]) => void; invalid?: boolean }) {
  const services = useServices().filter((service) => service.active || value.includes(service.id))
  return (
    <div className="grid grid-cols-2 gap-2" role="group" aria-label="Services interested in" aria-invalid={invalid}>
      {services.map((service) => {
        const Icon = serviceIcon[service.id] ?? Boxes
        const selected = value.includes(service.id)
        return (
          <button
            key={service.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(toggleService(value, service.id, services))}
            title={service.coversAll ? 'Covers all services' : undefined}
            className={clsx(
              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
              selected ? 'border-brand-500 bg-accent-soft font-medium text-fg' : invalid ? 'border-red-400 text-fg-tertiary hover:bg-surface-muted' : 'border-line text-fg-tertiary hover:bg-surface-muted',
              !service.active && 'opacity-60',
            )}
          >
            <Icon className={clsx('size-4 shrink-0', selected ? 'text-accent' : 'text-fg-muted')} />
            <span className="truncate">{service.name}</span>
          </button>
        )
      })}
    </div>
  )
}

/** A lead's services as small chips; inactive services are greyed. */
export function ServiceChips({ services: ids, className }: { services: string[]; className?: string }) {
  const services = useServices()
  return (
    <span className={clsx('flex min-w-0 flex-wrap gap-1', className)}>
      {ids.map((id) => {
        const service = services.find((item) => item.id === id)
        const Icon = serviceIcon[id] ?? Boxes
        return (
          <span
            key={id}
            title={service && !service.active ? 'No longer offered' : undefined}
            className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium', service?.active === false ? 'text-fg-subtle line-through' : 'text-fg-tertiary')}
          >
            <Icon className="size-3" />
            {service?.name ?? '…'}
          </span>
        )
      })}
    </span>
  )
}
