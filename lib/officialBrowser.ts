'use client';

import { Capacitor } from '@capacitor/core';
import { InAppBrowser } from '@capawesome/capacitor-in-app-browser';

const ALLOWED_HOSTS = [
  'app.cfe.mx',
  'cfe.mx',
  'data.finanzas.cdmx.gob.mx',
  'aplicaciones.sacmex.cdmx.gob.mx',
  'tenencia.edomex.gob.mx',
  'infracciones.ssedomex.gob.mx',
];

export type AutofillValues = Record<string, string>;

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

function createAutofillScript(values: AutofillValues): string {
  const payload = JSON.stringify(values);
  return [
    '(function(){',
    'const values=' + payload + ';',
    'const aliases={',
    'nombreServicio:["nombreServicio","nombre","nombre-del-servicio","txtNombreServicio"],',
    'numeroServicio:["numeroServicio","numero","numeroServicioCFE","txtNumeroServicio","serviceNumber"],',
    'placa:["placa","placaVehiculo","txtPlaca","numeroPlaca"],',
    'cuenta:["cuenta","numeroCuenta","txtCuenta","cuentaSacmex"],',
    'curp:["curp","CURP","txtCurp"],',
    'nombreCompleto:["nombreCompleto","nombre","fullName"],',
    'email:["email","correo","correoElectronico","mail"],',
    'direccion:["direccion","domicilio","address"]',
    '};',
    'function norm(v){return String(v||"").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").replace(/[^a-z0-9]/g,"");}',
    'function find(key){',
    ' const wanted=(aliases[key]||[key]).map(norm);',
    ' const elements=Array.from(document.querySelectorAll("input,textarea,select"));',
    ' return elements.find(function(el){',
    '   const attrs=[el.id,el.getAttribute("name"),el.getAttribute("placeholder"),el.getAttribute("aria-label")].map(norm);',
    '   return attrs.some(function(a){return wanted.some(function(w){return a && (a===w || a.indexOf(w)>=0 || w.indexOf(a)>=0);});});',
    ' });',
    '}',
    'function setValue(el,value){',
    ' try {',
    '   const proto=el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;',
    '   const descriptor=Object.getOwnPropertyDescriptor(proto,"value");',
    '   if(descriptor && descriptor.set) descriptor.set.call(el,String(value)); else el.value=String(value);',
    ' } catch(e){el.value=String(value);}',
    ' el.dispatchEvent(new Event("input",{bubbles:true}));',
    ' el.dispatchEvent(new Event("change",{bubbles:true}));',
    ' el.dispatchEvent(new Event("blur",{bubbles:true}));',
    '}',
    'function apply(){',
    ' Object.keys(values).forEach(function(key){',
    '   const value=values[key]; if(value===undefined || value===null || value==="") return;',
    '   const el=find(key); if(el) setValue(el,value);',
    ' });',
    ' return Object.keys(values).filter(function(k){return !!find(k);});',
    '}',
    'let attempts=0;',
    'const timer=setInterval(function(){attempts++; const done=apply(); if(attempts>=30 || done.length>=Object.keys(values).length) clearInterval(timer);},500);',
    'apply();',
    '})();',
  ].join('');
}

export async function abrirSitioOficial(url: string, prefill: AutofillValues = {}): Promise<void> {
  const parsed = validarUrl(url);

  if (!Capacitor.isNativePlatform()) {
    window.location.assign(parsed.toString());
    return;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('No hay conexión a Internet. Conéctate e inténtalo de nuevo.');
  }

  let pageLoaded = false;
  let closedHandle: { remove: () => Promise<void> } | null = null;
  let navigationHandle: { remove: () => Promise<void> } | null = null;
  let loadedHandle: { remove: () => Promise<void> } | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const cleanup = async () => {
    if (timeoutId) clearTimeout(timeoutId);
    if (navigationHandle) await navigationHandle.remove();
    if (loadedHandle) await loadedHandle.remove();
    if (closedHandle) await closedHandle.remove();
    navigationHandle = null;
    loadedHandle = null;
    closedHandle = null;
  };

  navigationHandle = await InAppBrowser.addListener('browserNavigationCompleted', async (event) => {
    try {
      const nextUrl = new URL(event.url);
      if (!hostPermitido(nextUrl.hostname)) return;
      await InAppBrowser.executeScript({ script: createAutofillScript(prefill) });
    } catch (error) {
      console.warn('Autollenado del portal no disponible:', error);
    }
  });

  loadedHandle = await InAppBrowser.addListener('browserPageLoaded', async () => {
    pageLoaded = true;
    try {
      await InAppBrowser.executeScript({ script: createAutofillScript(prefill) });
    } catch (error) {
      console.warn('Autollenado inicial no disponible:', error);
    }
    try {
      await InAppBrowser.show();
    } catch (error) {
      console.warn('No se pudo mostrar el portal in-app:', error);
    }
  });

  closedHandle = await InAppBrowser.addListener('browserClosed', async () => {
    await cleanup();
  });

  try {
    await InAppBrowser.openInWebView({
      url: parsed.toString(),
      visible: false,
      toolbar: {
        backgroundColor: '#3F5EFB',
        color: '#FFFFFF',
        showNavigationButtons: true,
        closeButtonText: 'Volver a Papelería',
      },
      android: {
        hardwareBackButton: true,
        allowZoom: true,
      },
    });

    timeoutId = setTimeout(async () => {
      if (pageLoaded) return;
      try { await InAppBrowser.close(); } catch {}
      await cleanup();
    }, 20000);
  } catch (error) {
    await cleanup();
    throw new Error('No se pudo abrir el portal oficial. Verifica tu conexión e inténtalo de nuevo.');
  }
}
export async function escucharCierreSitioOficial(
  onFinished: () => void,
): Promise<() => Promise<void>> {
  const handle = await InAppBrowser.addListener('browserClosed', onFinished);
  return async () => { await handle.remove(); };
}

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}
