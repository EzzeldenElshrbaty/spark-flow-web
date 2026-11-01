import { describe, expect, it } from 'vitest'
import { parseChapter, slugOf } from './helpMarkdown'

// Help chapters (Admin and help, slice 6): a small Markdown, parsed into blocks the page renders as elements.

const source = `---
title: Time and cost
group: Manage
order: 2
summary: Hours and cost by project, person and week.
needs: timeCost.view
---
Where the hours go. See [My day](help:home) or [the CRM](https://crm.spark-sys.com).

## Picking a period

Choose **7**, **30** or **90** days; press \`Ctrl\` + \`K\` to search.

- By project
- By person, with [cost](help:rates#who-sees-cost)

1. Open it
2. Download the CSV

> Cost shows only to people who can see it.

![The Time and cost page](time-cost.jpg "Last 30 days, by project")

<script>alert(1)</script> stays text.
`

describe('parseChapter', () => {
  it('reads the front matter', () => {
    const chapter = parseChapter('time-cost', source)
    expect(chapter).toMatchObject({ id: 'time-cost', title: 'Time and cost', group: 'Manage', order: 2, summary: 'Hours and cost by project, person and week.', needs: 'timeCost.view' })
  })

  it('turns the body into blocks with inline bold, keys and links', () => {
    const { blocks } = parseChapter('time-cost', source)
    expect(blocks.map((b) => b.type)).toEqual(['p', 'h2', 'p', 'ul', 'ol', 'tip', 'img', 'p'])
    expect(blocks[0]).toEqual({
      type: 'p',
      inline: [
        { t: 'text', v: 'Where the hours go. See ' },
        { t: 'link', v: 'My day', to: { chapter: 'home', section: null } },
        { t: 'text', v: ' or ' },
        { t: 'link', v: 'the CRM', to: { href: 'https://crm.spark-sys.com' } },
        { t: 'text', v: '.' },
      ],
    })
    expect(blocks[1]).toEqual({ type: 'h2', text: 'Picking a period', id: 'picking-a-period' })
    expect(blocks[2]).toMatchObject({ inline: [{ t: 'text', v: 'Choose ' }, { t: 'b', v: '7' }, { t: 'text', v: ', ' }, { t: 'b', v: '30' }, { t: 'text', v: ' or ' }, { t: 'b', v: '90' }, { t: 'text', v: ' days; press ' }, { t: 'code', v: 'Ctrl' }, { t: 'text', v: ' + ' }, { t: 'code', v: 'K' }, { t: 'text', v: ' to search.' }] })
    expect(blocks[3]).toMatchObject({ type: 'ul', items: [[{ t: 'text', v: 'By project' }], [{ t: 'text', v: 'By person, with ' }, { t: 'link', v: 'cost', to: { chapter: 'rates', section: 'who-sees-cost' } }]] })
    expect(blocks[4]).toMatchObject({ type: 'ol', items: [[{ t: 'text', v: 'Open it' }], [{ t: 'text', v: 'Download the CSV' }]] })
    expect(blocks[5]).toEqual({ type: 'tip', inline: [{ t: 'text', v: 'Cost shows only to people who can see it.' }] })
    expect(blocks[6]).toEqual({ type: 'img', src: '/help/time-cost.jpg', alt: 'The Time and cost page', caption: 'Last 30 days, by project' })
    expect(blocks[7]).toEqual({ type: 'p', inline: [{ t: 'text', v: '<script>alert(1)</script> stays text.' }] })
  })

  it('keeps the plain text for search', () => {
    const { text } = parseChapter('time-cost', source)
    expect(text).toContain('Picking a period Choose 7, 30 or 90 days')
    expect(text).not.toContain('**')
  })

  it('a link to anything but a chapter or https stays text; an image outside /help is dropped', () => {
    const { blocks } = parseChapter('x', '---\ntitle: X\ngroup: Work\norder: 1\nsummary: X\n---\n[bad](javascript:alert(1)) and [plain](http://a.b)\n\n![x](https://evil.example/x.png)\n')
    expect(blocks).toEqual([{ type: 'p', inline: [{ t: 'text', v: '[bad](javascript:alert(1)) and [plain](http://a.b)' }] }])
  })

  it('refuses a chapter without its front matter, or a group that isn’t one', () => {
    expect(() => parseChapter('x', 'No front matter')).toThrow('Help chapter x: front matter needs title, group, order and summary.')
    expect(() => parseChapter('x', '---\ntitle: X\ngroup: Sales\norder: 1\nsummary: X\n---\n')).toThrow('Help chapter x: group must be one of Getting started, Work, Chat, Manage, Settings.')
  })

  it('Windows line ends, a list item that wraps, and an order that isn’t a number', () => {
    const { blocks } = parseChapter('x', '---\r\ntitle: X\r\ngroup: Work\r\norder: 1\r\nsummary: X\r\n---\r\n- One that\r\n  wraps here\r\n- Two\r\n')
    expect(blocks).toEqual([{ type: 'ul', items: [[{ t: 'text', v: 'One that wraps here' }], [{ t: 'text', v: 'Two' }]] }])
    expect(() => parseChapter('x', '---\ntitle: X\ngroup: Work\norder: first\nsummary: X\n---\n')).toThrow('Help chapter x: order must be a number.')
  })

  it('slugs a heading for its anchor', () => {
    expect(slugOf('Who sees cost?')).toBe('who-sees-cost')
    expect(slugOf('  Time & cost: the basics ')).toBe('time-cost-the-basics')
  })
})
