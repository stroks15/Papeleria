import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Si todavía no hay variables de Supabase configuradas en Vercel, la app
// sigue funcionando por completo: solo se deja de guardar el historial de
// sesión y las estadísticas básicas.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;

export async function registrarEvento(
  tramiteSlug: string,
  evento: 'inicio' | 'completado'
) {
  if (!supabase) return;
  try {
    await supabase.from('estadisticas').insert({ tramite_slug: tramiteSlug, evento });
  } catch {
    // La estadística es un extra: si falla, no interrumpimos al usuario.
  }
}

export async function guardarSesion(
  sessionId: string,
  tramiteSlug: string,
  pasoActual: number,
  campos: Record<string, string>
) {
  if (!supabase) return;
  try {
    await supabase.from('sesiones').upsert(
      {
        session_id: sessionId,
        tramite_slug: tramiteSlug,
        paso_actual: pasoActual,
        campos,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'session_id' }
    );
  } catch {
    // Igual que arriba: la sesión es solo para continuidad, no es crítica.
  }
}
