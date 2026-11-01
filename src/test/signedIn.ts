// Tests start signed in as the demo document's default person (slice AB), as the app did before Sign in existed; a
// test of signing in starts its own signed-out session (src/mocks/auth.test.ts).
try {
  globalThis.localStorage?.setItem('spark-flow.session', '')
} catch {
  // No storage in this environment: the mock's session stays in memory, signed out, and the test signs in itself.
}
