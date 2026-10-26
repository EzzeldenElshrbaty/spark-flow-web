import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, Lock, Mail, MailCheck, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { Field, inputClass } from '../../components/ui/Field'
import { api } from '../../lib/api'
import { currentPath } from '../../lib/paths'
import type { Me } from '../../lib/useAuth'
import { useTheme } from '../../lib/useTheme'

type Screen = 'sign-in' | 'forgot-password' | 'set-password'

const screenFromPath = (): Screen => {
  const path = currentPath()
  return path === '/set-password' ? 'set-password' : path === '/forgot-password' ? 'forgot-password' : 'sign-in'
}

/** Sign in, Forgot password, and Set password (from the invite or reset email). Shown while signed out. */
export function AuthScreens({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [screen, setScreen] = useState<Screen>(screenFromPath)
  const [email, setEmail] = useState('')

  useEffect(() => {
    const onBack = () => setScreen(screenFromPath())
    window.addEventListener('popstate', onBack)
    return () => window.removeEventListener('popstate', onBack)
  }, [])

  const go = (next: Screen) => {
    window.history.pushState(null, '', `/${next}`)
    setScreen(next)
  }

  return (
    <Shell>
      {screen === 'sign-in' && <SignIn email={email} setEmail={setEmail} onForgot={() => go('forgot-password')} onSignedIn={onSignedIn} />}
      {screen === 'forgot-password' && <ForgotPassword email={email} setEmail={setEmail} onBack={() => go('sign-in')} />}
      {screen === 'set-password' && <SetPassword onSignedIn={onSignedIn} onForgot={() => go('forgot-password')} />}
    </Shell>
  )
}

/** The brand-red side: a big panel on wide screens, a band above the form on phones. */
function Shell({ children }: { children: ReactNode }) {
  const { theme } = useTheme()

  // Phone status bar matches the red band while signed out; the app's own color comes back after.
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    const before = meta?.getAttribute('content')
    meta?.setAttribute('content', '#671416')
    return () => {
      if (before) meta?.setAttribute('content', before)
    }
  }, [theme])

  return (
    <div className="flex min-h-dvh flex-col bg-brand-900 lg:flex-row lg:bg-canvas">
      <BrandPanel />
      <main className="relative -mt-6 flex flex-1 flex-col rounded-t-[28px] bg-surface px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-12px_40px_rgba(40,6,8,0.35)] sm:px-8 lg:mt-0 lg:rounded-none lg:bg-canvas lg:px-12 lg:shadow-none">
        <ThemeToggle className="absolute right-5 top-5 hidden text-fg-muted ring-line hover:bg-surface-muted hover:text-fg lg:flex" />
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col pt-2 lg:justify-center lg:py-10">
          <div className="motion-safe:animate-fade-up">{children}</div>
        </div>
        <p className="mx-auto mt-8 w-full max-w-[400px] text-center text-xs text-fg-subtle lg:hidden">© {year} Spark Systems</p>
      </main>
    </div>
  )
}

