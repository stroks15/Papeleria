# Papelería Arcoíris 🌈

Asistente digital para que los clientes de la papelería hagan trámites
gubernamentales (CFE, tenencia, multas, agua) desde el celular, acompañados
paso a paso por un asistente.

## Stack

Next.js 14 (App Router) · React · TypeScript · Tailwind CSS · Supabase · Vercel

## Variables de entorno

Copia `.env.example` a `.env.local` y agrega tus llaves de Supabase:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

Sin estas variables la app funciona igual (los pasos, el asistente y los
enlaces a los sitios oficiales), solo no se guarda el progreso de sesión ni
las estadísticas básicas en Supabase.

## Cómo agregar un trámite nuevo

Todo trámite vive como un objeto en `lib/tramites.ts` (nombre, emoji, color,
campos a pedir, URL oficial). El resto del sistema —tarjeta en inicio, pasos,
asistente, validaciones— se genera solo a partir de esa lista. No hace falta
tocar ninguna otra pantalla.

## El asistente

Es un asistente basado en reglas (sin costo ni dependencia de una API
externa): usa el texto de ayuda de cada campo, el paso actual y el nombre del
trámite para responder. Si más adelante quieres respuestas realmente
generativas, el punto natural para conectar una API de IA es dentro de
`components/Assistant.tsx`, en la función `responder`.

## Seguridad

No se automatiza ni se evade ningún CAPTCHA de los sitios oficiales, no se
procesan pagos dentro de la app y no se guardan contraseñas ni datos
bancarios.
