import { Button } from '@/components/ui/Button'
import { apiUrl } from '@/lib/api'
import { ApiError } from '@/lib/apiError'

/**
 * What the shell shows when your account didn't load: signed out (401) with a way to sign in again, or a sentence
 * and Try again. Signing in itself is the backend's page (`/signin?returnTo=`), agreed with the .NET team.
 */
export function AccountState({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const signedOut = error instanceof ApiError && error.status === 401
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold text-fg">{signedOut ? "You're signed out." : "We couldn't load your account."}</h1>
      <p className="mt-1 text-sm text-fg-muted">{signedOut ? 'Sign in again to carry on where you were.' : 'Check your connection, then try again.'}</p>
      <div className="mt-4 flex justify-center">
        {signedOut ? (
          <a href={`${apiUrl('/signin')}?returnTo=${encodeURIComponent(location.href)}`} className="inline-flex items-center rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600">
            Sign in
          </a>
        ) : (
          <Button onClick={onRetry}>Try again</Button>
        )}
      </div>
    </div>
  )
}
