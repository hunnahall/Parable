// Parable runs inside the Covenant Works suite: one address for every app
// (covenantworks.vercel.app), with Parable served under /parable through the
// landing app's rewrites. Sign-in, sign-out and the account live in the
// landing app (~/Drive/Projects/covenant_works/covenantworks).

// Every Parable path starts with this. next.config.ts sets it as basePath, so
// Link, redirect() and router.push add it on their own; a raw fetch() or an
// <a> to another app's path doesn't, which is why it's exported.
export const BASE_PATH = '/parable'

// The suite's address. Server-side only: the browser is already on it, so
// client code uses plain root-relative paths like "/auth/sign-out", which
// resolve against the suite's address without the base path.
export function suiteOrigin(): string {
  return process.env.SUITE_ORIGIN ?? 'https://covenantworks.vercel.app'
}

// The landing app's sign-in page, coming back to `path` (a Parable path,
// without the base path) afterwards.
export function signInUrl(path: string = '/'): string {
  const next = `${BASE_PATH}${path === '/' ? '' : path}`
  return `${suiteOrigin()}/login?next=${encodeURIComponent(next)}`
}
