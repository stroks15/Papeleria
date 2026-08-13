import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function saveHistory(trama: { usuario_id?: string; tramite_id?: string; nota: string }){
  if (!supabaseUrl || !supabaseAnonKey) return
  try {
    await supabase.from('historial').insert([{ usuario_id: trama.usuario_id || null, tramite_id: trama.tramite_id || null, nota: trama.nota }])
  } catch (e) {
    console.debug('saveHistory failed', e)
  }
}
