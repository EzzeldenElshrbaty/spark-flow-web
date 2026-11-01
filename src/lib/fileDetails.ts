// A chat file's details (spec 6.9 Edit file details) and how many a message carries. The mock refuses with the same
// sentences.

/** At most this many files in one message or reply. */
export const MAX_MESSAGE_FILES = 10
export const MAX_FILE_TITLE = 250
export const MAX_FILE_DESCRIPTION = 1000

export function fileTitleError(text: string): string | undefined {
  const title = text.trim()
  if (!title) return 'Give the file a name.'
  if (title.length > MAX_FILE_TITLE) return `Keep the name under ${MAX_FILE_TITLE} characters.`
}

export function fileDescriptionError(text: string): string | undefined {
  if (text.trim().length > MAX_FILE_DESCRIPTION) return 'Keep the description under 1,000 characters.'
}
