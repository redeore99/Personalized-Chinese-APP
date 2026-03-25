import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseClientKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseClientKey)
}

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseClientKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null
