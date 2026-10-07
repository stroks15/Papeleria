import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { executeAssistantTool, type ToolArtifact } from '@/lib/server/assistantTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_MODEL = process.env.GEMINI_AI_MODEL || 'gemini-3.8-flash';
const GROQ_MODEL = process.env.GROQ_AI_MODEL || 'qwen/qwen3.8-27b';
const MAX_IMAGES = 20;
const MAX_IMAGE_CHARS = 8_000_000;
const MAX_FILE_CHARS = 70_000_000;

const LOCAL_ACTIONS = new Set([
  'create_pdf_from_photos',
  'scan_to_pdf',
  'compress_pdf',
  'restore_photo',
  'create_id_photos',
]);

const FUNCTION_DECLARATIONS = [
  { name: 'create_pdf_from_photos', description: 'Convierte las fotos adjuntas en un PDF.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'scan_to_pdf', description: 'Une fotos de documentos en un PDF.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'compress_pdf', description: 'Optimiza el PDF adjunto para compartirlo.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'restore_photo', description: 'Restaura la foto adjunta mejorando orientación, contraste y nitidez.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'create_id_photos', description: 'Prepara una hoja de 9 fotos tipo credencial a partir de la foto adjunta.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'create_cheatsheet', description: 'Crea un resumen visual de estudio.', parameters: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } }, required: ['topic'] } },
  { name: 'research_topic', description: 'Organiza una investigación clara.', parameters: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } }, required: ['topic'] } },
  { name: 'create_local_ad', description: 'Prepara contenido para un anuncio.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'create_flashcards', description: 'Crea tarjetas de estudio.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'create_print_order', description: 'Prepara un pedido de impresión.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'create_reminder', description: 'Organiza un recordatorio.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'fill_form', description: 'Ayuda a llenar un formato paso a paso.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'open_government_procedure', description: 'Indica cómo continuar con el trámite oficial seleccionado.', parameters: { type: Type.OBJECT, properties: {} } },
  { name: 'help_user', description: 'Ayuda a usar Papelería Arcoíris.', parameters: { type: Type.OBJECT, properties: {} } },
];

const SYSTEM_PROMPT = `Eres ArcoirisAI, asistente de Papelería Arcoíris. Responde en español, claro y práctico. Puedes analizar imágenes y PDFs adjuntos. Nunca inventes datos, nunca saltes CAPTCHA, autenticación o controles de seguridad. Si el usuario adjunta un documento, usa su contenido. Si el contexto indica requestedAction, esa es la función que debes realizar. Para trámites, explica los datos que el usuario debe capturar y conserva el progreso localmente.`;

type FileInput = { data: string; mimeType: string; name: string };
type Body = {
  message?: string;
  context?: { currentModule?: string; currentStep?: string | number; requestedAction?: string };
  images?: string[];
  files?: FileInput[];
};

function extractText(response: any): string {
  return response?.text || response?.output_text || response?.choices?.[0]?.message?.content || '';
}

async function groqReview(message: string, draft: string, images: string[], context: Body['context']) {
  if (!process.env.GROQ_API_KEY) return null;
  const content: any[] = [{
    type: 'text',
    text: `${SYSTEM_PROMPT}
Revisa la respuesta de otra IA para la función "${context?.requestedAction || 'asistente'}".
Usuario: ${message}
Borrador de Gemini: ${draft}
Corrige errores, omisiones o instrucciones confusas. Devuelve sólo una respuesta final útil para el usuario.`,
  }];
  for (const image of images.slice(0, 3)) {
    content.push({ type: 'image_url', image_url: { url: image } });
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 900,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return extractText(data);
}

async function geminiGenerate(message: string, context: Body['context'], images: string[], files: FileInput[]) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada.');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const parts: any[] = [{
    text: `${SYSTEM_PROMPT}
Contexto: ${JSON.stringify(context || {})}
Usuario: ${message}`,
  }];

  for (const image of images.slice(0, MAX_IMAGES)) {
    const match = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
  }
  for (const file of files.slice(0, 5)) {
    const match = file.data.match(/^data:([^;]+);base64,(.+)$/);
    if (match && (file.mimeType === 'application/pdf' || file.mimeType.startsWith('text/'))) {
      parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
    config: { tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] },
  });
  return response;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const images = Array.isArray(body.images)
      ? body.images.filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, MAX_IMAGES)
      : [];
    const files = Array.isArray(body.files)
      ? body.files.filter((x): x is FileInput => !!x && typeof x.data === 'string' && typeof x.mimeType === 'string' && typeof x.name === 'string').slice(0, 5)
      : [];
    const requestedAction = body.context?.requestedAction;

    if (!message) return NextResponse.json({ ok: false, error: 'Falta el mensaje.' }, { status: 400 });
    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) return NextResponse.json({ ok: false, error: 'Configura GEMINI_API_KEY o GROQ_API_KEY en Vercel.' }, { status: 500 });
    if (images.some((x) => x.length > MAX_IMAGE_CHARS)) return NextResponse.json({ ok: false, error: 'Una imagen supera el tamaño permitido.' }, { status: 413 });
    if (files.some((x) => x.data.length > MAX_FILE_CHARS)) return NextResponse.json({ ok: false, error: 'Un archivo supera el tamaño permitido.' }, { status: 413 });

    let artifact: ToolArtifact | undefined;
    let toolSummary: unknown = null;

    if (requestedAction && LOCAL_ACTIONS.has(requestedAction)) {
      const result = await executeAssistantTool(requestedAction, {}, images, files);
      artifact = result.artifact;
      toolSummary = result.summary;
    }

    let draft = '';
    let model = GEMINI_MODEL;

    if (process.env.GEMINI_API_KEY) {
      const response = await geminiGenerate(message, body.context, images, files);
      draft = extractText(response);
      const call = response.functionCalls?.[0];
      if (!requestedAction && call?.name && LOCAL_ACTIONS.has(call.name)) {
        const result = await executeAssistantTool(call.name, (call.args || {}) as Record<string, unknown>, images, files);
        artifact = result.artifact;
        toolSummary = result.summary;
      }
    }

    if (!draft && process.env.GROQ_API_KEY) {
      const groq = await groqReview(message, '', images, body.context);
      draft = groq || '';
      model = GROQ_MODEL;
    } else if (draft && images.length && process.env.GROQ_API_KEY) {
      const reviewed = await groqReview(message, draft, images, body.context);
      if (reviewed) {
        draft = reviewed;
        model = `${GEMINI_MODEL} + ${GROQ_MODEL}`;
      }
    }

    if (!draft) draft = toolSummary ? 'Listo. La herramienta terminó correctamente.' : 'Listo. Te ayudo con el siguiente paso.';

    if (toolSummary) {
      const suffix = typeof toolSummary === 'object' ? `\n\nResultado: ${JSON.stringify(toolSummary)}` : '';
      if (!draft.includes('Resultado:')) draft += suffix;
    }

    return NextResponse.json({
      ok: true,
      reply: draft,
      action: requestedAction || 'help_user',
      parameters: {},
      model,
      artifact,
    });
  } catch (error) {
    console.error('ArcoirisAI error:', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error interno de ArcoirisAI.' }, { status: 500 });
  }
}