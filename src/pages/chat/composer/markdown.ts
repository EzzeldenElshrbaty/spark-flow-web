import { CODE, INLINE_CODE, ORDERED_LIST, QUOTE, UNORDERED_LIST, type TextFormatTransformer, type Transformer } from '@lexical/markdown'

// Slack-style single markers (spec 6.8 autoformat), not markdown's ** and ~~.
const BOLD: TextFormatTransformer = { format: ['bold'], tag: '*', type: 'text-format' }
const ITALIC: TextFormatTransformer = { format: ['italic'], tag: '_', intraword: false, type: 'text-format' }
const STRIKE: TextFormatTransformer = { format: ['strikethrough'], tag: '~', type: 'text-format' }

/** What the composer turns into formatting as you type: `*bold*`, `_italic_`, `~strike~`, `` `code` ``, ```` ``` ````, `> `, `- `, `1. `. */
export const COMPOSER_TRANSFORMERS: Transformer[] = [CODE, QUOTE, UNORDERED_LIST, ORDERED_LIST, INLINE_CODE, BOLD, ITALIC, STRIKE]
