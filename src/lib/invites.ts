// Email invites from Add people (spec 6.10, §7 Invitation): what counts as an email, and what the window says about
// them. The mock refuses with the same sentences.

/** At most this many emails in one Add people. */
export const MAX_INVITES = 20

// Letters, digits and . _ % + ' - before the @; a domain of letters, digits and hyphens, with a dot and no empty parts.
// Punctuation a paste brings along (a ";" after the address, "<…>" around it) isn't part of an address.
const EMAIL = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i

/** An email as it's stored and compared: trimmed and lowercased. */
export const normalEmail = (text: string) => text.trim().toLowerCase()

export const isEmail = (text: string) => EMAIL.test(text)

export const notAnEmailLine = (text: string) => `${text} isn’t an email address.`

/** A pasted list of addresses: split on commas and semicolons, and on spaces between addresses; blanks dropped. */
export function splitAddresses(text: string): string[] {
  return text
    .split(/[,;]/)
    .flatMap((part) => (part.includes('@') ? part.trim().split(/\s+/) : [part.trim()]))
    .filter(Boolean)
}

/** The helper text under Add people's email chips, or nothing when there are none. */
export function inviteHelp(emails: string[], channelName: string): string | undefined {
  if (emails.length === 0) return undefined
  if (emails.length === 1) return `${emails[0]} isn’t in Spark Systems yet. They’ll get an email invite as a guest who can see #${channelName} only.`
  return `${emails.length} people aren’t in Spark Systems yet. They’ll get email invites as guests who can see #${channelName} only.`
}
