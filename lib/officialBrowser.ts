'use client';

import { InAppBrowser, DefaultWebViewOptions } from '@capacitor/inappbrowser';
import { Capacitor } from '@capacitor/core';

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

export async function abrirSitioOficial(url: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('El sitio oficial debe utilizar HTTPS.');
  if (!hostPermitido(parsed.hostname)) throw new Error('El dominio no está permitido para sitios oficiales.');

  if (!Capacitor.isNativePlatform()) {
    window.location.assign(parsed.toString());
    return;
  }

  await InAppBrowser.openInWebView({
    url: parsed.toString(),
    options: {
      ...DefaultWebViewOptions,
      showURL: true,
      showToolbar: true,
      closeButtonText: 'Volver a Papelería',
      mediaPlaybackRequiresUserAction: true,
    },
  });
}

export async function escucharCierreSitioOficial(
  onFinished: () => void,
): Promise<() => Promise<void>> {
  const handle = await InAppBrowser.addListener('browserClosed', onFinished);
  return () => handle.remove();
}

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}