'use client';

import { Browser } from '@capacitor/browser';
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
  return (
    ALLOWED_HOSTS.includes(host) ||
    host.endsWith('.gob.mx') ||
    host.endsWith('.cfe.mx')
  );
}

/**
 * Abre un portal oficial con el navegador in-app oficial de Capacitor.
 *
 * En Android esto usa una pestaña del sistema dentro del contexto de la APK
 * (Custom Tab), por lo que al cerrarla el usuario vuelve a la actividad de
 * Papelería Arcoíris. No usa window.open ni Chrome externo directamente.
 *
 * La validación evita que un dato manipulado termine abriendo un dominio
 * arbitrario desde esta función.
 */
export async function abrirSitioOficial(url: string): Promise<void> {
  const parsed = new URL(url);

  if (parsed.protocol !== 'https:') {
    throw new Error('El sitio oficial debe utilizar HTTPS.');
  }

  if (!hostPermitido(parsed.hostname)) {
    throw new Error('El dominio no está permitido para sitios oficiales.');
  }

  await Browser.open({
    url: parsed.toString(),
    toolbarColor: '#1F4E79',
  });
}

/**
 * Permite detectar cuándo el usuario cerró el navegador in-app.
 * El estado del trámite se guarda antes de abrirlo, por lo que aquí solo
 * notificamos a la interfaz para que pueda refrescar o mostrar un mensaje.
 */
export async function escucharCierreSitioOficial(
  onFinished: () => void,
): Promise<() => Promise<void>> {
  const handle = await Browser.addListener('browserFinished', onFinished);
  return () => handle.remove();
}

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}
