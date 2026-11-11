import { IconCheck } from '@tabler/icons-react'
import clsx from 'clsx'
import { useId, type ReactNode } from 'react'
import { Icon } from '@/components/sf/Icon'
import { inlineText } from '@/lib/messageBody'
import type { PageBlock, PageBody } from '@/lib/pageBody'
import { Blocks, Inlines, type BodyContext } from '@/pages/chat/MessageBody'

/** A page heading's level under the screen's h1 (the channel's name): Heading 1 is an h2, and so on. */
const HEADINGS = { h1: ['h2', 'sf-title'], h2: ['h3', 'sf-heading'], h3: ['h4', 'sf-body-strong'] } as const

/** A checklist item, read-only: the box says its state to screen readers and is named by its text. */
function CheckItem({ checked, children }: { checked: boolean; children: ReactNode }) {
  const id = useId()
  return (
    <li dir="auto" className="flex items-start gap-2">
      <span
        role="checkbox"
        aria-checked={checked}
        aria-readonly
        aria-labelledby={id}
        className={clsx(
          'mt-0.5 inline-grid size-4 flex-none place-items-center rounded-sf-sm border text-sf-on-accent',
          checked ? 'border-sf-accent-fill bg-sf-accent-fill' : 'border-sf-line-strong bg-sf-surface',
        )}
      >
        {checked && <Icon icon={IconCheck} size={14} />}
      </span>
      <span id={id} className={clsx(checked && 'text-sf-text-secondary line-through')}>
        {children}
      </span>
    </li>
  )
}

function PageBlockView({ block, ctx }: { block: PageBlock; ctx: BodyContext }) {
  switch (block.type) {
    case 'h1':
    case 'h2':
    case 'h3': {
      const [Tag, type] = HEADINGS[block.type]
      return (
        <Tag dir="auto" className={clsx(type, 'mt-4 text-sf-text first:mt-0')}>
          <Inlines nodes={block.children} ctx={ctx} />
        </Tag>
      )
    }
    case 'check':
      return (
        <ul className="my-1 space-y-1">
          {block.items.map((item, i) => (
            <CheckItem key={i} checked={item.checked}>
              <Inlines nodes={item.children} ctx={ctx} />
            </CheckItem>
          ))}
        </ul>
      )
    case 'table': {
      const [head, ...rows] = block.rows
      // A Tab stop, so a wide table scrolls from the keyboard too (polish pass); a group named by its header row, or
      // plain "Table", never a landmark (final review).
      const named = head!.map(inlineText).filter((text) => text.trim() !== '')
      return (
        <div role="group" aria-label={named.length > 0 ? `Table: ${named.join(', ')}` : 'Table'} tabIndex={0} className="sf-focus my-2 overflow-x-auto rounded-sf-sm">
          <table className="border-collapse">
            <thead>
              <tr>
                {head!.map((cell, i) => (
                  <th key={i} scope="col" dir="auto" className="sf-body-strong h-8 min-w-16 border border-sf-line bg-sf-surface-sunken px-2 py-1 text-start align-top whitespace-pre-wrap">
                    <Inlines nodes={cell} ctx={ctx} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} dir="auto" className="h-8 min-w-16 border border-sf-line px-2 py-1 align-top whitespace-pre-wrap">
                      <Inlines nodes={cell} ctx={ctx} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }
    default:
      return <Blocks blocks={[block]} ctx={ctx} />
  }
}

/**
 * A channel's page, read-only (chat spec 6.14, the spec's §6.6 "PageView"): elements, never HTML, with chat's chips;
 * headings sit under the channel's h1.
 */
export function PageReader({ body, ctx }: { body: PageBody; ctx: BodyContext }) {
  return (
    <div className="sf-body mx-auto max-w-[760px] space-y-1 break-words text-sf-text [overflow-wrap:anywhere]">
      {body.map((block, i) => (
        <PageBlockView key={i} block={block} ctx={ctx} />
      ))}
    </div>
  )
}
