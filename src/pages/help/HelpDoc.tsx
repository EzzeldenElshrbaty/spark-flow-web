import { ExternalLink, Lightbulb } from 'lucide-react'
import type { HelpBlock, Inline } from '@/lib/helpMarkdown'
import clsx from 'clsx'
import { Link } from 'react-router'

/** Opens another chapter (and maybe one of its sections) where the help is shown. */
export type OpenChapter = (chapter: string, section: string | null) => void

/** How links to other chapters behave: shown only when the reader may open it; a link (help centre) or a button (panel). */
type Links = { onChapter: OpenChapter; canOpen: (chapter: string) => boolean; hrefOf?: (chapter: string, section: string | null) => string }

function Line({ inline, links }: { inline: Inline[]; links: Links }) {
  return (
    <>
      {inline.map((part, i) => {
        if (part.t === 'b') return <strong key={i} className="font-semibold text-fg">{part.v}</strong>
        if (part.t === 'code') return <kbd key={i} className="rounded border border-line bg-surface-muted px-1 py-px font-sans text-[0.85em] text-fg">{part.v}</kbd>
        if (part.t === 'link') {
          const to = part.to
          if ('href' in to)
            return (
              <a key={i} href={to.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline">
                {part.v}
                <ExternalLink aria-hidden className="size-3" />
              </a>
            )
          // A chapter this reader can't open reads as plain text.
          if (!links.canOpen(to.chapter)) return <span key={i}>{part.v}</span>
          if (links.hrefOf)
            return (
              <Link key={i} to={links.hrefOf(to.chapter, to.section)} className="font-medium text-accent hover:underline">
                {part.v}
              </Link>
            )
          return (
            <button key={i} type="button" onClick={() => links.onChapter(to.chapter, to.section)} className="font-medium text-accent hover:underline">
              {part.v}
            </button>
          )
        }
        return <span key={i}>{part.v}</span>
      })}
    </>
  )
}

/**
 * A help chapter's blocks as elements (Admin and help, slice 6), under the chapter's own h2. Sections are h3s with anchors
 * for "On this page"; links go to chapters the reader may open; anything else is text. `compact` is the panel's type.
 */
export function HelpDoc({ blocks, compact = false, ...links }: { blocks: HelpBlock[]; compact?: boolean } & Links) {
  return (
    <div className={clsx('space-y-3 text-fg-secondary', compact ? 'text-sm leading-6' : 'text-[15px] leading-7')}>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'h2':
            return (
              <h3 key={i} id={block.id} className={clsx('scroll-mt-24 font-semibold text-fg', compact ? 'pt-2 text-sm' : 'pt-4 text-lg')}>
                {block.text}
              </h3>
            )
          case 'p':
            return (
              <p key={i}>
                <Line inline={block.inline} links={links} />
              </p>
            )
          case 'ul':
          case 'ol': {
            const List = block.type
            return (
              <List key={i} className={clsx('space-y-1.5 ps-5', block.type === 'ul' ? 'list-disc' : 'list-decimal')}>
                {block.items.map((item, j) => (
                  <li key={j} className="ps-1">
                    <Line inline={item} links={links} />
                  </li>
                ))}
              </List>
            )
          }
          case 'tip':
            return (
              <p key={i} className="flex gap-2.5 rounded-lg border border-line bg-surface-sunken px-3.5 py-2.5">
                <Lightbulb aria-hidden className="mt-1 size-4 shrink-0 text-accent" />
                <span>
                  <Line inline={block.inline} links={links} />
                </span>
              </p>
            )
          case 'img':
            return (
              <figure key={i} className="py-1">
                <img src={block.src} alt={block.alt} loading="lazy" className="w-full rounded-lg border border-line shadow-sm" />
                {block.caption && <figcaption className="mt-1.5 text-xs text-fg-muted">{block.caption}</figcaption>}
              </figure>
            )
        }
      })}
    </div>
  )
}
