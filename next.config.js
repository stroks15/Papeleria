/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  trailingSlash: true,
};

// Modo export estático: lo usa la automatización de Capacitor/Android
// (NEXT_EXPORT=1) para generar el bundle de la web dentro de la app nativa.
// El despliegue normal de Vercel no usa este modo y sigue funcionando como
// servidor (con sus rutas de API).
if (process.env.NEXT_EXPORT === '1') {
  nextConfig.output = 'export';
}

module.exports = nextConfig;
