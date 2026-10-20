import { redirect } from 'next/navigation'
import { login } from './actions'
import { getUser } from '@/lib/supabase/server'
import Button from '@/components/ui/Button'
import Alert from '@/components/ui/Alert'
import { Field, Input } from '@/components/ui/Input'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>
}) {
  const user = await getUser()
  if (user) redirect('/')

  const { error, message } = await searchParams

  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-16">
      <div className="space-y-1">
        <h1>Sign in</h1>
        <p className="text-sm text-muted">Parable is invite-only.</p>
      </div>

      {error && <Alert tone="danger" title="Couldn't sign in">{error}</Alert>}
      {message && <Alert tone="success" title={message} />}

      <form className="cw-panel cw-panel__body space-y-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Button type="submit" formAction={login} variant="primary" size="lg" className="w-full">
          Sign in
        </Button>
      </form>
    </div>
  )
}
