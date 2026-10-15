import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import {
  URLS_OFICIALES,
  esHostOficial,
  urlSinConsulta,
  type RespuestaTramite,
  type TipoVehicular,
} from '@/lib/ventanilla/tipos';

const SCRAPER_TIMEOUT_MS = 24_000; // la ruta declara maxDuration = 30 s
const VENTANA_IDEMPOTENCIA_MS = 10 * 60 * 1000;

type EstadoDb = 'pendiente' | 'ok' | 'requires_fallback' | 'unknown' | 'error';

type FilaConsulta = {
  id: string;
  tipo: TipoVehicular;
  placa: string;
  estado: EstadoDb;
  resultado: Record<string, unknown> | null;
  motivo: string | null;
  actualizado_en: string;
};

type ResultadoScraper =
  | { status: 'OK'; datos: Record<string, unknown> }
  | { status: 'REQUIRES_VIEWPORT_FALLBACK' | 'UNKNOWN' | 'ERROR'; reason: string };

// ---------------------------------------------------------------------------
// Supabase (service_role). La integración Vercel-Supabase inyecta estas variables.
// ---------------------------------------------------------------------------
let cliente: SupabaseClient | null | undefined;

export function supabaseAdmin(): SupabaseClient | null {
  if (cliente !== undefined) return cliente;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const llave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cliente =
    url && llave
      ? createClient(url, llave, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  return cliente;
}

// ---------------------------------------------------------------------------
// Idempotencia
// ---------------------------------------------------------------------------
/** Misma consulta dentro de una ventana de 10 min -> misma clave. */
export function claveIdempotencia(tipo: TipoVehicular, placa: string, ahora = Date.now()): string {
  const ventana = Math.floor(ahora / VENTANA_IDEMPOTENCIA_MS);
  return createHash('sha256').update(`${tipo}:${placa}:${ventana}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Respuestas
// ---------------------------------------------------------------------------
function fallback(tipo: TipoVehicular, placa: string, motivo: string): RespuestaTramite {
  return { status: 'REQUIRES_VIEWPORT_FALLBACK', tipo, placa, urlOficial: URLS_OFICIALES[tipo], motivo };
}

function desdeFila(fila: FilaConsulta, cached: boolean): RespuestaTramite {
  const base = {
    tipo: fila.tipo,
    placa: fila.placa,
    cached,
    actualizadoEn: fila.actualizado_en,
  };
  switch (fila.estado) {
    case 'ok':
      return { ...base, status: 'OK', datos: fila.resultado ?? {} };
    case 'pendiente':
      return { ...base, status: 'PENDING', motivo: 'consulta_en_curso' };
    case 'requires_fallback':
      return { ...base, status: 'REQUIRES_VIEWPORT_FALLBACK', urlOficial: URLS_OFICIALES[fila.tipo], motivo: fila.motivo ?? undefined };
    case 'unknown':
      return { ...base, status: 'UNKNOWN', motivo: fila.motivo ?? 'sin_confirmacion' };
    default:
      return { ...base, status: 'ERROR', motivo: fila.motivo ?? 'error' };
  }
}

// ---------------------------------------------------------------------------
// Servicio Python (lib/servicios_cdmx.py serve)
// ---------------------------------------------------------------------------
function urlScraper(): string | null {
  const base = process.env.CDMX_SCRAPER_URL;
  if (!base || !process.env.CDMX_SCRAPER_TOKEN) return null;
  try {
    const u = new URL(base);
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !local) return null;
    return new URL('/consulta', u).toString();
  } catch {
    return null;
  }
}

async function llamarScraper(tipo: TipoVehicular, placa: string, clave: string): Promise<ResultadoScraper> {
  const destino = urlScraper();
  if (!destino) return { status: 'REQUIRES_VIEWPORT_FALLBACK', reason: 'scraper_no_configurado' };

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), SCRAPER_TIMEOUT_MS);
  try {
    const res = await fetch(destino, {
      method: 'POST',
      cache: 'no-store',
      signal: controlador.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.CDMX_SCRAPER_TOKEN}`,
      },
      body: JSON.stringify({ tipo, placa, idempotency_key: clave }),
    });
    if (res.status === 401 || res.status === 403) return { status: 'ERROR', reason: 'scraper_no_autorizado' };
    // Una respuesta 5xx del servicio no dice si el portal llegó a procesar la petición.
    if (!res.ok) return { status: 'UNKNOWN', reason: `scraper_http_${res.status}` };

    const cuerpo = (await res.json()) as { status?: string; datos?: unknown; reason?: string };
    if (cuerpo.status === 'OK' && cuerpo.datos && typeof cuerpo.datos === 'object') {
      return { status: 'OK', datos: cuerpo.datos as Record<string, unknown> };
    }
    if (cuerpo.status === 'REQUIRES_VIEWPORT_FALLBACK' || cuerpo.status === 'UNKNOWN' || cuerpo.status === 'ERROR') {
      return { status: cuerpo.status, reason: String(cuerpo.reason ?? cuerpo.status).slice(0, 120) };
    }
    return { status: 'ERROR', reason: 'respuesta_scraper_invalida' };
  } catch (error) {
    const abortado = error instanceof Error && error.name === 'AbortError';
    return { status: 'UNKNOWN', reason: abortado ? 'timeout' : 'red' };
  } finally {
    clearTimeout(temporizador);
  }
}

const ESTADO_DE_RESULTADO: Record<ResultadoScraper['status'], EstadoDb> = {
  OK: 'ok',
  REQUIRES_VIEWPORT_FALLBACK: 'requires_fallback',
  UNKNOWN: 'unknown',
  ERROR: 'error',
};

