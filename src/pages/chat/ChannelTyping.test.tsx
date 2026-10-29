// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { User } from '@/api/types'
import { useUiStore } from '@/lib/uiStore'
import { TypingLine } from '@/pages/chat/ChannelTyping'

afterEach(cleanup)

describe('TypingLine (spec 6.8, .sf-typing)', () => {
  it('reads in text-secondary with the names in text, 600', () => {
    useUiStore.setState({ typing: { c1: [{ userId: 'u-2', until: Date.now() + 60_000 }] } })
    render(<TypingLine channelId="c1" people={[{ id: 'u-2', name: 'Nour El-Sayed' } as User]} meId="u-1" />)
    const name = screen.getByText('Nour El-Sayed')
    expect(name.className.split(' ')).toEqual(expect.arrayContaining(['font-semibold', 'text-sf-text']))
    expect(name.closest('p')!.className.split(' ')).toContain('text-sf-text-secondary')
  })
})
