import { jsonConCors, preflight } from '@/lib/server/cors';

export const dynamic = 'force-dynamic';

export function OPTIONS(req: Request) {
  return preflight(req);
}

/** Sirve para que la APK compruebe que llega al servidor correcto. */
export function GET(req: Request) {
  return jsonConCors(req, { ok: true, servicio: 'papeleria-arcoiris', hora: new Date().toISOString() }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
