# Respaldo de los archivos del proyecto de ofertas (2026-10-15)

Estos 8 archivos pertenecen al repo **stroks15/DexterH4ck-ofertas** y estaban mezclados
en la raíz de Papeleria. Se eliminaron de la rama de trabajo para quitar ruido del build
de Vercel (un `requirements.txt` en la raíz hace que Vercel detecte un proyecto Python).

## Dónde está la copia completa

Etiqueta de git **`respaldo-ofertas-2026-10-15`** (apunta al commit de `main` previo a la limpieza,
`b70df44`). Contiene los 8 archivos intactos. Para recuperar cualquiera:

```bash
git fetch origin tag respaldo-ofertas-2026-10-15
git show respaldo-ofertas-2026-10-15:monitor_ofertas.py > monitor_ofertas.py
# o varios a la vez:
git checkout respaldo-ofertas-2026-10-15 -- preflight.py requirements.txt
```

## Comparación contra DexterH4ck-ofertas (rama main, 2026-10-15)

| Archivo | Tamaño aquí | Tamaño en DexterH4ck-ofertas | Estado |
|---|---|---|---|
| `reenviar_historial.py` | 1,704 B | 1,704 B | Idéntico |
| `requirements.txt` | 45 B | 45 B | Idéntico |
| `requirements-browser.txt` | 11 B | 11 B | Idéntico |
| `fuentes_liquidaciones.json` | 2,095 B | 2,095 B | Idéntico |
| `marcas_prioritarias.json` | 1,053 B | 1,053 B | Idéntico |
| `monitor_ofertas.py` | 31,289 B | 34,967 B | **Copia vieja**; la de DexterH4ck es más nueva |
| `preflight.py` | 3,456 B | 3,614 B | **Copia vieja**; la de DexterH4ck es más nueva |
| `historial_ofertas.json` | 1,603,473 B (1,858 entradas) | 1,936,128 B | **Copia vieja**; el original tiene más datos |

Conclusión: no hace falta recrear nada en DexterH4ck-ofertas; ya tiene todos los archivos
y las versiones más completas. Esta copia solo sirve como historial.
Además, `monitor_ofertas.py` aquí **no podía ejecutarse**: importa los paquetes `core/` y
`scrapers/`, que no existen en Papeleria (sí existen en DexterH4ck-ofertas).

## Qué hace cada archivo

- **`monitor_ofertas.py`** – Orquestador del monitor de liquidaciones. Consulta tiendas
  (Walmart MX, Bodega Aurrera, Chedraui, Soriana, Liverpool, Amazon MX, Mercado Libre MX,
  Coppel, Suburbia, Oferstock) en paralelo, filtra descuentos entre 50 % y 99 %, evita
  duplicados con el historial y envía alertas a Telegram. Variables de entorno:
  `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_STICKER_LIQUIDACION`, `MAX_ALERTAS_POR_CICLO`,
  `FUENTES_TIMEOUT_TOTAL`, `PREFLIGHT_BLOCKED_STORES`, `NETWORK_BROWSER_ENABLED`.
  Funciones principales: `cargar_historial`, `guardar_historial`, `validar_y_filtrar_bomba`,
  `ejecutar_orquestacion_paralela`, `procesar_candidatos`, `enviar_alertas`, `main`.
- **`preflight.py`** – Sondea cada tienda con un User-Agent honesto, clasifica el resultado
  (ok / blocked / …) y escribe `preflight_health.json` y `preflight.env`. Siempre termina con código 0.
  No evade CAPTCHA/WAF.
- **`reenviar_historial.py`** – Reenvía a Telegram las alertas guardadas en `historial_ofertas.json`
  (reintenta una vez ante HTTP 429).
- **`requirements.txt`** – `requests`, `curl_cffi`, `beautifulsoup4`, `feedparser`.
- **`requirements-browser.txt`** – `playwright`.
- **`fuentes_liquidaciones.json`** – `{version, nota, fuentes[4], whatsapp[]}`: fuentes comunitarias
  de candidatos (no se toman como prueba de precio; se verifica en la página oficial).
- **`marcas_prioritarias.json`** – Marcas por categoría: Juguetes, Belleza, Bebé, Hogar, Moda,
  Tecnología, Limpieza, Mascotas.
- **`historial_ofertas.json`** – Diccionario `{hash → oferta}` con 1,858 entradas, del
  2026-09-25 al 2026-10-07. Campos por oferta: `tienda`, `titulo`, `url`, `categoria`, `marca`,
  `precio_actual`, `precio_maximo`, `precio_alertado`, `descuento`, `puntuacion`, `extremo`,
  `ultima_actualizacion`, `rearmado_alertas_2026_09_25`.
  Por tienda: Amazon 477, Soriana 404, Telegram 346, Mercado Libre 210, Chedraui 118,
  Liverpool 111, Amazon MX 87, Suburbia 66, Walmart MX 38, sin tienda 1.

## Nada secreto

Ningún archivo contiene tokens; `TELEGRAM_TOKEN` y `TELEGRAM_CHAT_ID` se leen del entorno.
