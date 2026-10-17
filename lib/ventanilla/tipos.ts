// Tipos y utilidades compartidos entre el servidor (ruta API) y el cliente (dashboard).
// No importa nada específico de Node ni del navegador.

export type TipoVehicular = 'tenencia' | 'verificacion';
export type TipoTramite = TipoVehicular | 'acta';
export type VarianteActa = 'nacimiento' | 'matrimonio';

export const TIPOS_TRAMITE: readonly TipoTramite[] = ['tenencia', 'verificacion', 'acta'];

export type EstadoApi = 'OK' | 'PENDING' | 'UNKNOWN' | 'REQUIRES_VIEWPORT_FALLBACK' | 'ERROR';

export type RespuestaTramite = {
  status: EstadoApi;
  tipo: TipoTramite;
  placa?: string;
  datos?: Record<string, unknown>;
  /** Portal oficial que debe abrirse en el WebView cuando status = REQUIRES_VIEWPORT_FALLBACK. */
  urlOficial?: string;
  motivo?: string;
  /** true si la respuesta salió de la base de datos y no se contactó al portal. */
  cached?: boolean;
  actualizadoEn?: string;
};

export const URLS_OFICIALES: Record<TipoTramite, string> = {
  tenencia: 'https://data.finanzas.cdmx.gob.mx/Front_ten/',
  verificacion: 'https://sedema.cdmx.gob.mx/servicios/servicio/tramites-y-servicios-de-verificacion-vehicular',
  // Requiere iniciar sesión con Llave CDMX.
  acta: 'https://actas.cdmx.gob.mx/',
};

// Lista cerrada (no "cualquier .gob.mx"): hay sitios falsos de actas que imitan estos portales.
export const HOSTS_OFICIALES: readonly string[] = [
  'actas.cdmx.gob.mx',
  'data.finanzas.cdmx.gob.mx',
  'sedema.cdmx.gob.mx',
  'www.sedema.cdmx.gob.mx',
];

const PLACA_VALIDA = /^[A-Z0-9]{5,8}$/;

/** Quita acentos, espacios y símbolos; deja letras y números en mayúsculas. */
export function normalizarPlaca(cruda: unknown): string {
  return String(cruda ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function esPlacaValida(placa: string): boolean {
  return PLACA_VALIDA.test(placa);
}

export function esTipoTramite(valor: string): valor is TipoTramite {
  return (TIPOS_TRAMITE as readonly string[]).includes(valor);
}

export function esTipoVehicular(tipo: TipoTramite): tipo is TipoVehicular {
  return tipo === 'tenencia' || tipo === 'verificacion';
}

export function esHostOficial(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_OFICIALES.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Portales de gobierno/CFE que los trámites del menú abren dentro de la app (solo https). */
export function esHostGubernamental(url: string): boolean {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase().replace(/\.$/, '');
    return u.protocol === 'https:' && (h.endsWith('.gob.mx') || h === 'cfe.mx' || h.endsWith('.cfe.mx'));
  } catch {
    return false;
  }
}

/**
 * ¿Es la URL final de un PDF generado por un portal oficial?
 * Criterio estricto a propósito: una coincidencia falsa cerraría el WebView antes de tiempo.
 */
export function esUrlDePdf(url: string): boolean {
  if (!esHostOficial(url)) return false;
  const u = new URL(url);
  return /\.pdf$/i.test(u.pathname) || /(?:^|[?&])(?:format|formato|tipo|type)=pdf(?:&|$)/i.test(u.search);
}

/** Origen + ruta: los parámetros de consulta pueden traer tokens de sesión y no se guardan. */
export function urlSinConsulta(url: string): string {
  const u = new URL(url);
  return u.origin + u.pathname;
}
