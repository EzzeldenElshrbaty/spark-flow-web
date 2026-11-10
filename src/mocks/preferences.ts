import type { Api, DndSchedule, EmailDigest, NotifyLevel, Preferences } from '@/api/types'
import type { MockDb } from './db'
import { delay } from './latency'
import { keywordsSinceOf, prefsOf } from './membership'
import type { MockHub } from './realtime'
import { badRequest, clone, currentUser } from './shared'

const LEVELS: NotifyLevel[] = ['all', 'mentions', 'none']
const DIGESTS: EmailDigest[] = ['off', 'hourly', 'daily']
const MAX_KEYWORDS = 20
const MAX_KEYWORD = 40
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const validZone = (tz: unknown) => {
  if (typeof tz !== 'string' || !tz) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Keywords as kept: trimmed, empty ones dropped, each once whatever its case (spec 6.11). */
function checkKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) throw badRequest('Keywords are a list of words.')
  const out: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') throw badRequest('Keywords are a list of words.')
    const word = raw.trim()
    if (!word) continue
    if (word.length > MAX_KEYWORD) throw badRequest(`A keyword has at most ${MAX_KEYWORD} characters.`)
    if (!out.some((k) => k.toLowerCase() === word.toLowerCase())) out.push(word)
  }
  if (out.length > MAX_KEYWORDS) throw badRequest(`You can have up to ${MAX_KEYWORDS} keywords.`)
  return out
}

function checkSchedule(value: unknown): DndSchedule {
  const s = value as Partial<DndSchedule> | null
  if (!s || typeof s !== 'object' || typeof s.on !== 'boolean') throw badRequest('That schedule can’t be used.')
  if (!TIME.test(String(s.from)) || !TIME.test(String(s.to))) throw badRequest('Use times like 18:00.')
  if (s.from === s.to) throw badRequest('Pick an end time that isn’t the start time.')
  const days = Array.isArray(s.days) ? [...new Set(s.days)] : null
  if (!days || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) throw badRequest('Pick days of the week.')
  if (s.on && days.length === 0) throw badRequest('Pick at least one day.')
  if (!validZone(s.tz)) throw badRequest('That time zone isn’t known.')
  return { on: s.on, from: s.from!, to: s.to!, days: days.sort((a, b) => a - b), tz: s.tz! }
}

/**
 * When each keyword was added: a kept keyword keeps its time (written another way too), a new one starts now, so old
 * messages with a word I just added don't come back as unread mentions.
 */
function sinceFor(keywords: string[], before: Record<string, string>, now: string): Record<string, string> {
  return Object.fromEntries(keywords.map((k) => k.toLowerCase()).map((k) => [k, before[k] ?? now]))
}

/** My notification preferences (spec 6.11, §7 NotificationPref): one record per person, changed a part at a time. */
export function preferencesApi(db: MockDb, hub: MockHub): Api['preferences'] {
  return {
    async get() {
      await delay()
      const data = await db.read()
      return clone(prefsOf(data, currentUser(data).id))
    },
    async update(patch) {
      await delay()
      // Everything is checked before anything is kept.
      const next: Partial<Preferences> = {}
      if (patch.defaultLevel !== undefined) {
        if (!LEVELS.includes(patch.defaultLevel)) throw badRequest('Pick a level.')
        next.defaultLevel = patch.defaultLevel
      }
      if (patch.keywords !== undefined) next.keywords = checkKeywords(patch.keywords)
      for (const key of ['desktop', 'push', 'singleKeyShortcuts'] as const) {
        if (patch[key] === undefined) continue
        if (typeof patch[key] !== 'boolean') throw badRequest('Turn it on or off.')
        next[key] = patch[key]
      }
      if (patch.emailDigest !== undefined) {
        if (!DIGESTS.includes(patch.emailDigest)) throw badRequest('Pick how often.')
        next.emailDigest = patch.emailDigest
      }
      if (patch.dndUntil !== undefined) {
        if (patch.dndUntil !== null && (typeof patch.dndUntil !== 'string' || Number.isNaN(Date.parse(patch.dndUntil)) || !patch.dndUntil.includes('T'))) throw badRequest('Pick a time.')
        next.dndUntil = patch.dndUntil
      }
      if (patch.dndSchedule !== undefined) next.dndSchedule = checkSchedule(patch.dndSchedule)
      const { prefs, userId } = await db.update((data) => {
        const me = currentUser(data).id
        const prefs = { ...prefsOf(data, me), ...next }
        const keywordsSince = sinceFor(prefs.keywords, keywordsSinceOf(data, me), new Date().toISOString())
        data.notificationPrefs = [...data.notificationPrefs.filter((p) => p.id !== me), { id: me, ...prefs, keywordsSince }]
        return { prefs, userId: me }
      })
      hub.publish({ type: 'preferencesChanged', userId })
      return clone(prefs)
    },
  }
}
