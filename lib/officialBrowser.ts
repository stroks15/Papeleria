'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import type { CampoAutorrelleno } from '@/lib/tramites';

type ExternalBrowserPlugin = {
  open(options: { url: string }): Promise<void>;
};

type OfficialWebViewPlugin = {
  open(options: {
    url: string;
    title?: string;
    fields?: CampoAutorrelleno[];
  }): Promise<{ opened: boolean }>;
};

const ExternalBrowser = registerPlugin<ExternalBrowserPlugin>('ExternalBrowser');
const OfficialWebView = registerPlugin<OfficialWebViewPlugin>('OfficialWebView');

const ALLOWED_HOSTS = [
  'app.cfe.mx',
  'cfe.mx',
  'data.finanzas.cdmx.gob.mx',
  'aplicaciones.sacmex.cdmx.gob.mx',
  'tenencia.edomex.gob.mx',
  'infracciones.ssedomex.gob.mx',
];

export type OpcionesSitioOficial = {
  /** Título que se muestra en la barra del visor interno. */
  titulo?: string;
  /** Datos capturados por la persona para intentar autorrellenar el portal (solo APK). */
  campos?: CampoAutorrelleno[];
};

export type ResultadoApertura = {
  /** interno = visor dentro de la APK · externo = navegador del teléfono · web = pestaña nueva del navegador */
  modo: 'interno' | 'externo' | 'web';
  /** true si se enviaron datos al visor para intentar el autorrelleno. */
  autorrelleno: boolean;
};

function hostPermitido(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.includes(host) || host.endsWith('.gob.mx') || host.endsWith('.cfe.mx');
}

function validarUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('La dirección del sitio oficial no es válida.');
  }
  if (parsed.protocol !== 'https:') throw new Error('El sitio oficial debe utilizar HTTPS.');
  if (!hostPermitido(parsed.hostname)) throw new Error('El dominio no está permitido para sitios oficiales.');
  return parsed;
}

function esPluginNoDisponible(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = String((error as { message?: string } | null)?.message ?? '');
  return code === 'UNIMPLEMENTED' || /not implemented|not available/i.test(message);
}

/**
 * Abre el trámite oficial.
 *
 * - En la APK: dentro de la app, con un visor propio que intenta autorrellenar el formulario
 *   con los datos ya capturados. No se puede usar @capacitor/browser porque abre Custom Tabs,
 *   que no permiten inyectar scripts.
 * - Si la APK instalada es una versión anterior sin el visor: cae al navegador del teléfono.
 * - En web normal: pestaña nueva.
 *
 * Nunca se rellena ni se evade un CAPTCHA, y el formulario nunca se envía solo.
 */
export async function abrirSitioOficial(
  url: string,
  opciones: OpcionesSitioOficial = {},
): Promise<ResultadoApertura> {
  const parsed = validarUrl(url);

  // No se usa navigator.onLine: en el WebView de Android suele ser poco confiable. El visor nativo ya maneja los errores de red.

  if (!Capacitor.isNativePlatform()) {
    window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
    return { modo: 'web', autorrelleno: false };
  }

  const campos = (opciones.campos ?? []).filter((campo) => campo.value.trim().length > 0);

  try {
    await OfficialWebView.open({
      url: parsed.toString(),
      title: opciones.titulo,
      fields: campos,
    });
    return { modo: 'interno', autorrelleno: campos.length > 0 };
  } catch (error) {
    if (!esPluginNoDisponible(error)) {
      throw new Error('No se pudo abrir el sitio oficial dentro de la app. Inténtalo de nuevo.');
    }
  }

  // APK antigua sin visor interno: último recurso, navegador externo (sin autorrelleno).
  try {
    await ExternalBrowser.open({ url: parsed.toString() });
    return { modo: 'externo', autorrelleno: false };
  } catch {
    throw new Error('No se pudo abrir el sitio oficial. Verifica que tu teléfono tenga un navegador.');
  }
}

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}
