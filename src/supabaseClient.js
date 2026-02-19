import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,       // Obliga a guardar la sesión al cerrar/cambiar pestaña
    autoRefreshToken: true,     // Renueva el token automáticamente antes de los 30 min
    detectSessionInUrl: true,   // Clave si usás Magic Links
    storage: window.localStorage // Guarda el token en la memoria fija del navegador
  }
})
