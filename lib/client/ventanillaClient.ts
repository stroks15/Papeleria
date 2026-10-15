'use client';

import { Capacitor, CapacitorHttp, type PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Directory, Filesystem } from '@capacitor/filesystem';
import {
  esHostOficial,
  esUrlDePdf,
  urlSinConsulta,
  type RespuestaTramite,
  type TipoTramite,
} from '@/lib/ventanilla/tipos';

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}

function apiBase(): string {
  const base =
    process.env.NEXT_PUBLIC_ASSISTANT_API_URL ||
    (Capacitor.isNativePlatform() ? 'https://papeleria-arcoiris.vercel.app' : window.location.origin);
  return base.replace(/\/$/, '');
}

function aArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bytesABase64(bytes: Uint8Array): string {
  let binario = '';
  const bloque = 0x8000;
  for (let i = 0; i < bytes.length; i += bloque) {
    binario += String.fromCharCode(...bytes.subarray(i, Math.min(i + bloque, bytes.length)));
  }
  return btoa(binario);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const huella = await crypto.subtle.digest('SHA-256', aArrayBuffer(bytes));
  return Array.from(new Uint8Array(huella))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function urlDeBlob(bytes: Uint8Array): string {
  return URL.createObjectURL(new Blob([aArrayBuffer(bytes)], { type: 'application/pdf' }));
}

// ---------------------------------------------------------------------------
// Preferences: sesión anónima, última placa, historial y cola de registros
// ---------------------------------------------------------------------------
async function leerJson<T>(clave: string, porDefecto: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key: clave });
    return value ? (JSON.parse(value) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

async function escribirJson(clave: string, valor: unknown): Promise<void> {
  try {
    await Preferences.set({ key: clave, value: JSON.stringify(valor) });
  } catch {
    // Almacenamiento lleno o bloqueado: la ventanilla sigue funcionando.
  }
}

export async function obtenerSessionId(): Promise<string> {
  const guardado = await leerJson<string>('ventanilla:session', '');
  if (guardado) return guardado;
  // Reutiliza el id anónimo que ya usan los trámites, si existe.
  let id = '';
  try {
    id = window.localStorage.getItem('papeleria-arcoiris-sesion') || '';
  } catch {
    id = '';
  }
  if (!id) id = crypto.randomUUID();
  await escribirJson('ventanilla:session', id);
  return id;
}

export const leerUltimaPlaca = () => leerJson<string>('ventanilla:placa', '');
export const guardarUltimaPlaca = (placa: string) => escribirJson('ventanilla:placa', placa);

export type DocumentoReciente = {
  tipo: TipoTramite;
  nombre: string;
  bytes: number;
  guardadoEn: string;
};

export const leerHistorial = () => leerJson<DocumentoReciente[]>('ventanilla:historial', []);

async function agregarHistorial(doc: DocumentoReciente): Promise<DocumentoReciente[]> {
  const actual = await leerHistorial();
  const nuevo = [doc, ...actual].slice(0, 5);
  await escribirJson('ventanilla:historial', nuevo);
  return nuevo;
}

// ---------------------------------------------------------------------------
// API de la ventanilla
// ---------------------------------------------------------------------------
const TIMEOUT_API_MS = 35_000;

export async function consultarApi(tipo: TipoTramite, placa?: string): Promise<RespuestaTramite> {
  const controlador = new AbortController();
  const temporizador = window.setTimeout(() => controlador.abort(), TIMEOUT_API_MS);
  // La barra final es obligatoria: next.config usa trailingSlash y una redirección
  // 308 entre orígenes (APK -> Vercel) la bloquearía CORS.
  const consulta = placa ? `?placa=${encodeURIComponent(placa)}` : '';
  try {
    const res = await fetch(`${apiBase()}/api/tramites/${tipo}/${consulta}`, {
      signal: controlador.signal,
      headers: { Accept: 'application/json' },
    });
    const cuerpo = (await res.json()) as RespuestaTramite;
    if (!cuerpo || typeof cuerpo.status !== 'string') throw new Error('respuesta_invalida');
    return cuerpo;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('El servidor tardó demasiado en responder. Inténtalo de nuevo en unos minutos.');
    }
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión a Internet.');
  } finally {
    window.clearTimeout(temporizador);
  }
}

