import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error(
    'Faltan las variables VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
      'Copiá .env.example a .env y completalas.'
  )
}

// Fallback inocuo para que la app no rompa si falta el .env
// (el login simplemente fallará con un error de red claro).
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder'
)
