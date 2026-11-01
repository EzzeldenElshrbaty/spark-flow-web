import { createHeadlessEditor } from '@lexical/headless'
import { $createLinkNode } from '@lexical/link'
import { $createListItemNode, $createListNode } from '@lexical/list'
import { $createParagraphNode, $createTextNode, $getRoot, $createLineBreakNode } from 'lexical'
import { describe, expect, it } from 'vitest'
import { parseBody, type Body } from '@/lib/messageBody'
import { $bodyFromEditor, $createEntityNode, $editorFromBody, COMPOSER_NODES } from './bodyEditor'

const editor = () => createHeadlessEditor({ nodes: COMPOSER_NODES, onError: (e) => { throw e } })

/** Puts a body into an editor and reads it back. */
function roundTrip(body: Body): Body {
  const ed = editor()
  ed.update(() => $editorFromBody(body), { discrete: true })
  return ed.getEditorState().read(() => $bodyFromEditor())
}

/** Builds the editor's content by hand, then reads the body. */
function read(build: () => void): Body {
  const ed = editor()
  ed.update(build, { discrete: true })
  return ed.getEditorState().read(() => $bodyFromEditor())
}

describe('body ⇄ editor (spec 6.8 composer, §7 body)', () => {
  it('round-trips every kind of block and inline', () => {
    const body = parseBody(
      '*Bold* _it_ ~gone~ `code` *_both_* @[Nour](u-2) @all #[backend](c-backend) @NEX NEX-103 https://spark-sys.com/x\nsecond line\n\n> quoted *bit*\n> more\n- one\n- *two*\n1. first\n```\nconst a = 1\n  b()\n```',
    )
    expect(roundTrip(body)).toEqual(body)
  })

  it('keeps underline, which has no markdown', () => {
    const body: Body = [{ type: 'p', children: [{ type: 'text', text: 'under', marks: ['u'] }] }]
    expect(roundTrip(body)).toEqual(body)
  })

  it('reads formatted text, line breaks, links and pills typed into the editor', () => {
    const body = read(() => {
      const p = $createParagraphNode()
      p.append($createTextNode('Hi ').toggleFormat('bold'), $createEntityNode({ type: 'user', id: 'u-2', name: 'Nour El-Sayed' }), $createTextNode(' see'))
      p.append($createLineBreakNode(), $createTextNode('NEX-1 at https://github.com/a.'))
      const link = $createLinkNode('https://figma.com/f')
      link.append($createTextNode('the file'))
      p.append($createTextNode(' and '), link)
      $getRoot().clear().append(p)
    })
    expect(body).toEqual([
      {
        type: 'p',
        children: [
          { type: 'text', text: 'Hi ', marks: ['b'] },
          { type: 'user', id: 'u-2', name: 'Nour El-Sayed' },
          { type: 'text', text: ' see\n' },
          { type: 'task', key: 'NEX-1' },
          { type: 'text', text: ' at ' },
          { type: 'link', href: 'https://github.com/a', text: 'https://github.com/a' },
          { type: 'text', text: '. and ' },
          { type: 'link', href: 'https://figma.com/f', text: 'the file' },
        ],
      },
    ])
  })

  it('code keeps task keys and addresses as text', () => {
    const body = read(() => {
      $getRoot().clear().append($createParagraphNode().append($createTextNode('NEX-1 https://x.io').toggleFormat('code')))
    })
    expect(body).toEqual([{ type: 'p', children: [{ type: 'text', text: 'NEX-1 https://x.io', marks: ['code'] }] }])
  })

  it('leaves out empty paragraphs and empty list items; an empty editor is an empty body', () => {
    const body = read(() => {
      const list = $createListNode('bullet').append($createListItemNode().append($createTextNode('a')), $createListItemNode())
      $getRoot().clear().append($createParagraphNode(), $createParagraphNode().append($createTextNode('x')), $createParagraphNode(), list)
    })
    expect(body).toEqual([{ type: 'p', children: [{ type: 'text', text: 'x' }] }, { type: 'ul', items: [[{ type: 'text', text: 'a' }]] }])
    expect(read(() => $getRoot().clear().append($createParagraphNode()))).toEqual([])
  })
})
