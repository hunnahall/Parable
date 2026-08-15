import { login, signup } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const { error, message } = await searchParams

  return (
    <div className="p-8 max-w-sm mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Sign in</h1>

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
            className="w-full border rounded px-3 py-2"
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
            className="w-full border rounded px-3 py-2"
          />
        </div>
        <div className="flex gap-3 pt-2">
          <button
            formAction={login}
            className="flex-1 rounded bg-black text-white py-2"
          >
            Sign in
          </button>
          <button formAction={signup} className="flex-1 rounded border py-2">
            Sign up
          </button>
        </div>
      </form>
    </div>
  )
}
