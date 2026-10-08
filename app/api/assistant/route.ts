import { NextResponse } from 'next/server';
import { executeAssistantTool, type ToolArtifact } from '@/lib/server/assistantTools';
import { runAiTask } from '@/lib/server/aiGateway';
import { createAdSvg, createPrintOrderArtifact } from '@/lib/server/toolFallbacks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LOCAL_ACTIONS = new Set([
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

type FileInput = { data: string; mimeType: string; name: string };
type Body = {
  message?: string;
  context?: { currentModule?: string; currentStep?: string | number; requestedAction?: string };
  images?: string[];
  files?: FileInput[];
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const action = body.context?.requestedAction || 'help_user';
    const images = Array.isArray(body.images)
      ? body.images.filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, MAX_IMAGES)
      : [];
    const files = Array.isArray(body.files)
      ? body.files.filter((x): x is FileInput => !!x && typeof x.data === 'string' && typeof x.mimeType === 'string' && typeof x.name === 'string').slice(0, MAX_FILES)
      : [];

    if (!message) return NextResponse.json({ ok: false, error: 'Falta el mensaje.' }, { status: 400 });
    if (images.some((x) => x.length > MAX_IMAGE_CHARS)) return NextResponse.json({ ok: false, error: 'Una imagen supera el tamaño permitido.' }, { status: 413 });
    if (files.some((x) => x.data.length > MAX_FILE_CHARS)) return NextResponse.json({ ok: false, error: 'Un archivo supera el tamaño permitido.' }, { status: 413 });

    let artifact: ToolArtifact | undefined;
    let summary: unknown = null;

    if (LOCAL_ACTIONS.has(action)) {
      const result = await executeAssistantTool(action, {}, images, files);
      artifact = result.artifact;
      summary = result.summary;
    }

    if (action === 'create_print_order') {
      artifact = createPrintOrderArtifact(
        message,
        files.map((file) => ({ name: file.name, size: file.data.length, mimeType: file.mimeType })),
      );
      return NextResponse.json({
        ok: true,
        reply: 'Pedido preparado. Revisa los datos y confirma la impresión en la papelería.',
        action,
        parameters: {},
        provider: 'fallback',
        model: 'deterministic',
        artifact,
      });
    }

    if (LOCAL_ACTIONS.has(action)) {
      return NextResponse.json({
        ok: true,
        reply: 'Listo. El procesamiento se realizó sin consumir IA.',
        action,
        parameters: {},
        model: 'local',
        artifact,
        summary,
      });
    }

    const ai = await runAiTask({
      action,
      message,
      context: body.context,
      images,
      files,
    });

    if (action === 'create_local_ad') {
      artifact = createAdSvg(ai.reply);
    }

    return NextResponse.json({
      ok: true,
      reply: ai.reply,
      action,
      parameters: {},
      provider: ai.provider,
      model: ai.model,
      artifact,
      summary,
    });
  } catch (error) {
    console.error('ArcoirisAI error:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'Error interno de ArcoirisAI.',
    }, { status: 500 });
  }
}
