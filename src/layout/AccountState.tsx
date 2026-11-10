import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/lib/useDocumentTitle'

/**
 * What the shell shows when your account didn't load for a reason other than being signed out (which goes to Sign in,
 * slice AB): a sentence and Try again.
 */
export function AccountState({ onRetry, retrying }: { error: Error; onRetry: () => void; retrying: boolean }) {
  useDocumentTitle(['Account'])
  return (
    <div role="alert" className="mx-auto mt-16 max-w-md rounded-xl border border-line bg-surface p-6 text-center">
      <h1 className="text-lg font-semibold text-fg">We couldn’t load your account.</h1>
      <p className="mt-1 text-sm text-fg-muted">Check your connection, then try again.</p>
      <div className="mt-4 flex justify-center">
        <Button onClick={onRetry} disabled={retrying}>
          {retrying ? 'Trying…' : 'Try again'}
        </Button>
      </div>
    </div>
  )
}
