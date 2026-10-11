import { jsonCors, preflight } from '@/lib/server/cors';
import { executeAssistantTool } from '@/lib/server/assistantTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_TOOLS = new Set([
  'create_pdf_from_photos',
  'scan_to_pdf',
  'compress_pdf',
  'restore_photo',
  'create_id_photos',
]);
const MAX_IMAGES = 20;
const MAX_FILES = 5;
const MAX_IMAGE_CHARS = 8_000_000;
const MAX_FILE_CHARS = 70_000_000;

export async function OPTIONS(req: Request) {
  return preflight(req);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name : '';
    const args = (body.args && typeof body.args === 'object' ? body.args : {}) as Record<string, unknown>;
    const rawImages: unknown[] = Array.isArray(body.images) ? body.images : [];
    const images: string[] = rawImages
      .filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/'))
      .slice(0, MAX_IMAGES);
    const rawFiles: unknown[] = Array.isArray(body.files) ? body.files : [];
    const files: Array<{ data: string; mimeType: string; name: string }> = rawFiles
      .filter((x): x is { data: string; mimeType: string; name: string } => {
        if (!x || typeof x !== 'object') return false;
        const f = x as Record<string, unknown>;
        return typeof f.data === 'string' && typeof f.mimeType === 'string' && typeof f.name === 'string';
      })
      .slice(0, MAX_FILES);

    if (!name) return jsonCors(req, { ok: false, error: 'Falta el nombre de la herramienta.' }, { status: 400 });
    if (!ALLOWED_TOOLS.has(name)) return jsonCors(req, { ok: false, error: 'Herramienta no permitida.' }, { status: 403 });
    if (images.some((image) => image.length > MAX_IMAGE_CHARS)) return jsonCors(req, { ok: false, error: 'Una imagen supera el tamaño permitido.' }, { status: 413 });
    if (files.some((file) => file.data.length > MAX_FILE_CHARS)) return jsonCors(req, { ok: false, error: 'Un archivo supera el tamaño permitido.' }, { status: 413 });

    const result = await executeAssistantTool(name, args, images, files);
    return jsonCors(req, { ok: true, ...result });
  } catch (error) {
    console.error('Tool error:', error);
    return jsonCors(req, { ok: false, error: error instanceof Error ? error.message : 'No se pudo ejecutar la herramienta.' }, { status: 400 });
  }
}