# Updated README: Added assistant, OpenAI, linter and deployment notes

Lee el README original para instrucciones básicas. Cambios añadidos:

- Assistant ahora puede enviar mensajes a un endpoint de ejemplo en /api/assistant.
- Se añadió un proveedor de estado (context/AssistantContext.tsx) que persiste la sesión en localStorage y opcionalmente guarda historial en Supabase si configuras tus variables.
- Para usar la integración real con OpenAI añade OPENAI_API_KEY a tus variables de entorno en Vercel o .env.local.
- Nuevos scripts: npm run lint, npm run format

Cómo habilitar OpenAI (opcional)
- En .env.local añade OPENAI_API_KEY=sk-...
- Vercel: añade OPENAI_API_KEY en Environment Variables del proyecto.

Archivos nuevos importantes
- next-env.d.ts
- LICENSE
- .eslintrc.json
- .prettierrc
- context/AssistantContext.tsx
- app/api/assistant/route.ts
- components/Assistant.tsx (actualizado)
- lib/supabase.ts (función saveHistory añadida)

