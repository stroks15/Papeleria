/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  trailingSlash: true,
  webpack: (config) => {
    // @techstark/opencv-js es un módulo pensado para navegador/WASM, pero su
    // bundle UMD referencia módulos Node opcionales. Next/Webpack debe tratarlos
    // como ausentes para evitar que el build del servidor intente resolverlos.
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

// Modo export estático: lo usa la automatización de Capacitor/Android
// (NEXT_EXPORT=1) para generar el bundle de la web dentro de la app nativa.
// El despliegue normal de Vercel no usa este modo y sigue funcionando como
// servidor (con sus rutas de API).
if (process.env.NEXT_EXPORT === '1') {
  nextConfig.output = 'export';
}

module.exports = nextConfig;
