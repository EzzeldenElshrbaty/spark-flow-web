// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DemoPerson, Me } from '@/api/types'
import { api, ApiError } from '@/lib/api'
import { DEMO_PASSWORD } from '@/lib/demo'
import { ThemeProvider } from '@/lib/ThemeProvider'
import { SignInPage, safeReturn } from './SignInPage'

// The sign-in page (slice AB): email and password, and the prototype's people to sign in as, by role.

window.matchMedia ??= ((media: string) => ({ matches: false, media, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia

const people: DemoPerson[] = [
  { id: 'u-1', name: 'Youssef Abdelrahman', email: 'youssef.abdelrahman@spark-sys.com', title: 'Managing Director', roles: ['Admin'] },
  { id: 'u-2', name: 'Nour El-Sayed', email: 'nour.elsayed@spark-sys.com', title: 'Project Manager · Backend', roles: ['Project manager'] },
  { id: 'u-5', name: 'Salma Ibrahim', email: 'salma.ibrahim@spark-sys.com', title: 'QA Engineer', roles: ['Member'] },
]
const nour = { id: 'u-2', name: 'Nour El-Sayed' } as Me

beforeEach(() => {
  vi.spyOn(api.users, 'me').mockRejectedValue(new ApiError({ title: 'Signed out', status: 401, detail: 'Signed out' }))
  vi.spyOn(api.auth, 'demoPeople').mockResolvedValue(people)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function Where() {
  const { pathname, search } = useLocation()
  return <output data-testid="where">{pathname + search}</output>
}

function mount(path = '/signin', client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/signin" element={<SignInPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('the sign-in page', () => {
  it('asks for email and password, and lists the demo people with their roles and the demo password', async () => {
    mount()
    expect(screen.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    const list = await screen.findByRole('list', { name: 'Demo people' })
    expect(within(list).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'YAYoussef AbdelrahmanAdmin · Managing Director',
      'NENour El-SayedProject manager · Project Manager · Backend',
      'SISalma IbrahimMember · QA Engineer',
    ])
    expect(screen.getByText(new RegExp(DEMO_PASSWORD))).toBeTruthy()
  })

  it('signs in with the form and goes back where I was', async () => {
    const signIn = vi.spyOn(api.auth, 'signIn').mockResolvedValue(nour)
    mount('/signin?returnTo=%2Fw%2Fengineering%2Fprojects')
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nour.elsayed@spark-sys.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: DEMO_PASSWORD } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByTestId('where')).textContent).toBe('/w/engineering/projects')
    expect(signIn).toHaveBeenCalledWith('nour.elsayed@spark-sys.com', DEMO_PASSWORD)
  })

  it('picking a demo person signs in as them; a returnTo that leaves the app goes home instead', async () => {
    const signIn = vi.spyOn(api.auth, 'signIn').mockResolvedValue(nour)
    mount('/signin?returnTo=https%3A%2F%2Fevil.example')
    fireEvent.click(await screen.findByRole('button', { name: /Nour El-Sayed/ }))
    expect((await screen.findByTestId('where')).textContent).toBe('/')
    expect(signIn).toHaveBeenCalledWith('nour.elsayed@spark-sys.com', DEMO_PASSWORD)
  })

  it('a refusal shows under the form', async () => {
    vi.spyOn(api.auth, 'signIn').mockRejectedValue(new ApiError({ title: 'Bad request', status: 400, detail: "That email and password don’t match." }))
    mount()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'x@spark-sys.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toBe("That email and password don’t match.")
  })

  it('after a deactivation, says why I was signed out', async () => {
    mount('/signin?why=deactivated')
    expect(screen.getByText('Your account was deactivated. Ask an Admin to reactivate it.')).toBeTruthy()
  })

  it('an account still cached from before Log out doesn’t count: the page stays (it went blank, bouncing to the shell)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['users', 'me'], nour)
    mount('/signin', client)
    expect(await screen.findByRole('list', { name: 'Demo people' })).toBeTruthy()
    expect(screen.queryByTestId('where')).toBeNull()
  })

  it('already signed in, it goes straight on', async () => {
    vi.mocked(api.users.me).mockResolvedValue(nour)
    mount('/signin?returnTo=%2Fw%2Fengineering%2Ftasks')
    expect((await screen.findByTestId('where')).textContent).toBe('/w/engineering/tasks')
  })

  it('sent from the workspace’s own address, it opens the Dashboard; a link to a task there still returns (dashboard start)', async () => {
    vi.spyOn(api.auth, 'signIn').mockResolvedValue(nour)
    mount('/signin?returnTo=%2Fw%2Fengineering')
    fireEvent.click(await screen.findByRole('button', { name: /Nour El-Sayed/ }))
    expect((await screen.findByTestId('where')).textContent).toBe('/w/engineering/dashboard')
    expect(safeReturn('/w/engineering/')).toBe('/w/engineering/dashboard')
    expect(safeReturn('/w/engineering?ticket=NEX-101')).toBe('/w/engineering?ticket=NEX-101')
    expect(safeReturn('/w/engineering/p/NEX/tasks?ticket=NEX-101')).toBe('/w/engineering/p/NEX/tasks?ticket=NEX-101')
  })
})
