import Link from 'next/link'
import { createClient, getUser } from '@/lib/supabase/server'

export default async function Home() {
  const user = await getUser()
  const supabase = await createClient()
  const { data: indicators, error } = await supabase
    .from('indicators')
    .select('*')

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold mb-4">Indicators</h1>

      {error && (
        <p className="text-red-600">
          Error querying indicators: {error.message}
        </p>
      )}

      {!error && indicators?.length === 0 && (
        <p className="text-gray-500">
          {user ? (
            'Connected, but no rows came back — check that RLS policies allow this read.'
          ) : (
            <>
              No indicators visible while signed out.{' '}
              <Link href="/login" className="underline">
                Sign in
              </Link>{' '}
              if indicators are restricted to authenticated users.
            </>
          )}
        </p>
      )}

      {!error && indicators && indicators.length > 0 && (
        <ul className="list-disc list-inside space-y-1">
          {indicators.map((indicator) => (
            <li key={indicator.id}>
              {indicator.display_name ?? JSON.stringify(indicator)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
