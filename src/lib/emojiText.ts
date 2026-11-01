const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u

/** A string's user-perceived characters: 👍🏽 and 🇪🇬 are one each. */
export const graphemes = (text: string): string[] => [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment)

/** Whether one character is an emoji (not a digit or #, which Unicode also lists as emoji). */
export const isEmojiGrapheme = (g: string): boolean => PICTOGRAPH.test(g)

// What an emoji is made of: pictographs and flag letters, joined (ZWJ) and modified (skin tones, VS16, the tag
// letters of flags like England's). Combining marks are not: they stretch one "character" without limit.
const EMOJI_PARTS = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u{FE0F}|\u{200D}|[\u{E0020}-\u{E007F}])+$/u
/** The longest emoji, in code points (families and tag flags are 7). */
const MAX_EMOJI_CODE_POINTS = 16

/** Whether text is exactly one emoji: what a reaction must be (spec 6.6). */
export function isOneEmoji(text: string): boolean {
  if ([...text].length > MAX_EMOJI_CODE_POINTS || !EMOJI_PARTS.test(text)) return false
  const all = graphemes(text)
  return all.length === 1 && isEmojiGrapheme(all[0])
}
