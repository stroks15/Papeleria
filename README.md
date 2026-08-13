# PAPELERÍA ARCOÍRIS 🌈

App móvil-first para ayudar a clientes adultos a realizar trámites digitales con un asistente amigable.

Contenido del repositorio:
- Next.js + TypeScript app (app/)
- Componentes en components/
- Supabase ejemplo en supabase/schema.sql
- .env.example con variables necesarias para conectar

Requisitos para correr localmente:

1) Instalar dependencias
   npm install

2) Configurar variables de entorno
   Copia .env.example -> .env.local y añade tus credenciales

3) Ejecutar en desarrollo
   npm run dev

Construir para producción

  npm run build
  npm run start

Variables de entorno (.env.example)
- NEXT_PUBLIC_SUPABASE_URL=
- NEXT_PUBLIC_SUPABASE_ANON_KEY=

Cómo subir a GitHub
1. Crea un repositorio en tu cuenta (ya tienes stroks15/Papeleria)
2. Si trabajas localmente:
   git init
   git add .
   git commit -m "chore: inicializar Papeleria Arcoiris"
   git branch -M main
   git remote add origin git@github.com:stroks15/Papeleria.git
   git push -u origin main

Cómo conectar con Vercel
1. En vercel.com, nuevo proyecto -> Importar desde GitHub
2. Selecciona stroks15/Papeleria
3. Asegúrate de definir las variables de entorno en Vercel (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
4. Build Command: npm run build
   Output Directory: .next

Notas importantes
- No se guardan contraseñas ni datos bancarios en este ejemplo.
- No se implementa bypass de CAPTCHA ni mecanismos para evadir seguridad.
- El asistente es local (UI) y guía al usuario usando mensajes sencillos. Puedes conectar un backend de IA en el futuro.

Estructura para agregar nuevos trámites
- app/tramites/[slug]/page.tsx es un ejemplo dinámico. Para agregar un trámite nuevo, añade su slug a la lista en app/tramites/[slug]/page.tsx y/o crea un registro en la tabla tramites de Supabase.

Licencia: MIT
