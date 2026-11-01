import { useQuery, useQueryClient } from '@tanstack/react-query'
import clsx from 'clsx'
import { CalendarCheck, Clock, Layers, MessageSquare, Moon, Sun } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { useDemoPeople, useSignIn } from '@/api/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { api, backendOn } from '@/lib/api'
import { DEMO_PASSWORD } from '@/lib/demo'
import { useTheme } from '@/lib/useTheme'

/** Where to go after signing in: a path inside the app only ("/w/…"), never another site. */
export function safeReturn(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/signin') ? value : '/'
}

/**
 * Sign in (slice AB, as the Oasis CRM's): the Spark Flow panel on the left (wide screens), and on the right the
 * Light/Dark switch, email and password, and in the prototype the demo people to sign in as, by role. A signed-out
 * page sends people here with `returnTo`; they go back there after signing in.
 */
export function SignInPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // Asked afresh each time the page opens: an account cached from before signing out must not count as signed in, or
  // the page and the shell would send each other back and forth (the blank page after Log out).
  const me = useQuery({ queryKey: ['auth', 'check'], queryFn: () => api.users.me(), staleTime: 0, gcTime: 0, retry: false })
  const signIn = useSignIn()
  const demo = useDemoPeople(!backendOn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const returnTo = safeReturn(params.get('returnTo'))

  if (me.isSuccess) return <Navigate to={returnTo} replace />

  const go = (values: { email: string; password: string }) =>
    signIn.mutate(values, {
      onSuccess: () => {
        // Everything loaded so far belonged to nobody (or someone else): start afresh as the new person.
        queryClient.clear()
        navigate(returnTo, { replace: true })
      },
    })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    go({ email, password })
  }

  return (
    <div className="flex min-h-dvh bg-surface text-fg">
      <BrandPanel />
      <main className="relative flex min-w-0 flex-1 flex-col px-4 sm:px-8">
        <div className="flex justify-end pt-4 sm:pt-6">
          <ThemeSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <img src="/spark-logo-white.png" alt="" className="mb-8 h-7 w-auto self-start rounded bg-ink-900 px-2 py-1 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight text-fg">Welcome back</h1>
          <p className="mt-1 text-sm text-fg-secondary">Sign in with your Spark email and password.</p>
          {params.get('why') === 'deactivated' && (
            <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
              Your account was deactivated. Ask an Admin to reactivate it.
            </p>
          )}
          <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
            <Field label="Email">
              <input className={inputClass} type="email" autoComplete="username" placeholder="name@spark-sys.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input className={inputClass} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {signIn.isError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-300">
                {signIn.error.message}
              </p>
            )}
            <Button type="submit" className="min-h-11 w-full justify-center" disabled={signIn.isPending}>
              {signIn.isPending ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
          {!backendOn && demo.data && demo.data.length > 0 && (
            <section aria-labelledby="demo-title" className="mt-10">
              <h2 id="demo-title" className="mb-2 text-sm text-fg-secondary">
                Prototype: pick someone to sign in as (password <span className="font-mono text-fg">{DEMO_PASSWORD}</span>)
              </h2>
              <ul aria-label="Demo people" className="m-0 max-h-80 list-none divide-y divide-line-subtle overflow-y-auto rounded-xl border border-line p-0">
                {demo.data.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      disabled={signIn.isPending}
                      onClick={() => go({ email: person.email, password: DEMO_PASSWORD })}
                      className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2.5 text-start transition-colors hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none disabled:opacity-60"
                    >
                      <Avatar name={person.name} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-fg">{person.name}</span>
                        <span className="block truncate text-xs text-fg-muted">{[person.roles.join(', '), person.title].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <p className="pb-5 text-center text-xs text-fg-muted">
          Developed by <span className="font-medium text-fg-secondary">Spark Systems</span>
        </p>
      </main>
    </div>
  )
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme()
  const option = (value: 'light' | 'dark', label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={theme === value}
      aria-label={label}
      title={label}
      onClick={() => setTheme(value)}
      className={clsx('grid size-9 place-items-center rounded-lg transition-colors', theme === value ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:text-fg')}
    >
      {icon}
    </button>
  )
  return (
    <div role="group" aria-label="Theme" className="flex gap-0.5 rounded-xl border border-line bg-surface p-1 shadow-sm">
      {option('light', 'Light', <Sun className="size-4" />)}
      {option('dark', 'Dark', <Moon className="size-4" />)}
    </div>
  )
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="flex items-center gap-2.5 text-sm font-medium text-white">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-white">{icon}</span>
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

/** The left half on wide screens: Spark Flow and what it does, on the sidebar's ink. Pictures only, for sighted people. */
function BrandPanel() {
  const chip = 'rounded-md bg-white/[0.06] px-2 py-1 text-xs text-ink-200'
  return (
    <aside aria-hidden className="relative hidden w-[54%] max-w-[1040px] flex-col overflow-hidden bg-ink-950 p-12 text-ink-200 lg:flex">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(183,33,38,0.35),transparent_60%)]" />
      <div className="relative flex items-center gap-3">
        <img src="/spark-logo-white.png" alt="" className="h-8 w-auto" />
        <span className="h-6 w-px bg-white/25" />
        <span className="text-sm font-semibold tracking-[0.3em] text-white">FLOW</span>
      </div>
      <div className="relative my-auto max-w-xl py-12">
        <p className="text-sm font-medium text-brand-400">Spark Flow</p>
        <p className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-white">Projects, time and chat in one place.</p>
        <p className="mt-4 text-base leading-relaxed text-ink-200">Plan phases and tasks, log time as you work, and talk it through with your team, without switching apps.</p>
        <div className="mt-10 grid grid-cols-2 gap-3">
          <Card icon={<Layers className="size-4" />} title="Phases at a glance">
            <div className="flex gap-1">
              {['bg-brand-500', 'bg-white/40', 'bg-white/20', 'bg-white/10'].map((c, i) => (
                <span key={i} className={clsx('h-1.5 flex-1 rounded-full', c)} />
              ))}
            </div>
            <p className="mt-2 flex justify-between text-xs text-ink-200">
              <span>Build</span>
              <span>QA</span>
              <span>Delivery</span>
            </p>
          </Card>
          <Card icon={<Clock className="size-4" />} title="Time on every task">
            <p className={clsx(chip, 'flex justify-between')}>
              <span>NEX-101</span>
              <span className="font-mono text-brand-300">01:24:07</span>
            </p>
          </Card>
          <Card icon={<MessageSquare className="size-4" />} title="Chat and threads">
            <p className={clsx(chip, 'flex justify-between')}>
              <span>#nexus-core</span>
              <span>3 replies</span>
            </p>
          </Card>
          <Card icon={<CalendarCheck className="size-4" />} title="Who's in today">
            <p className={clsx(chip, 'flex justify-between')}>
              <span>7 checked in</span>
              <span>since 8:52 AM</span>
            </p>
          </Card>
        </div>
      </div>
      <p className="relative text-xs text-ink-200/70">Spark Systems · Cairo, Egypt</p>
    </aside>
  )
}
