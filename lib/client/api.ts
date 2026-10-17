'use client';

import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Cliente único para hablar con el servidor (Vercel) desde la web y desde la APK.
 * Antes cada pantalla armaba su propia URL y mostraba el mismo mensaje genérico
 * ("sin conexión") sin importar la causa real.
 */

const CLAVE_SERVIDOR = 'arcoiris:servidor';

export type CausaError = 'sin-red' | 'servidor' | 'tiempo' | 'http' | 'respuesta';

export class ApiError extends Error {
  constructor(public causa: CausaError, mensaje: string, public status?: number) {
    super(mensaje);
    this.name = 'ApiError';
  }
}

function normalizar(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function urlValida(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' && !!u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** Servidor que el usuario configuró a mano en la APK (si lo hizo). */
export function servidorGuardado(): string {
  try {
    return window.localStorage.getItem(CLAVE_SERVIDOR) || '';
  } catch {
    return '';
  }
}

export function guardarServidor(url: string): void {
  try {
    if (!url.trim()) window.localStorage.removeItem(CLAVE_SERVIDOR);
    else if (urlValida(url)) window.localStorage.setItem(CLAVE_SERVIDOR, normalizar(url));
  } catch {
    /* sin almacenamiento: se usa el valor por defecto */
  }
}

export function apiBase(): string {
  const guardado = servidorGuardado();
  if (guardado && urlValida(guardado)) return normalizar(guardado);
  const configurado = process.env.NEXT_PUBLIC_ASSISTANT_API_URL;
  if (configurado) return normalizar(configurado);
  if (Capacitor.isNativePlatform()) return 'https://papeleria-flax.vercel.app';
  return window.location.origin;
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Siempre con barra final: next.config usa trailingSlash y un 308 rompe CORS. */
function rutaCompleta(ruta: string): string {
  const [sinConsulta, consulta = ''] = ruta.split('?');
  const limpia = '/' + sinConsulta.replace(/^\/+/, '').replace(/\/*$/, '') + '/';
  return apiBase() + limpia + (consulta ? '?' + consulta : '');
}

type Opciones = { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number };

async function viaNativa(url: string, opciones: Opciones, timeoutMs: number): Promise<{ status: number; texto: string }> {
  const r = await CapacitorHttp.request({
    url,
    method: opciones.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    data: opciones.body,
    connectTimeout: 15000,
    readTimeout: timeoutMs,
    responseType: 'text',
  });
  return { status: r.status, texto: typeof r.data === 'string' ? r.data : JSON.stringify(r.data) };
}

/**
 * Llama a la API y devuelve el JSON. Lanza ApiError con un mensaje que dice
 * qué falló de verdad (red, servidor, tiempo, HTTP o respuesta no válida).
 */
export async function llamarApi<T>(ruta: string, opciones: Opciones = {}): Promise<T> {
  const url = rutaCompleta(ruta);
  const timeoutMs = opciones.timeoutMs ?? 30000;
  let status = 0;
  let texto = '';

  const controlador = new AbortController();
  const temporizador = window.setTimeout(() => controlador.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: opciones.method ?? 'GET',
      headers: opciones.body !== undefined ? { 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
      signal: controlador.signal,
    });
    status = res.status;
    texto = await res.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError('tiempo', 'El servidor tardó demasiado en responder. Inténtalo de nuevo.');
    }
    // fetch falla igual por falta de red, DNS, certificado o CORS. En la APK se
    // reintenta con HTTP nativo (sin CORS) para distinguir un bloqueo del navegador.
    if (Capacitor.isNativePlatform()) {
      try {
        const r = await viaNativa(url, opciones, timeoutMs);
        status = r.status;
        texto = r.texto;
      } catch {
        throw new ApiError('servidor', 'No se pudo llegar al servidor (' + hostDe(url) + '). Revisa tu Internet o la dirección del servidor.');
      }
    } else {
      throw new ApiError('sin-red', 'No hay conexión con el servidor. Revisa tu Internet e inténtalo de nuevo.');
    }
  } finally {
    window.clearTimeout(temporizador);
  }

  let datos: unknown;
  try {
    datos = JSON.parse(texto);
  } catch {
    if (status === 404) {
      throw new ApiError('http', 'La dirección ' + hostDe(url) + ' no tiene esta función (404). Revisa la dirección del servidor.', 404);
    }
    throw new ApiError('respuesta', status >= 500 ? 'El servidor no está disponible en este momento.' : 'El servidor devolvió una respuesta inválida.', status);
  }
  return datos as T;
}

/** Comprueba que el servidor configurado responde. Para la pantalla de ayuda de conexión. */
export async function probarServidor(): Promise<{ ok: boolean; mensaje: string }> {
  try {
    const r = await llamarApi<{ ok?: boolean }>('/api/health', { timeoutMs: 12000 });
    return r.ok ? { ok: true, mensaje: 'Conectado a ' + hostDe(apiBase()) } : { ok: false, mensaje: 'El servidor respondió, pero no es el de Papelería Arcoíris.' };
  } catch (error) {
    return { ok: false, mensaje: error instanceof Error ? error.message : 'No se pudo comprobar el servidor.' };
  }
}
