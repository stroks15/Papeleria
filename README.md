# Papelería Arcoíris

Aplicación móvil (Next.js + Capacitor) para trámites digitales y herramientas con IA de Papelería Arcoíris.

## Estructura

- `app/` — rutas de Next.js (`/`, `/tramite/[slug]`, `/servicio/[id]`) y API (`/api/assistant`, `/api/tools`).
- `components/`, `context/`, `lib/` — interfaz, estado y lógica de cliente/servidor.
- `android/` — proyecto nativo de Capacitor (plugins propios: `ExternalBrowser`, `FileSaver`).
- `scripts/export-android.mjs` — genera el bundle estático (`out/`) que se empaqueta en la APK.

## Variables de entorno

Copia `.env.example` y configura en Vercel (solo servidor, nunca con `NEXT_PUBLIC_`):

- `GEMINI_API_KEY`, `GROQ_API_KEY`
- Opcionales: `GEMINI_AI_MODEL`, `GROQ_AI_MODEL`, `GROQ_VISION_MODEL`, `XAI_API_KEY`, `XAI_AI_MODEL`, `ALLOWED_ORIGINS`

## Respaldo de IA (Gemini → Groq → Grok)

`lib/server/aiGateway.ts` intenta primero Gemini. Si falla por cualquier motivo (429, 5xx, timeout, modelo
inexistente, clave inválida o respuesta vacía) conmuta automáticamente a Groq, luego a Grok (xAI, opcional si defines `XAI_API_KEY`), y si todos fallan devuelve una
respuesta determinística sin IA. Las imágenes se envían a un modelo de visión de Groq. Los PDF solo los lee Gemini.

## Trámites gubernamentales

Los portales oficiales se abren con el plugin nativo `ExternalBrowser` (navegador del sistema), restringido a
dominios `https` permitidos. La app nunca completa contraseñas, códigos de verificación ni CAPTCHA.

## Compilar

```bash
npm ci
npm run build           # Vercel / servidor
npm run android:build   # bundle estático + APK debug
```

El workflow `Build Android APK` genera `app-debug.apk` en cada push a `main`.
