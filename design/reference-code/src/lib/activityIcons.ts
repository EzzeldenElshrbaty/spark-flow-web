import { Calendar, Mail, MapPin, MessageCircle, Monitor, Phone, Users, Video, type LucideIcon } from 'lucide-react'
import type { ActivityColorName, ActivityIconName, ActivityTypeDef } from '../mocks/activitySettings'

export const activityIcons: Record<ActivityIconName, LucideIcon> = {
  phone: Phone,
  message: MessageCircle,
  mail: Mail,
  video: Video,
  'map-pin': MapPin,
  users: Users,
  calendar: Calendar,
  monitor: Monitor,
}

/** The icon for an activity type id, falling back to a calendar for unknown or removed types. */
export const iconForType = (typeId: string | undefined, types: ActivityTypeDef[]): LucideIcon => {
  const type = types.find((item) => item.id === typeId)
  return type ? activityIcons[type.icon] : Calendar
}

/** Pill classes per type color: a soft fill, readable text and a thin ring, in light and dark. */
export const activityColors: Record<ActivityColorName, { pill: string; dot: string }> = {
  blue: { pill: 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30', dot: 'bg-blue-500' },
  green: { pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30', dot: 'bg-emerald-500' },
  violet: { pill: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30', dot: 'bg-violet-500' },
  pink: { pill: 'bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/30', dot: 'bg-pink-500' },
  cyan: { pill: 'bg-cyan-50 text-cyan-800 ring-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:ring-cyan-500/30', dot: 'bg-cyan-500' },
  lime: { pill: 'bg-lime-50 text-lime-800 ring-lime-200 dark:bg-lime-500/15 dark:text-lime-300 dark:ring-lime-500/30', dot: 'bg-lime-500' },
  indigo: { pill: 'bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30', dot: 'bg-indigo-500' },
  slate: { pill: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-500/20 dark:text-slate-300 dark:ring-slate-500/30', dot: 'bg-slate-500' },
}

/** The color for an activity type id; unknown or removed types are grey. */
export const colorForType = (typeId: string | undefined, types: ActivityTypeDef[]) => activityColors[types.find((item) => item.id === typeId)?.color ?? 'slate']
