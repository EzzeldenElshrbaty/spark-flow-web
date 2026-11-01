import { HELP_GROUPS, parseChapter, type HelpChapter } from '@/lib/helpMarkdown'

// The help chapters (Admin and help, slice 6): every `src/help/*.md`, parsed once, in the sidebar's group order and
// each group's own order. Pages load this chunk only when help is first opened (`lib/useHelp.ts`).

const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const chapters: HelpChapter[] = Object.entries(files)
  .map(([path, source]) => parseChapter(path.slice(2, -3), source))
  .sort((a, b) => HELP_GROUPS.indexOf(a.group) - HELP_GROUPS.indexOf(b.group) || a.order - b.order)
