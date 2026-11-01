// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { chapters } from '@/help'
import { projectTabs } from '@/lib/paths'
import { workspacePages } from '@/router'
import { existsSync } from 'node:fs'
import { NO_HELP, PAGE_HELP, pageHelpFor } from './pageHelp'
import { NEEDS_TEXT } from './useHelp'

// Help for each page (Admin and help, slice 6): every page in a workspace has help, or says why it has none.

/** Every page's path under /w/:ws, with the project's tabs one by one. */
const pagePaths = workspacePages.flatMap((route) => (route.index ? [''] : route.path === 'p/:projectKey/:tab' ? projectTabs.map((tab) => `p/:projectKey/${tab}`) : [route.path!]))

describe('help for each page', () => {
  it('every page has help, or is listed without and why', () => {
    const covered = new Set([...PAGE_HELP.map((rule) => rule.path), ...Object.keys(NO_HELP)])
    expect(pagePaths.filter((path) => !covered.has(path))).toEqual([])
    expect(Object.values(NO_HELP).every((why) => why.length > 10)).toBe(true)
  })

  it('each points at a chapter that exists, and at sections it has', () => {
    for (const rule of PAGE_HELP) {
      const chapter = chapters.find((c) => c.id === rule.chapter)
      expect(chapter, rule.path).toBeTruthy()
      expect(rule.needs ?? null, `${rule.path} needs`).toBe(chapter!.needs)
      const headings = chapter!.blocks.flatMap((b) => (b.type === 'h2' ? [b.text] : []))
      for (const section of rule.sections ?? []) expect(headings, `${rule.path} → ${section}`).toContain(section)
    }
  })

  it('every link between chapters goes to one that exists', () => {
    const ids = new Set(chapters.map((c) => c.id))
    const broken = chapters.flatMap((c) =>
      c.blocks
        .flatMap((b) => (b.type === 'p' || b.type === 'tip' ? b.inline : b.type === 'ul' || b.type === 'ol' ? b.items.flat() : []))
        .flatMap((i) => (i.t === 'link' && 'chapter' in i.to && !ids.has(i.to.chapter) ? [`${c.id} → ${i.to.chapter}`] : [])),
    )
    expect(broken).toEqual([])
  })

  it('a chapter for some people says who; every picture is in public/help', () => {
    expect(chapters.filter((c) => c.needs && !NEEDS_TEXT[c.needs]).map((c) => c.id)).toEqual([])
    const missing = chapters.flatMap((c) => c.blocks.flatMap((b) => (b.type === 'img' && !existsSync(`public${b.src}`) ? [b.src] : [])))
    expect(missing).toEqual([])
  })

  it('finds a page’s help by its address', () => {
    expect(pageHelpFor('/w/engineering')).toMatchObject({ chapter: 'home' })
    expect(pageHelpFor('/w/engineering/p/NEX/history')).toMatchObject({ chapter: 'project-page', sections: ['History'] })
    expect(pageHelpFor('/w/engineering/c/c-general')).toMatchObject({ chapter: 'chat' })
    expect(pageHelpFor('/w/engineering/help/time')).toBeNull()
  })
})
