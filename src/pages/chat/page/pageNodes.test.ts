import { createHeadlessEditor } from '@lexical/headless'
import { $createListItemNode, $createListNode } from '@lexical/list'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { $createTableCellNode, $createTableNode, $createTableRowNode, TableCellHeaderStates } from '@lexical/table'
import { $createParagraphNode, $createTextNode, $getRoot } from 'lexical'
import { describe, expect, it } from 'vitest'
import type { Inline } from '@/lib/messageBody'
import type { PageBody } from '@/lib/pageBody'
import { $editorFromPage, $pageFromEditor, PAGE_NODES, PAGE_TRANSFORMERS } from './pageNodes'

const editor = () => createHeadlessEditor({ nodes: PAGE_NODES, onError: (e) => { throw e } })
const t = (text: string): Inline[] => [{ type: 'text', text }]

function roundTrip(body: PageBody): PageBody {
  const ed = editor()
  ed.update(() => $editorFromPage(body), { discrete: true })
  return ed.getEditorState().read(() => $pageFromEditor())
}

function read(build: () => void): PageBody {
  const ed = editor()
  ed.update(build, { discrete: true })
  return ed.getEditorState().read(() => $pageFromEditor())
}

describe('page ⇄ editor (chat spec 6.14)', () => {
  it('every page block survives the editor', () => {
    const body: PageBody = [
      { type: 'p', children: [{ type: 'text', text: 'Hello ' }, { type: 'user', id: 'u-2', name: 'Nour El-Sayed' }] },
      { type: 'quote', children: [{ type: 'p', children: t('Quoted') }] },
      { type: 'ul', items: [t('One'), t('Two')] },
      { type: 'ol', items: [t('First')] },
      { type: 'code', text: 'npm test' },
      { type: 'h1', children: t('Plan') },
      { type: 'h2', children: t('Goals') },
      { type: 'h3', children: [{ type: 'text', text: 'Notes', marks: ['b'] }] },
      { type: 'check', items: [{ checked: true, children: t('Ship it') }, { checked: false, children: t('Tell people') }] },
      { type: 'table', rows: [[t('A'), t('B')], [t('C'), [{ type: 'task', key: 'NEX-1' }]]] },
    ]
    expect(roundTrip(body)).toEqual(body)
  })

  it('a check item keeps its state', () => {
    const body = read(() => {
      $getRoot().append($createListNode('check').append($createListItemNode(true).append($createTextNode('Done')), $createListItemNode(false).append($createTextNode('Not yet'))))
    })
    expect(body).toEqual([{ type: 'check', items: [{ checked: true, children: t('Done') }, { checked: false, children: t('Not yet') }] }])
  })

  it('a table cell with two paragraphs becomes one cell with a line break', () => {
    const body = read(() => {
      const cell = $createTableCellNode(TableCellHeaderStates.ROW).append($createParagraphNode().append($createTextNode('A')), $createParagraphNode().append($createTextNode('B')))
      $getRoot().append($createTableNode().append($createTableRowNode().append(cell)))
    })
    expect(body).toEqual([{ type: 'table', rows: [[t('A\nB')]] }])
  })

  it('an empty cell stays a cell; empty paragraphs and items are left out', () => {
    const body = read(() => {
      const row = $createTableRowNode().append($createTableCellNode().append($createParagraphNode()), $createTableCellNode().append($createParagraphNode().append($createTextNode('x'))))
      $getRoot().append($createParagraphNode(), $createTableNode().append(row), $createListNode('check').append($createListItemNode(false)))
    })
    expect(body).toEqual([{ type: 'table', rows: [[[], t('x')]] }])
  })

  it('markdown shortcuts make headings and checklists', () => {
    const body = read(() => $convertFromMarkdownString('## Plan\n- [x] Ship', PAGE_TRANSFORMERS))
    expect(body).toEqual([{ type: 'h2', children: t('Plan') }, { type: 'check', items: [{ checked: true, children: t('Ship') }] }])
  })
})
