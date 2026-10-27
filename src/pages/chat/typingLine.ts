/** The line above a channel's composer saying who is typing; null when nobody is. */
export function typingLine(names: string[]): string | null {
  if (names.length === 0) return null
  if (names.length === 1) return `${names[0]} is typing…`
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`
  return 'Several people are typing…'
}
