// Encapsula la apertura del sitio oficial dentro de un WebView nativo
// (Capacitor) en modo escritorio + inyección de JavaScript para autocompletar.
//
// Cuando la app corre en la web (Vercel) `Capacitor.isNativePlatform()` es
// `false` y se usa un `window.open` normal: ahí el navegador NO permite
// inyectar scripts en otra pestaña por seguridad (CORS). El autocompletado
// solo funciona dentro de la app nativa de Android.
import { Capacitor } from '@capacitor/core';
import { InAppBrowser, ToolBarType } from '@capgo/capacitor-inappbrowser';

// User-Agent de escritorio (Chrome en Windows) para que las páginas
// oficiales se rendericen en modo PC y no en versión móvil.
export const USER_AGENT_DESKTOP =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function esAppNativa(): boolean {
  return Capacitor.isNativePlatform();
}

// Abre el sitio oficial en un WebView interno con modo escritorio.
// Devuelve el id del WebView abierto (null si corre en la web).
export async function abrirWebViewOficial(url: string): Promise<string | null> {
  if (!esAppNativa()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return null;
  }

  const { id } = await InAppBrowser.openWebView({
    url,
    title: 'Sitio oficial',
    toolbarType: ToolBarType.NAVIGATION, // barra con retroceder/avanzar/cerrar
    showReloadButton: true,
    customUserAgent: USER_AGENT_DESKTOP,
  });

  return id;
}

// Inyecta un script en el WebView abierto. `id` debe ser el devuelto por
// abrirWebViewOficial.
export async function inyectarEnWebView(id: string, script: string): Promise<void> {
  if (!esAppNativa()) return;
  try {
    await InAppBrowser.executeScript({ id, code: script });
  } catch {
    // Si la página aún no está lista o bloquea la inyección, lo ignoramos;
    // el usuario siempre puede llenar los campos a mano.
  }
}

// Convierte los datos del formulario en un objeto listo para inyectar.
export type DatosAutocompletado = Record<string, string>;

// Genera el script que rellena los inputs del sitio oficial según los datos
// capturados en la app.
//
// Estrategia de llenado (con fallback):
//  1. Si el input tiene un `name`, `id` o `placeholder` que coincide con la
//     clave deseada (definida en `tramite.campos[].id` o en el mapeo manual),
//     se rellena directamente.
//  2. Si no hay coincidencia, se rellena el primer input vacío del formulario
//     (útil cuando el sitio no expone identificadores claros).
//
// `mapeo` relaciona la clave de nuestro formulario con los selectores del
// sitio oficial (por ejemplo: { numeroServicio: 'input[name="servicio"]' }).
// Se puede ampliar por trámite.
export function construirScriptAutocompletado(
  datos: DatosAutocompletado,
  mapeo: Record<string, string> = {}
): string {
  const datosJson = JSON.stringify(datos);
  const mapeoJson = JSON.stringify(mapeo);

  return `
(function () {
  var datos = ${datosJson};
  var mapeo = ${mapeoJson};
  var vacios = Object.keys(datos).filter(function (k) { return datos[k]; });

  function asignar(el, valor) {
    if (!el) return false;
    try {
      el.value = valor;
      // Notifica a los frameworks (React/Angular/etc.) que el valor cambió.
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      el.focus();
      return true;
    } catch (e) {
      return false;
    }
  }

  // 1) Llenado por selector explícito del mapeo.
  Object.keys(mapeo).forEach(function (clave) {
    var sel = mapeo[clave];
    try {
      var lista = document.querySelectorAll(sel);
      for (var i = 0; i < lista.length; i++) {
        if (asignar(lista[i], datos[clave] || '')) break;
      }
    } catch (e) {}
  });

  // 2) Llenado por coincidencia name/id/placeholder.
  vacios.forEach(function (clave) {
    var selector = 'input[name="' + clave + '"], input[id="' + clave + '"], ' +
                   'textarea[name="' + clave + '"], textarea[id="' + clave + '"], ' +
                   'select[name="' + clave + '"], select[id="' + clave + '"]';
    var lista;
    try {
      lista = document.querySelectorAll(selector);
    } catch (e) { return; }
    var llenado = false;
    for (var i = 0; i < lista.length; i++) {
      if (asignar(lista[i], datos[clave])) { llenado = true; break; }
    }
    if (llenado) return;

    // Intenta por placeholder.
    document.querySelectorAll('input, textarea').forEach(function (el) {
      var ph = (el.getAttribute('placeholder') || '').toLowerCase();
      var k = clave.toLowerCase();
      if (ph.indexOf(k) !== -1 && !el.value) asignar(el, datos[clave]);
    });
  });

  // 3) Relleno restante: primeros inputs vacíos del DOM.
  var pendientes = vacios.filter(function (k) {
    return !Object.prototype.hasOwnProperty.call(mapeo, k);
  });
  var idx = 0;
  document.querySelectorAll('input[type="text"], input:not([type]), textarea').forEach(function (el) {
    if (idx >= pendientes.length) return;
    if (!el.value && el.type !== 'hidden' && !el.disabled && !el.readOnly) {
      asignar(el, datos[pendientes[idx]]);
      idx++;
    }
  });

  return 'ok';
})();
`;
}

// Espera a que el WebView termine de cargar (escucha el evento de carga) y
// luego inyecta el autocompletado. Se usa junto con abrirWebViewOficial.
export function autocompletarAlCargar(
  id: string,
  datos: DatosAutocompletado,
  mapeo: Record<string, string> = {}
): () => void {
  const listener = InAppBrowser.addListener('browserPageLoaded', async () => {
    await inyectarEnWebView(id, construirScriptAutocompletado(datos, mapeo));
  });

  return () => {
    listener.then((l) => l.remove()).catch(() => {});
  };
}
