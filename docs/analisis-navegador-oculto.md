# Análisis: navegador oculto + ventana solo de CAPTCHA

**Conclusión: no es viable de forma segura hoy. Se mantiene el navegador integrado visible (como la Ventanilla).**

| Opción | Problema |
|---|---|
| Navegador sin pantalla en el servidor (Vercel) | Las funciones serverless no ejecutan Chromium de forma fiable; los tokens de CAPTCHA están ligados al origen del portal y al IP/dispositivo de quien lo resuelve; Llave CDMX exige las credenciales de la propia persona (no deben pasar por nuestro servidor) y automatizar portales puede violar sus términos. |
| WebView nativo propio en la APK (oculto, con ventana solo del CAPTCHA) | Requiere un plugin Java a la medida con selectores por portal que cambian sin aviso; el plugin oficial `@capacitor/inappbrowser` no permite inyectar JS, leer el DOM ni mostrar una vista parcial. No se puede compilar ni probar en este entorno y un error en Java rompería todas las APK. |

## Lo que sí se implementó
- Todos los trámites abren **dentro de la APK** (navegador integrado). Si falla, se cae al navegador del teléfono.
- La IA recibe la **ruta de la página abierta** (sin parámetros de consulta), el trámite y los **nombres** de los campos (nunca los valores) y explica cómo llenarlo y qué sigue. No ve el contenido de la página; si duda, pide una captura adjunta.
- La app **no resuelve CAPTCHAs**: la persona los completa en el portal.

## Si se quiere avanzar después
Plugin Android propio (WebView con `evaluateJavascript`) por portal, probado en dispositivo, con selectores versionados y fallback al navegador visible.
