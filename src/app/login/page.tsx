import { login, signup } from './actions'
import ParableLogo from '@/components/brand/ParableLogo'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div className="p-8 max-w-sm mx-auto space-y-6">
      <ParableLogo height={32} />
      <h1 className="text-2xl font-bold">Sign in</h1>

      {error && <p className="text-red-600 text-sm">{error}</p>}
      {message && <p className="text-green-600 text-sm">{message}</p>}

      <form className="space-y-3">
        <div className="space-y-1">
          <label htmlFor="email" className="block text-sm">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="block text-sm">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={6}
            className="w-full border border-border rounded px-3 py-2 bg-background"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            formAction={login}
            className="flex-1 rounded-full bg-accent text-accent-foreground py-2"
          >
            Sign in
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded-full border border-border py-2"
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  )
}
