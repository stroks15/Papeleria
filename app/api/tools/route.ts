import { executeAssistantTool } from '@/lib/server/assistantTools';
import { jsonWithCors, preflight } from '@/lib/server/cors';

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
    const body = await req.json();
    const name = typeof body.name === 'string' ? body.name : '';
    const args = body.args && typeof body.args === 'object' ? body.args : {};
    const images: string[] = Array.isArray(body.images)
      ? body.images.filter((x: unknown): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, MAX_IMAGES)
      : [];
    const files: Array<{ data: string; mimeType: string; name: string }> = Array.isArray(body.files)
      ? body.files.filter((x: unknown): x is { data: string; mimeType: string; name: string } =>
          !!x && typeof x === 'object' && typeof (x as any).data === 'string' && typeof (x as any).mimeType === 'string' && typeof (x as any).name === 'string',
        ).slice(0, MAX_FILES)
      : [];

    if (!name) return jsonWithCors(req, { ok: false, error: 'Falta el nombre de la herramienta.' }, { status: 400 });
    if (!ALLOWED_TOOLS.has(name)) return jsonWithCors(req, { ok: false, error: 'Herramienta no permitida.' }, { status: 403 });
    if (images.some((image) => image.length > MAX_IMAGE_CHARS)) return jsonWithCors(req, { ok: false, error: 'Una imagen supera el tamaño permitido.' }, { status: 413 });
    if (files.some((file) => file.data.length > MAX_FILE_CHARS)) return jsonWithCors(req, { ok: false, error: 'Un archivo supera el tamaño permitido.' }, { status: 413 });

    const result = await executeAssistantTool(name, args, images, files);
    return jsonWithCors(req, { ok: true, ...result });
  } catch (error) {
    console.error('Tool error:', error);
    return jsonWithCors(req, { ok: false, error: error instanceof Error ? error.message : 'No se pudo ejecutar la herramienta.' }, { status: 400 });
  }
}