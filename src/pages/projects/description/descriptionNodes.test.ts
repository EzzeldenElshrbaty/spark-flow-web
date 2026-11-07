import { createHeadlessEditor } from '@lexical/headless'
import { $createLinkNode } from '@lexical/link'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { describe, expect, it } from 'vitest'
import type { DescBody } from '@/lib/messageBody'
import { $descriptionFromEditor, $editorFromDescription, $insertFile, $removeFile, DESCRIPTION_NODES } from './descriptionNodes'
import type { DescFile } from './FileNode'

const editor = () => createHeadlessEditor({ nodes: DESCRIPTION_NODES, onError: (e) => { throw e } })
const a1: DescFile = { id: 'a-1', title: 'flow.pdf', name: 'flow.pdf', mimeType: 'application/pdf', size: 2048 }
const files = new Map([[a1.id, a1]])
const text = (t: string, marks?: ('b' | 'i' | 'u' | 's' | 'code')[]) => (marks ? { type: 'text' as const, text: t, marks } : { type: 'text' as const, text: t })

/** Puts a description into an editor, optionally changes it, and reads it back. */
function through(body: DescBody, change?: () => void): DescBody {
  const ed = editor()
  ed.update(() => $editorFromDescription(body, files), { discrete: true })
  if (change) ed.update(change, { discrete: true })
  return ed.getEditorState().read(() => $descriptionFromEditor())
}

describe('description ⇄ editor', () => {
  it('round-trips formatting, links, lists, quotes, code and files', () => {
    const body: DescBody = [
      { type: 'p', children: [text('b', ['b']), text(' '), text('i', ['i']), text(' '), text('u', ['u']), text(' '), text('s', ['s']), text(' '), text('c', ['code']), text(' '), { type: 'link', href: 'https://spark-sys.com/', text: 'site' }] },
      { type: 'ul', items: [[text('one')], [text('two')]] },
      { type: 'ol', items: [[text('first')]] },
      { type: 'quote', children: [{ type: 'p', children: [text('quoted')] }] },
      { type: 'code', text: 'const a = 1' },
      { type: 'file', id: 'a-1' },
      { type: 'p', children: [text('after')] },
    ]
    expect(through(body)).toEqual(body)
  })

  it('a task key stays plain text', () => {
    expect(through([{ type: 'p', children: [text('See NEX-101')] }])).toEqual([{ type: 'p', children: [text('See NEX-101')] }])
  })

  it('a bold task key stays bold text; a bold web address is a bold link, typed or made with Link', () => {
    const bold = (t: string) => $createTextNode(t).toggleFormat('bold')
    const ed = editor()
    ed.update(() => {
      const line = $createParagraphNode().append(bold('See NEX-101 at https://a.b/x'), $createTextNode(' or '), $createLinkNode('https://c.d/').append(bold('docs')))
      $getRoot().clear().append(line)
    }, { discrete: true })
    const body = ed.getEditorState().read(() => $descriptionFromEditor())
    expect(body).toEqual([{ type: 'p', children: [
      text('See NEX-101 at ', ['b']),
      { type: 'link', href: 'https://a.b/x', text: 'https://a.b/x', marks: ['b'] },
      text(' or '),
      { type: 'link', href: 'https://c.d/', text: 'docs', marks: ['b'] },
    ] }])
    // And back: the editor shows them as it had them.
    expect(through(body)).toEqual(body)
  })

  it('a link only partly bold isn’t bold', () => {
    const ed = editor()
    ed.update(() => {
      $getRoot().clear().append($createParagraphNode().append($createLinkNode('https://c.d/').append($createTextNode('do').toggleFormat('bold'), $createTextNode('cs'))))
    }, { discrete: true })
    expect(ed.getEditorState().read(() => $descriptionFromEditor())).toEqual([{ type: 'p', children: [{ type: 'link', href: 'https://c.d/', text: 'docs' }] }])
  })

  it('drops a file block whose file it doesn’t have', () => {
    expect(through([{ type: 'file', id: 'a-gone' }, { type: 'p', children: [text('x')] }])).toEqual([{ type: 'p', children: [text('x')] }])
  })

  it('inserts a file at the end when nothing is selected, and removes every copy of one', () => {
    const start: DescBody = [{ type: 'p', children: [text('x')] }]
    expect(through(start, () => $insertFile(a1))).toEqual([...start, { type: 'file', id: 'a-1' }])
    const twice: DescBody = [{ type: 'file', id: 'a-1' }, ...start, { type: 'file', id: 'a-1' }]
    expect(through(twice, () => $removeFile('a-1'))).toEqual(start)
  })

  it('reads text typed into an empty editor', () => {
    const ed = editor()
    ed.update(() => $getRoot().clear().append($createParagraphNode().append($createTextNode('typed'))), { discrete: true })
    expect(ed.getEditorState().read(() => $descriptionFromEditor())).toEqual([{ type: 'p', children: [text('typed')] }])
  })
})
