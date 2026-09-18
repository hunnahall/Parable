import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'
import { getUserPreferences } from '@/lib/preferences/data'
import { DEFAULT_LANGUAGE, languageLabel } from '@/lib/languages'
import PageHeader from '@/components/layout/PageHeader'
import SettingsForm from '@/components/settings/SettingsForm'

export default async function SettingsPage() {
  const user = await getUser()
  if (!user) redirect('/login')

  const preferences = await getUserPreferences()

  // Read here rather than in the form: ingest's target language is a
  // project-level env var (INGEST_TARGET_LANGUAGE in
  // src/lib/feeds/ingest.ts), not a per-account preference, and only a
  // Server Component can see it. The settings page used to offer a
  // <select> writing user_preferences.language — a column nothing has read
  // since summaries became an ingest-time artifact, so changing it did
  // nothing at all. Showing the real value is honest; a per-account target
  // needs a feed_item_translations table before the control can come back.
  const ingestLanguage = languageLabel(process.env.INGEST_TARGET_LANGUAGE || DEFAULT_LANGUAGE)

  return (
    <>
      <PageHeader title="Settings" />
      <div className="mx-auto max-w-2xl p-6">
        <SettingsForm initialPreferences={preferences} ingestLanguage={ingestLanguage} />
      </div>
    </>
  )
}
