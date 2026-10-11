import { NextResponse } from 'next/server';

/**
 * La APK carga la web desde https://localhost (Capacitor, androidScheme "https") y llama a
 * la API publicada en Vercel: es una petición entre orígenes distintos, así que el navegador
 * integrado exige cabeceras CORS y responder al preflight OPTIONS. Sin esto, TODAS las
 * llamadas del asistente y de las herramientas fallaban dentro de la APK.
 */
const ORIGENES_PERMITIDOS = new Set([
  'https://localhost', // Capacitor Android (androidScheme: https)
  'http://localhost', // Capacitor con esquema http / desarrollo local
  'capacitor://localhost', // Capacitor iOS
  'http://localhost:3000',
]);

function origenPermitido(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null; // misma-origen o llamadas de servidor: no necesitan CORS
  if (ORIGENES_PERMITIDOS.has(origin)) return origin;
  const extra = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  return extra.includes(origin) ? origin : null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = origenPermitido(req);
  if (!origin) return { Vary: 'Origin' };
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function jsonCors(req: Request, body: unknown, init?: { status?: number }): NextResponse {
  return NextResponse.json(body, { status: init?.status ?? 200, headers: corsHeaders(req) });
}
