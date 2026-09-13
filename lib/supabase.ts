import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
  )
}

/**
 * Browser-side Supabase client.
 *
 * Auth is email + password only (no OAuth providers):
 *  • persistSession — the session is stored in localStorage and restored on
 *    every load, so a plain reload keeps you signed in until you sign out.
 *  • autoRefreshToken — access tokens renew silently in the background.
 *  • detectSessionInUrl false — nothing in the URL carries a session
 *    (no OAuth codes to exchange), so never parse the URL for one.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    detectSessionInUrl: false,
    persistSession: true,
    autoRefreshToken: true,
  },
})