// ---------------------------------------------------------------------------
// Consulta vehicular con idempotencia
// ---------------------------------------------------------------------------
export async function consultarVehicular(tipo: TipoVehicular, placa: string): Promise<RespuestaTramite> {
  // Sin servicio Python no hay nada que idempotentizar: se va directo al WebView.
  if (!urlScraper()) return fallback(tipo, placa, 'scraper_no_configurado');

  const db = supabaseAdmin();
  // Sin base de datos no se puede garantizar que un reintento no duplique la
  // petición al gobierno, así que no se contacta al portal.
  if (!db) return fallback(tipo, placa, 'supabase_no_configurado');

  const clave = claveIdempotencia(tipo, placa);
  const { data, error } = await db.rpc('ventanilla_reclamar_consulta', {
    p_tipo: tipo,
    p_placa: placa,
    p_key: clave,
  });
  if (error || !data) {
    console.error('ventanilla_reclamar_consulta falló:', error?.code, error?.message);
    return fallback(tipo, placa, 'db_no_disponible');
  }

  const { reclamada, fila } = data as { reclamada: boolean; fila: FilaConsulta };
  // Otra petición ya consultó (o está consultando) el portal: se devuelve lo que hay.
  if (!reclamada) return desdeFila(fila, true);

  const resultado = await llamarScraper(tipo, placa, clave);
  const motivo = resultado.status === 'OK' ? null : resultado.reason.slice(0, 200);

  const { error: errorGuardado } = await db
    .from('consultas_vehiculares')
    .update({
      estado: ESTADO_DE_RESULTADO[resultado.status],
      resultado: resultado.status === 'OK' ? resultado.datos : {},
      motivo,
      fuente: 'scraper',
      consultado_en: new Date().toISOString(),
    })
    .eq('id', fila.id);
  if (errorGuardado) console.error('No se pudo guardar la consulta:', errorGuardado.code, errorGuardado.message);

  const ahora = new Date().toISOString();
  if (resultado.status === 'OK') {
    return { status: 'OK', tipo, placa, datos: resultado.datos, cached: false, actualizadoEn: ahora };
  }
  if (resultado.status === 'REQUIRES_VIEWPORT_FALLBACK') return fallback(tipo, placa, resultado.reason);
  return { status: resultado.status, tipo, placa, motivo: resultado.reason, cached: false, actualizadoEn: ahora };
}

// ---------------------------------------------------------------------------
// Registro de PDFs capturados en el WebView (cliente no confiable)
// ---------------------------------------------------------------------------
export type EntradaRegistro = {
  tipo: 'acta_nacimiento' | 'acta_matrimonio' | 'tenencia_pdf' | 'verificacion_pdf';
  sessionId: string;
  idempotencyKey: string;
  placa?: string;
  folio?: string;
  pdfUrl?: string;
  pdfSha256?: string;
  pdfBytes?: number;
};

const SESION_VALIDA = /^[A-Za-z0-9-]{8,64}$/;
const CLAVE_VALIDA = /^[A-Za-z0-9._-]{16,128}$/;
const FOLIO_VALIDO = /^[A-Za-z0-9._-]{4,64}$/;
const SHA_VALIDO = /^[0-9a-f]{64}$/;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export function validarRegistro(entrada: EntradaRegistro): string | null {
  if (!SESION_VALIDA.test(entrada.sessionId)) return 'sessionId inválido';
  if (!CLAVE_VALIDA.test(entrada.idempotencyKey)) return 'idempotencyKey inválida';
  if (entrada.folio !== undefined && !FOLIO_VALIDO.test(entrada.folio)) return 'folio inválido';
  if (entrada.pdfSha256 !== undefined && !SHA_VALIDO.test(entrada.pdfSha256)) return 'pdfSha256 inválido';
  if (entrada.pdfBytes !== undefined && !(Number.isInteger(entrada.pdfBytes) && entrada.pdfBytes >= 0 && entrada.pdfBytes <= MAX_PDF_BYTES)) {
    return 'pdfBytes inválido';
  }
  if (entrada.pdfUrl !== undefined && !esHostOficial(entrada.pdfUrl)) return 'pdfUrl no pertenece a un portal oficial';
  return null;
}

/**
 * Guarda los metadatos del PDF (nunca el PDF). Reintentar con la misma
 * idempotencyKey no crea otra fila.
 */
export async function registrarDocumento(
  entrada: EntradaRegistro,
): Promise<{ ok: boolean; duplicado?: boolean; motivo?: string }> {
  const db = supabaseAdmin();
  if (!db) return { ok: false, motivo: 'supabase_no_configurado' };

  const completado = Boolean(entrada.pdfUrl || entrada.pdfSha256);
  const { error } = await db.from('tramites_personales').upsert(
    {
      tipo: entrada.tipo,
      placa: entrada.placa ?? null,
      folio: entrada.folio ?? null,
      session_id: entrada.sessionId,
      estado: completado ? 'completado' : 'en_portal',
      idempotency_key: entrada.idempotencyKey,
      pdf_url: entrada.pdfUrl ? urlSinConsulta(entrada.pdfUrl) : null,
      pdf_sha256: entrada.pdfSha256 ?? null,
      pdf_bytes: entrada.pdfBytes ?? null,
    },
    { onConflict: 'idempotency_key', ignoreDuplicates: true },
  );

  if (!error) return { ok: true };
  // 23505 = unique_violation (mismo folio ya registrado): el resultado deseado ya existe.
  if (error.code === '23505') return { ok: true, duplicado: true };
  console.error('registrarDocumento falló:', error.code, error.message);
  return { ok: false, motivo: 'db_error' };
}
