// Email invites from Add people (spec 6.10, §7 Invitation): what counts as an email, and what the window says about
// them. The mock refuses with the same sentences.

/** At most this many emails in one Add people. */
export const MAX_INVITES = 20

// One @, nothing blank around it, no spaces, and a domain with a dot and no empty parts.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/** An email as it's stored and compared: trimmed and lowercased. */
export const normalEmail = (text: string) => text.trim().toLowerCase()

export const isEmail = (text: string) => EMAIL.test(text)

export const notAnEmailLine = (text: string) => `${text} isn't an email address.`

/** The helper text under Add people's email chips, or nothing when there are none. */
export function inviteHelp(emails: string[], channelName: string): string | undefined {
  if (emails.length === 0) return undefined
  if (emails.length === 1) return `${emails[0]} isn't in Spark Systems yet. They'll get an email invite as a guest who can see #${channelName} only.`
  return `${emails.length} people aren't in Spark Systems yet. They'll get email invites as guests who can see #${channelName} only.`
}
