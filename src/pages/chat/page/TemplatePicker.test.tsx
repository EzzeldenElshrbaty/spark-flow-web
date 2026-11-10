// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PageView } from '@/api/types'
import { announce, Announcer } from '@/components/sf/Announcer'
import { api, ApiError } from '@/lib/api'
import { PAGE_TEMPLATES } from '@/lib/pageTemplates'
import { TemplatePicker } from './TemplatePicker'

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const release = PAGE_TEMPLATES.find((t) => t.id === 'release')!.body
const view = (version: number, body: PageView['body'] = []): PageView => ({ channelId: 'c-general', body, version, updatedAt: null, updatedBy: null, editors: [], editing: null })

let onClose: () => void
let onAdded: () => void
beforeEach(() => {
  announce('')
  onClose = vi.fn()
  onAdded = vi.fn()
  vi.spyOn(api.pages, 'get').mockResolvedValue(view(0))
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <Announcer />
      <TemplatePicker channelId="c-general" onClose={onClose} onAdded={onAdded} />
    </QueryClientProvider>,
  )
  return screen.getByRole('dialog', { name: 'Pick a template' })
}
const choose = (dialog: HTMLElement, name: RegExp) => fireEvent.click(within(dialog).getByRole('radio', { name }))

describe('TemplatePicker (chat spec 6.14 §6)', () => {
  it('offers the three templates, the first one chosen', () => {
    const dialog = mount()
    const radios = within(dialog).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => r.checked)).toEqual([true, false, false])
    expect(within(dialog).getByRole('radiogroup', { name: 'Templates' })).toBeTruthy()
    expect(within(dialog).getByText('It fills the channel’s page. You can change everything after.')).toBeTruthy()
  })

  it('an empty page takes the template at once', async () => {
    const save = vi.spyOn(api.pages, 'save').mockResolvedValue(view(1, release))
    const dialog = mount()
    choose(dialog, /^Release/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use template' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith('c-general', { body: release, baseVersion: 0 })
    expect(onClose).toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toBe('Template added to the page.')
  })

  it('a page with text asks first; Keep the page goes back', async () => {
    vi.mocked(api.pages.get).mockResolvedValue(view(3, [{ type: 'p', children: [{ type: 'text', text: 'Ours' }] }]))
    const save = vi.spyOn(api.pages, 'save').mockResolvedValue(view(4, release))
    const dialog = mount()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use template' }))
    expect(await within(dialog).findByText('Replace the channel’s page? The current one stays in History.')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep the page' }))
    expect(within(dialog).getByRole('button', { name: 'Use template' })).toBeTruthy()
  })

  it('Replace saves it as the newest version', async () => {
    vi.mocked(api.pages.get).mockResolvedValue(view(3, [{ type: 'p', children: [{ type: 'text', text: 'Ours' }] }]))
    const save = vi.spyOn(api.pages, 'save').mockResolvedValue(view(4, release))
    const dialog = mount()
    choose(dialog, /^Release/)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use template' }))
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Replace' }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(save).toHaveBeenCalledWith('c-general', { body: release, baseVersion: 3 })
  })

  it('a refusal stays in the picker, read out', async () => {
    const sentence = 'Nour El-Sayed started editing first. Your last changes aren’t saved.'
    vi.spyOn(api.pages, 'save').mockRejectedValue(new ApiError({ title: 'Conflict', status: 409, detail: sentence }))
    const dialog = mount()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use template' }))
    expect(await within(dialog).findByText(sentence)).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(sentence)
    expect(onClose).not.toHaveBeenCalled()
    expect(onAdded).not.toHaveBeenCalled()
  })
})
