import { jsonConCors, preflight } from '@/lib/server/cors';
import {
  consultarVehicular,
  registrarDocumento,
  validarRegistro,
  type EntradaRegistro,
} from '@/lib/server/ventanilla';
import {
  URLS_OFICIALES,
  esPlacaValida,
  esTipoTramite,
  normalizarPlaca,
  type RespuestaTramite,
} from '@/lib/ventanilla/tipos';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Solo se cachea en el Edge lo que ya es definitivo. Pendiente/unknown/error nunca:
// de lo contrario un timeout quedaría "pegado" para todos los usuarios.
const CACHE_OK = 'public, s-maxage=300, stale-while-revalidate=3600';
const CACHE_ESTATICO = 'public, s-maxage=3600, stale-while-revalidate=86400';
const SIN_CACHE = 'no-store';

type Contexto = { params: { tipo: string } };

export async function OPTIONS(req: Request) {
  return preflight(req);
}

/**
 * GET /api/tramites/tenencia?placa=ABC1234
 * GET /api/tramites/verificacion?placa=ABC1234
 * GET /api/tramites/acta           -> siempre REQUIRES_VIEWPORT_FALLBACK (Llave CDMX)
 */
export async function GET(req: Request, { params }: Contexto) {
  const tipo = params.tipo;
  if (!esTipoTramite(tipo)) {
    return jsonConCors(req, { status: 'ERROR', motivo: 'tipo_desconocido' }, { status: 404, headers: { 'Cache-Control': SIN_CACHE } });
  }

  if (tipo === 'acta') {
    const cuerpo: RespuestaTramite = {
      status: 'REQUIRES_VIEWPORT_FALLBACK',
      tipo,
      urlOficial: URLS_OFICIALES.acta,
      motivo: 'llave_cdmx_requerida',
    };
    return jsonConCors(req, cuerpo, { headers: { 'Cache-Control': CACHE_ESTATICO } });
  }

  const placa = normalizarPlaca(new URL(req.url).searchParams.get('placa'));
  if (!esPlacaValida(placa)) {
    return jsonConCors(
      req,
      { status: 'ERROR', tipo, motivo: 'placa_invalida' },
      { status: 400, headers: { 'Cache-Control': SIN_CACHE } },
    );
  }

  const respuesta = await consultarVehicular(tipo, placa);
  return jsonConCors(req, respuesta, {
    headers: { 'Cache-Control': respuesta.status === 'OK' ? CACHE_OK : SIN_CACHE },
  });
}

/**
 * POST /api/tramites/{tipo}  { accion: 'registrar', ... }
 * Guarda los metadatos del PDF capturado en el WebView (nunca el PDF).
 */
export async function POST(req: Request, { params }: Contexto) {
  const tipo = params.tipo;
  const sinCache = { 'Cache-Control': SIN_CACHE };
  if (!esTipoTramite(tipo)) {
    return jsonConCors(req, { ok: false, motivo: 'tipo_desconocido' }, { status: 404, headers: sinCache });
  }

  let cuerpo: Record<string, unknown>;
  try {
    const crudo = await req.text();
    if (crudo.length > 4096) {
      return jsonConCors(req, { ok: false, motivo: 'solicitud_demasiado_grande' }, { status: 413, headers: sinCache });
    }
    const parseado: unknown = JSON.parse(crudo);
    if (!parseado || typeof parseado !== 'object' || Array.isArray(parseado)) throw new Error('forma');
    cuerpo = parseado as Record<string, unknown>;
  } catch {
    return jsonConCors(req, { ok: false, motivo: 'json_invalido' }, { status: 400, headers: sinCache });
  }
  if (cuerpo.accion !== 'registrar') {
    return jsonConCors(req, { ok: false, motivo: 'accion_desconocida' }, { status: 400, headers: sinCache });
  }

  const texto = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined);

  let tipoDb: EntradaRegistro['tipo'];
  let placa: string | undefined;
  if (tipo === 'acta') {
    if (cuerpo.variante === 'nacimiento') tipoDb = 'acta_nacimiento';
    else if (cuerpo.variante === 'matrimonio') tipoDb = 'acta_matrimonio';
    else return jsonConCors(req, { ok: false, motivo: 'variante_invalida' }, { status: 400, headers: sinCache });
  } else {
    placa = normalizarPlaca(cuerpo.placa);
    if (!esPlacaValida(placa)) {
      return jsonConCors(req, { ok: false, motivo: 'placa_invalida' }, { status: 400, headers: sinCache });
    }
    tipoDb = tipo === 'tenencia' ? 'tenencia_pdf' : 'verificacion_pdf';
  }

  const entrada: EntradaRegistro = {
    tipo: tipoDb,
    sessionId: texto(cuerpo.sessionId) ?? '',
    idempotencyKey: texto(cuerpo.idempotencyKey) ?? '',
    placa,
    folio: texto(cuerpo.folio),
    pdfUrl: texto(cuerpo.pdfUrl),
    pdfSha256: texto(cuerpo.pdfSha256),
    pdfBytes: typeof cuerpo.pdfBytes === 'number' ? cuerpo.pdfBytes : undefined,
  };

  const problema = validarRegistro(entrada);
  if (problema) {
    return jsonConCors(req, { ok: false, motivo: problema }, { status: 400, headers: sinCache });
  }

  const resultado = await registrarDocumento(entrada);
  return jsonConCors(
    req,
    resultado.ok ? { ok: true, duplicado: resultado.duplicado ?? false } : { ok: false, motivo: resultado.motivo },
    { status: resultado.ok ? 200 : 503, headers: sinCache },
  );
}
