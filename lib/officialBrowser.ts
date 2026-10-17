'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';
import { abrirPortal, type EventosPortal } from '@/lib/client/ventanillaClient';

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
 * Abre el trámite DENTRO de la app (navegador integrado, igual que la Ventanilla).
 * Si el navegador integrado falla, cae al navegador del teléfono. Nunca rellena
 * campos automáticamente. `eventos` permite saber en qué página está la persona.
 */
export async function abrirSitioOficial(url: string, eventos?: Partial<EventosPortal>): Promise<void> {
  const parsed = validarUrl(url);

  if (Capacitor.isNativePlatform()) {
    try {
      await abrirPortal(parsed.toString(), {
        onPdf: eventos?.onPdf ?? (() => undefined),
        onCerrado: eventos?.onCerrado ?? (() => undefined),
        onNavegacion: eventos?.onNavegacion,
      });
      return;
    } catch {
      await ExternalBrowser.open({ url: parsed.toString() });
      return;
    }
  }

  window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
}

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}
