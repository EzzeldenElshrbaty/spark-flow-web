import { Button } from '@/components/ui/Button'
import { apiUrl, backendOn } from '@/lib/api'
import { ApiError } from '@/lib/apiError'

/**
 * What the shell shows when your account didn't load: signed out (401) with a way to sign in again, or a sentence
 * and Try again. Signing in itself is the backend's page (`/signin?returnTo=`), agreed with the .NET team.
 */
export function AccountState({ error, onRetry, retrying }: { error: Error; onRetry: () => void; retrying: boolean }) {
  const signedOut = error instanceof ApiError && error.status === 401
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold text-fg">{signedOut ? "You're signed out." : "We couldn't load your account."}</h1>
      <p className="mt-1 text-sm text-fg-muted">
        {!signedOut
          ? 'Check your connection, then try again.'
          : backendOn
            ? 'Sign in again to carry on where you were.'
            : // The prototype has no sign-in (spec §10): a deactivated person's tab picks someone else.
              `${error.message && error.message !== 'Signed out' ? `${error.message} ` : ''}Pick someone under View as, in your avatar's menu, to carry on.`}
      </p>
      <div className="mt-4 flex justify-center empty:hidden">
        {signedOut && !backendOn ? null : signedOut ? (
          <a href={`${apiUrl('/signin')}?returnTo=${encodeURIComponent(location.href)}`} className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            Sign in
          </a>
        ) : (
          <Button onClick={onRetry} disabled={retrying}>
            {retrying ? 'Trying…' : 'Try again'}
          </Button>
        )}
      </div>
    </div>
  )
}
