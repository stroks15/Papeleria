import { NextResponse } from 'next/server';

// La APK (Capacitor con androidScheme "https") sirve la web desde https://localhost
// y llama a la API en Vercel: es una petición entre orígenes y el navegador exige
// cabeceras CORS y un preflight (OPTIONS) con respuesta 2xx.
const ORIGENES_APK = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

function origenesPermitidos(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return [...ORIGENES_APK, ...extra];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origen = req.headers.get('origin');
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origen && origenesPermitidos().includes(origen)) {
    headers['Access-Control-Allow-Origin'] = origen;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

export function jsonConCors(
  req: Request,
  cuerpo: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  return NextResponse.json(cuerpo, {
    status: init.status ?? 200,
    headers: { ...corsHeaders(req), ...(init.headers ?? {}) },
  });
}

export function preflight(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

/** Alias en inglés usado por /api/assistant y /api/tools. */
export const jsonWithCors = jsonConCors;