function ThemeToggle({ className }: { className: string }) {
  const { theme, setTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`size-9 items-center justify-center rounded-full ring-1 transition-colors ${className}`}
    >
      {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}

const year = new Date().getFullYear()

const stages = ['Lead', 'Qualified', 'Proposal', 'Won']

function BrandPanel() {
  return (
    <aside className="relative isolate overflow-hidden bg-[linear-gradient(150deg,#4a0d0f_0%,#671416_38%,#9e1d21_78%,#b72126_100%)] px-6 pb-12 pt-[max(1.75rem,env(safe-area-inset-top))] text-white sm:px-10 lg:flex lg:w-[52%] lg:flex-col lg:px-14 lg:py-12 xl:w-[56%] dark:bg-[linear-gradient(150deg,#260708_0%,#3d0b0d_40%,#6e1518_80%,#8a1a1e_100%)]">
      {/* Soft glows and a faint grid give the red some depth. */}
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 size-[420px] rounded-full bg-[#ff5a5f]/25 blur-3xl motion-safe:animate-drift" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 -z-10 size-[480px] rounded-full bg-black/30 blur-3xl" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_70%_30%,black,transparent_70%)]"
      />
      <img aria-hidden src="/spark-mark-white.png" alt="" className="pointer-events-none absolute -bottom-10 -right-16 -z-10 hidden w-[520px] max-w-none opacity-[0.06] lg:block" />

      <div className="flex items-center justify-between">
        <img src="/spark-logo-white.png" alt="Spark Systems" className="h-8 w-auto lg:h-10" />
        <ThemeToggle className="flex text-white/80 ring-white/25 hover:bg-white/10 hover:text-white lg:hidden" />
      </div>

      <div className="mt-8 lg:my-auto lg:max-w-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/60">Spark CRM</p>
        <h2 className="mt-2 text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl lg:mt-4 lg:text-[44px] lg:leading-[1.1]">
          Every deal, from first call to <span className="text-[#ffb3b5]">cash collected.</span>
        </h2>
        <p className="mt-4 hidden max-w-md text-base leading-relaxed text-white/70 lg:block">
          Leads, proposals, approvals, payments and targets for the Egypt and Saudi teams, in one place.
        </p>

        <PipelinePreview />
      </div>

      <div className="mt-10 hidden items-center justify-between text-xs text-white/50 lg:flex">
        <span>© {year} Spark Systems</span>
        <span>Egypt · Saudi Arabia</span>
      </div>
    </aside>
  )
}

/** A small, decorative picture of a deal moving through the pipeline. Wide screens only. */
function PipelinePreview() {
  return (
    <div aria-hidden className="relative mt-12 mb-20 hidden max-w-md lg:block">
      <div className="rounded-2xl bg-white/[0.08] p-5 ring-1 ring-white/15 backdrop-blur-md motion-safe:animate-fade-up">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Website redesign</p>
            <p className="mt-0.5 text-xs text-white/55">Proposal approved</p>
          </div>
          <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium">Won</span>
        </div>
        <div className="mt-5 flex items-center">
          {stages.map((stage, index) => (
            <div key={stage} className="flex flex-1 items-center last:flex-none">
              <span className="flex flex-col items-center gap-1.5">
                <span className="flex size-6 items-center justify-center rounded-full bg-white text-brand-700 motion-safe:animate-pop-in" style={{ animationDelay: `${300 + index * 180}ms` }}>
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
                <span className="text-[11px] text-white/65">{stage}</span>
              </span>
              {index < stages.length - 1 && (
                <span className="mx-1.5 mb-5 h-0.5 flex-1 origin-left rounded-full bg-white/70 motion-safe:animate-grow-x" style={{ animationDelay: `${380 + index * 180}ms` }} />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-20 right-6 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-fg shadow-2xl shadow-black/30 ring-1 ring-black/5 motion-safe:animate-float xl:-right-12 dark:bg-ink-900 dark:text-white dark:ring-white/10">
        <svg viewBox="0 0 36 36" className="size-10 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-brand-100 dark:stroke-white/10" />
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round" pathLength="100" strokeDasharray="72 100" className="stroke-brand-500 motion-safe:animate-ring dark:stroke-brand-400" />
        </svg>
        <div>
          <p className="text-[11px] text-fg-muted dark:text-white/55">Quarter target</p>
          <p className="text-sm font-semibold">72% collected</p>
        </div>
      </div>
    </div>
  )
}

/** After signing in with a password Management set for them: they choose their own before using the app. */
export function ChooseOwnPassword({ me, onDone, onSignOut }: { me: Me; onDone: () => void; onSignOut: () => void }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const { busy, error, run } = useAction()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    run(async () => {
      if (password !== repeat) throw new Error("The two passwords don't match.")
      await api('/api/auth/change-password', { method: 'POST', body: { currentPassword: current, newPassword: password } })
      onDone()
    })
  }

  return (
    <Shell>
      <form onSubmit={submit} className="space-y-4">
        <Heading title="Choose your password">Welcome, {me.name.split(' ')[0]}. Replace the password you were given with one only you know.</Heading>
        <input type="email" value={me.email} autoComplete="username" readOnly hidden />
        <Field label="Password you were given">
          <PasswordInput value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password">
          <PasswordInput value={repeat} onChange={setRepeat} autoComplete="new-password" />
        </Field>
        <ErrorLine>{error}</ErrorLine>
        <SubmitButton busy={busy} busyText="Saving…">
          Save and continue
        </SubmitButton>
        <button type="button" onClick={onSignOut} className="block w-full pt-2 text-center text-sm text-fg-muted hover:text-fg">
          Sign out
        </button>
      </form>
    </Shell>
  )
}

function Heading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-fg">{title}</h1>
      {children && <p className="mt-2 text-[15px] text-fg-muted">{children}</p>}
    </div>
  )
}

const ErrorLine = ({ children }: { children: string }) =>
  children ? (
    <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900/60">
      {children}
    </p>
  ) : null

/** Taller inputs with a leading icon, roomy enough for thumbs on phones. */
const authInputClass = `${inputClass} h-12 rounded-xl pl-10 text-[15px] shadow-xs transition-shadow`

function IconInput({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="relative block">
      <Icon aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-subtle" />
      {children}
    </span>
  )
}

function EmailInput({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  return (
    <IconInput icon={Mail}>
      <input className={authInputClass} type="email" inputMode="email" placeholder="name@spark-sys.com" value={value} onChange={(event) => onChange(event.target.value)} autoComplete="username" autoFocus={autoFocus} required />
    </IconInput>
  )
}

function PasswordInput({ value, onChange, autoComplete, autoFocus }: { value: string; onChange: (value: string) => void; autoComplete: string; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false)
  return (
    <IconInput icon={Lock}>
      <input className={`${authInputClass} pr-11`} type={shown ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} autoFocus={autoFocus} required />
      <button
        type="button"
        onClick={() => setShown((value) => !value)}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-fg-subtle hover:text-fg"
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </IconInput>
  )
}

/** The main action on each screen: full width, Spark red with a soft glow. */
function SubmitButton({ busy, children, busyText, onClick }: { busy?: boolean; children: ReactNode; busyText?: string; onClick?: () => void }) {
  return (
    <Button
      type={onClick ? 'button' : 'submit'}
      onClick={onClick}
      disabled={busy}
      className="group mt-2 h-12 w-full rounded-xl bg-[linear-gradient(135deg,#c4262b,#9e1d21)] text-[15px] shadow-lg shadow-brand-500/25 hover:bg-[linear-gradient(135deg,#b72126,#88191d)] hover:shadow-brand-500/35 dark:shadow-black/40"
    >
      {busy ? (
        <>
          <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          {busyText}
        </>
      ) : (
        <>
          {children}
          <ArrowRight className="size-4 transition-transform motion-safe:group-hover:translate-x-0.5" />
        </>
      )}
    </Button>
  )
}

const quietLink = 'text-sm font-medium text-accent underline-offset-4 hover:text-accent-strong hover:underline'


/** Runs a form action with a busy flag and its error message. */
function useAction() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function SignIn({ email, setEmail, onForgot, onSignedIn }: { email: string; setEmail: (value: string) => void; onForgot: () => void; onSignedIn: (me: Me) => void }) {
  const [password, setPassword] = useState('')
  const { busy, error, run } = useAction()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    run(async () => onSignedIn(await api<Me>('/api/auth/sign-in', { method: 'POST', body: { email, password } })))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Heading title="Welcome back">Sign in to Spark CRM to pick up where you left off.</Heading>
      <Field label="Email">
        <EmailInput value={email} onChange={setEmail} autoFocus={!email} />
      </Field>
      <div>
        <Field label="Password">
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" autoFocus={Boolean(email)} />
        </Field>
        <div className="mt-2 text-right">
          <button type="button" onClick={onForgot} className={quietLink}>
            Forgot password?
          </button>
        </div>
      </div>
      <ErrorLine>{error}</ErrorLine>
      <SubmitButton busy={busy} busyText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  )
}

function ForgotPassword({ email, setEmail, onBack }: { email: string; setEmail: (value: string) => void; onBack: () => void }) {
  const [sent, setSent] = useState('')
  const { busy, error, run } = useAction()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    run(async () => setSent((await api<{ notice: string }>('/api/auth/forgot-password', { method: 'POST', body: { email } })).notice))
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {sent ? (
        <div className="motion-safe:animate-fade-up">
          <span className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent ring-1 ring-accent-line">
            <MailCheck className="size-7" />
          </span>
          <Heading title="Check your email">{sent}</Heading>
        </div>
      ) : (
        <>
          <Heading title="Forgot password?">Enter your work email and we'll send you a link to choose a new one.</Heading>
          <Field label="Email">
            <EmailInput value={email} onChange={setEmail} autoFocus />
          </Field>
          <ErrorLine>{error}</ErrorLine>
          <SubmitButton busy={busy} busyText="Sending…">
            Send link
          </SubmitButton>
        </>
      )}
      <button type="button" onClick={onBack} className="flex w-full items-center justify-center gap-1.5 pt-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Back to sign in
      </button>
    </form>
  )
}

type LinkInfo = { name: string; email: string; purpose: 'invite' | 'reset' }

function SetPassword({ onSignedIn, onForgot }: { onSignedIn: (me: Me) => void; onForgot: () => void }) {
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '')
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [linkError, setLinkError] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const { busy, error, run } = useAction()

  useEffect(() => {
    api<LinkInfo>(`/api/auth/password-link?token=${encodeURIComponent(token)}`)
      .then(setLink)
      .catch((failure: Error) => setLinkError(failure.message))
  }, [token])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    run(async () => {
      if (password !== repeat) throw new Error("The two passwords don't match.")
      onSignedIn(await api<Me>('/api/auth/set-password', { method: 'POST', body: { token, password } }))
    })
  }

  if (linkError)
    return (
      <div className="space-y-4">
        <Heading title="Link expired">{linkError}</Heading>
        <SubmitButton onClick={onForgot}>Get a new link</SubmitButton>
      </div>
    )
  if (!link)
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-2/3 rounded-lg bg-surface-muted motion-safe:animate-pulse" />
        <div className="h-4 w-1/2 rounded bg-surface-muted motion-safe:animate-pulse" />
        <div className="mt-8 h-12 rounded-xl bg-surface-muted motion-safe:animate-pulse" />
        <div className="h-12 rounded-xl bg-surface-muted motion-safe:animate-pulse" />
      </div>
    )

  return (
    <form onSubmit={submit} className="space-y-4">
      <Heading title={link.purpose === 'invite' ? `Welcome, ${link.name.split(' ')[0]}` : 'Choose a new password'}>
        {link.purpose === 'invite' ? 'Choose a password to start using Spark CRM.' : `For ${link.email}.`}
      </Heading>
      {/* Lets password managers save the password against the right email. */}
      <input type="email" value={link.email} autoComplete="username" readOnly hidden />
      <Field label="New password" hint="At least 8 characters.">
        <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" autoFocus />
      </Field>
      <Field label="Repeat password">
        <PasswordInput value={repeat} onChange={setRepeat} autoComplete="new-password" />
      </Field>
      <ErrorLine>{error}</ErrorLine>
      <SubmitButton busy={busy} busyText="Saving…">
        Save and sign in
      </SubmitButton>
    </form>
  )
}