type CuerpoRegistro = {
  accion: 'registrar';
  sessionId: string;
  idempotencyKey: string;
  variante?: 'nacimiento' | 'matrimonio';
  placa?: string;
  pdfUrl?: string;
  pdfSha256?: string;
  pdfBytes?: number;
};

type RegistroPendiente = { tipo: TipoTramite; cuerpo: CuerpoRegistro };
const CLAVE_COLA = 'ventanilla:cola';

/** Devuelve 'enviado', 'descartado' (el servidor lo rechazó: no se reintenta) o 'reintentar'. */
async function enviarRegistro(pendiente: RegistroPendiente): Promise<'enviado' | 'descartado' | 'reintentar'> {
  try {
    const res = await fetch(`${apiBase()}/api/tramites/${pendiente.tipo}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendiente.cuerpo),
    });
    if (res.ok) return 'enviado';
    return res.status >= 500 ? 'reintentar' : 'descartado';
  } catch {
    return 'reintentar';
  }
}

/**
 * Guarda los metadatos en Supabase (vía API). Si no hay red, los deja en cola y
 * se reenvían después con la MISMA idempotencyKey, así que nunca se duplican.
 */
export async function registrarDocumento(tipo: TipoTramite, cuerpo: CuerpoRegistro): Promise<boolean> {
  const resultado = await enviarRegistro({ tipo, cuerpo });
  if (resultado === 'reintentar') {
    const cola = await leerJson<RegistroPendiente[]>(CLAVE_COLA, []);
    await escribirJson(CLAVE_COLA, [...cola, { tipo, cuerpo }].slice(-20));
  }
  return resultado === 'enviado';
}

export async function vaciarCola(): Promise<void> {
  const cola = await leerJson<RegistroPendiente[]>(CLAVE_COLA, []);
  if (!cola.length) return;
  const restantes: RegistroPendiente[] = [];
  for (const pendiente of cola) {
    if ((await enviarRegistro(pendiente)) === 'reintentar') restantes.push(pendiente);
  }
  await escribirJson(CLAVE_COLA, restantes);
}

// ---------------------------------------------------------------------------
// PDF: descarga, verificación, guardado local
// ---------------------------------------------------------------------------
export type PdfDescargado = {
  bytes: Uint8Array;
  base64: string;
  sha256: string;
  nombre: string;
  uri?: string;
};

function nombreDePdf(url: string, tipo: TipoTramite): string {
  const ultimo = decodeURIComponent(new URL(url).pathname.split('/').pop() || '');
  const limpio = ultimo.replace(/[^A-Za-z0-9._-]/g, '_');
  if (/\.pdf$/i.test(limpio) && limpio.length > 4) return limpio.slice(-80);
  return `${tipo}-${new Date().toISOString().slice(0, 10)}.pdf`;
}

export async function descargarPdf(url: string, tipo: TipoTramite): Promise<PdfDescargado> {
  if (!esHostOficial(url)) throw new Error('La dirección del PDF no pertenece a un portal oficial.');

  let base64: string;
  if (Capacitor.isNativePlatform()) {
    // HTTP nativo: no depende de CORS. No comparte las cookies del WebView aislado,
    // así que un PDF que exija sesión se detecta abajo y se informa a la persona.
    const res = await CapacitorHttp.get({
      url,
      responseType: 'blob',
      headers: { Accept: 'application/pdf' },
      connectTimeout: 15_000,
      readTimeout: 30_000,
    });
    if (res.status !== 200 || typeof res.data !== 'string') {
      throw new Error(`El portal respondió con el código ${res.status}.`);
    }
    base64 = res.data;
  } else {
    const res = await fetch(url, { headers: { Accept: 'application/pdf' } });
    if (!res.ok) throw new Error(`El portal respondió con el código ${res.status}.`);
    base64 = bytesABase64(new Uint8Array(await res.arrayBuffer()));
  }

  const bytes = base64ABytes(base64);
  const cabecera = String.fromCharCode(...bytes.subarray(0, 5));
  if (cabecera !== '%PDF-') throw new Error('El portal no entregó un PDF (puede requerir tu sesión).');

  const nombre = nombreDePdf(url, tipo);
  const resultado: PdfDescargado = { bytes, base64, sha256: await sha256Hex(bytes), nombre };

  try {
    const guardado = await Filesystem.writeFile({
      path: `ventanilla/${nombre}`,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    });
    resultado.uri = guardado.uri;
  } catch {
    // Sin copia local el PDF aún se puede ver y guardar en Descargas desde la memoria.
  }
  return resultado;
}

export type DatosCaptura = {
  tipo: TipoTramite;
  url: string;
  pdf: PdfDescargado;
  claveIntento: string;
  placa?: string;
  variante?: 'nacimiento' | 'matrimonio';
};

/** Registra los metadatos del PDF y lo anota en el historial local. */
export async function confirmarCaptura(datos: DatosCaptura): Promise<{ registrado: boolean; historial: DocumentoReciente[] }> {
  const registrado = await registrarDocumento(datos.tipo, {
    accion: 'registrar',
    sessionId: await obtenerSessionId(),
    idempotencyKey: datos.claveIntento,
    placa: datos.placa,
    variante: datos.variante,
    pdfUrl: urlSinConsulta(datos.url),
    pdfSha256: datos.pdf.sha256,
    pdfBytes: datos.pdf.bytes.byteLength,
  });
  const historial = await agregarHistorial({
    tipo: datos.tipo,
    nombre: datos.pdf.nombre,
    bytes: datos.pdf.bytes.byteLength,
    guardadoEn: new Date().toISOString(),
  });
  return { registrado, historial };
}

// ---------------------------------------------------------------------------
// WebView embebido (@capacitor/inappbrowser)
// ---------------------------------------------------------------------------
// Se declara solo lo que se usa y se convierte la importación a este tipo para que
// un cambio menor en las definiciones del plugin no rompa la compilación.
type InAppBrowserApi = {
  openInWebView(opciones: { url: string; options?: Record<string, unknown> }): Promise<void>;
  close(): Promise<void>;
  addListener(
    evento: 'browserClosed' | 'browserPageLoaded' | 'browserPageNavigationCompleted',
    callback: (info: { url?: string }) => void,
  ): Promise<PluginListenerHandle>;
};

export type SesionPortal = {
  /** Cierra el WebView y quita los listeners. */
  cerrar(): Promise<void>;
  /** Solo quita los listeners (cuando el WebView ya se cerró). */
  liberar(): Promise<void>;
};

export type EventosPortal = {
  /** El portal navegó a la URL final de un PDF. */
  onPdf(url: string): void;
  /** La persona cerró el WebView (o se cerró). */
  onCerrado(): void;
  onNavegacion?(url: string): void;
};

export async function abrirPortal(url: string, eventos: EventosPortal): Promise<SesionPortal> {
  if (!esHostOficial(url)) throw new Error('El dominio no está permitido para sitios oficiales.');

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No hay conexión a Internet. Conéctate e inténtalo de nuevo.');
  }

  if (!Capacitor.isNativePlatform()) {
    // En el navegador no se puede observar la navegación de otra pestaña.
    window.open(url, '_blank', 'noopener,noreferrer');
    return { cerrar: async () => undefined, liberar: async () => undefined };
  }

  const { InAppBrowser } = await import('@capacitor/inappbrowser');
  const api = InAppBrowser as unknown as InAppBrowserApi;
  const manejadores: PluginListenerHandle[] = [];

  const liberar = async () => {
    const pendientes = manejadores.splice(0, manejadores.length);
    await Promise.all(pendientes.map((m) => m.remove().catch(() => undefined)));
  };

  manejadores.push(
    await api.addListener('browserPageNavigationCompleted', (info) => {
      const destino = info?.url;
      if (!destino) return;
      if (esUrlDePdf(destino)) eventos.onPdf(destino);
      else eventos.onNavegacion?.(destino);
    }),
    await api.addListener('browserClosed', () => {
      void liberar();
      eventos.onCerrado();
    }),
  );

  try {
    await api.openInWebView({
      url,
      options: {
        showURL: true,
        showToolbar: true,
        showNavigationButtons: true,
        closeButtonText: 'Cerrar',
        android: { allowZoom: true, hardwareBack: true },
      },
    });
  } catch (error) {
    await liberar();
    throw error;
  }

  return {
    cerrar: async () => {
      try {
        await api.close();
      } finally {
        await liberar();
      }
    },
    liberar,
  };
}
