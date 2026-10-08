'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';

type ExternalBrowserPlugin = {
  open(options: { url: string }): Promise<void>;
};

const ExternalBrowser = registerPlugin<ExternalBrowserPlugin>('ExternalBrowser');

const ALLOWED_HOSTS = [
  'app.cfe.mx',
  'cfe.mx',
  'data.finanzas.cdmx.gob.mx',
  'aplicaciones.sacmex.cdmx.gob.mx',
  'tenencia.edomex.gob.mx',
  'infracciones.ssedomex.gob.mx',
];

function hostPermitido(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.includes(host) || host.endsWith('.gob.mx') || host.endsWith('.cfe.mx');
}

function validarUrl(url: string): URL {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('El sitio oficial debe utilizar HTTPS.');
  if (!hostPermitido(parsed.hostname)) throw new Error('El dominio no está permitido para sitios oficiales.');
  return parsed;
}

/**
 * Abre el trámite en el navegador externo del teléfono.
 * No usa WebView/InAppBrowser y nunca intenta rellenar campos automáticamente.
 */
export async function abrirSitioOficial(url: string): Promise<void> {
  const parsed = validarUrl(url);

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No hay conexión a Internet. Conéctate e inténtalo de nuevo.');
  }

  if (Capacitor.isNativePlatform()) {
    await ExternalBrowser.open({ url: parsed.toString() });
    return;
  }

  window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
}

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}
