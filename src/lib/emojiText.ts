const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** A string's user-perceived characters: 👍🏽 and 🇪🇬 are one each. */
export const graphemes = (text: string): string[] => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)

/** Whether one character is an emoji (not a digit or #, which Unicode also lists as emoji). */
export const isEmojiGrapheme = (g: string): boolean => PICTOGRAPH.test(g)

/** Whether text is exactly one emoji: what a reaction must be (spec 6.6). */
export function isOneEmoji(text: string): boolean {
  const all = graphemes(text)
  return all.length === 1 && isEmojiGrapheme(all[0])
}
