import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { executeAssistantTool, type ToolArtifact } from '@/lib/server/assistantTools';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GEMINI_REQUESTED_MODEL = process.env.GEMINI_AI_MODEL || 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODEL = process.env.GEMINI_AI_FALLBACK_MODEL || 'gemini-3.8-flash';
const GROQ_REQUESTED_MODEL = process.env.GROQ_AI_MODEL || 'openai/gpt-oss-20b';
const GROQ_FALLBACK_MODEL = process.env.GROQ_AI_FALLBACK_MODEL || 'openai/gpt-oss-20b';

const TOOL_NAMES = [
  'create_pdf_from_photos',
  'scan_to_pdf',
  'compress_images',
  'create_cheatsheet',
  'research_topic',
  'create_id_photos',
  'help_user',
  'open_government_procedure',
  'reset_procedure',
  'go_back',
  'go_home',
];

const FUNCTION_DECLARATIONS = [
  {
    name: 'create_pdf_from_photos',
    description: 'Empaqueta una o varias fotos del usuario en un PDF descargable.',
    parameters: { type: Type.OBJECT, properties: { images: { type: Type.ARRAY, items: { type: Type.STRING } } } },
  },
  {
    name: 'scan_to_pdf',
    description: 'Une varias imágenes escaneadas en un PDF descargable.',
    parameters: { type: Type.OBJECT, properties: { images: { type: Type.ARRAY, items: { type: Type.STRING } } } },
  },
  {
    name: 'compress_images',
    description: 'Comprime imágenes del usuario en el backend usando Sharp.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        quality: { type: Type.NUMBER, description: 'Calidad JPEG de 35 a 90.' },
        maxWidth: { type: Type.NUMBER },
        maxHeight: { type: Type.NUMBER },
        images: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
  },
  {
    name: 'create_cheatsheet',
    description: 'Prepara un resumen visual o guía de estudio a partir de texto.',
    parameters: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } }, required: ['topic'] },
  },
  {
    name: 'research_topic',
    description: 'Organiza una investigación breve y clara sobre un tema solicitado.',
    parameters: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } }, required: ['topic'] },
  },
  {
    name: 'create_id_photos',
    description: 'Prepara fotos tipo credencial; el recorte final puede ejecutarse localmente con Canvas.',
    parameters: { type: Type.OBJECT, properties: { size: { type: Type.STRING } } },
  },
  {
    name: 'help_user',
    description: 'Explica cómo usar Papelería Arcoíris.',
    parameters: { type: Type.OBJECT, properties: { topic: { type: Type.STRING } } },
  },
  {
    name: 'open_government_procedure',
    description: 'Indica que debe abrirse el trámite oficial seleccionado.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'reset_procedure',
    description: 'Inicia un trámite nuevo.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'go_back',
    description: 'Regresa al paso anterior.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
  {
    name: 'go_home',
    description: 'Regresa al inicio.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
];

const SYSTEM_PROMPT = `Eres ArcoirisAI, asistente de Papelería Arcoíris. Ayuda en español, de forma clara y breve. Puedes usar herramientas locales para documentos e imágenes. Nunca inventes resultados, nunca ejecutes código arbitrario y nunca intentes saltarte CAPTCHA, autenticación o controles de seguridad. Para una operación que requiere una imagen, usa las imágenes adjuntas al usuario. Acciones permitidas: ${TOOL_NAMES.join(', ')}.`;

type Body = {
  message?: string;
  context?: { currentModule?: string; currentStep?: string | number };
  images?: string[];
};

function isResearch(name: string) {
  return name === 'research_topic' || name === 'create_cheatsheet';
}

async function groqText(message: string, context: Body['context'], toolSummary?: unknown) {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada.');
  const models = [GROQ_REQUESTED_MODEL, GROQ_FALLBACK_MODEL].filter((v, i, a) => a.indexOf(v) === i);
  let lastError = '';
  for (const model of models) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: `${SYSTEM_PROMPT} Para investigación/resumen, entrega una respuesta práctica sin afirmar que navegaste la web si no lo hiciste. Contexto: ${JSON.stringify(context || {})}.` },
          { role: 'user', content: toolSummary ? `${message}\nResultado de herramienta: ${JSON.stringify(toolSummary)}` : message },
        ],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return { reply: data.choices?.[0]?.message?.content || 'Listo.', model };
    }
    lastError = await res.text();
  }
  throw new Error(`Groq no disponible: ${lastError.slice(0, 300)}`);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const images = Array.isArray(body.images) ? body.images.filter((x): x is string => typeof x === 'string' && x.startsWith('data:image/')).slice(0, 20) : [];
    if (!message) return NextResponse.json({ ok: false, error: 'Falta el mensaje.' }, { status: 400 });

    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
      return NextResponse.json({ ok: false, error: 'Configura GEMINI_API_KEY o GROQ_API_KEY en el entorno del servidor.' }, { status: 500 });
    }

    if (!process.env.GEMINI_API_KEY) {
      const fallback = await groqText(message, body.context);
      return NextResponse.json({ ok: true, ...fallback, action: 'help_user', parameters: {} });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const parts: Array<Record<string, unknown>> = [{ text: `${SYSTEM_PROMPT}\nContexto: ${JSON.stringify(body.context || {})}\nUsuario: ${message}` }];
    for (const image of images) {
      const match = image.match(/^data:(image\\/[^;]+);base64,(.+)$/);
      if (match) parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
    }

    const contents: any[] = [{ role: 'user', parts }];
    const models = [GEMINI_REQUESTED_MODEL, GEMINI_FALLBACK_MODEL].filter((v, i, a) => a.indexOf(v) === i);
    let response: any = null;
    let model = models[0];

    for (const candidate of models) {
      try {
        response = await ai.models.generateContent({
          model: candidate,
          contents,
          config: { tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] },
        });
        model = candidate;
        break;
      } catch (error) {
        console.warn(`Gemini ${candidate} falló; intentando siguiente modelo.`, error);
      }
    }

    if (!response) throw new Error('Gemini no pudo procesar la solicitud.');

    const calls = response.functionCalls || [];
    if (!calls.length) {
      return NextResponse.json({ ok: true, reply: response.text || 'Listo.', action: 'help_user', parameters: {}, model });
    }

    const call = calls[0];
    const action = call.name;
    if (!TOOL_NAMES.includes(action)) return NextResponse.json({ ok: false, error: 'La acción solicitada no está permitida.' }, { status: 502 });

    const args = (call.args || {}) as Record<string, unknown>;

    if (isResearch(action) && process.env.GROQ_API_KEY) {
      const groq = await groqText(message, body.context);
      return NextResponse.json({ ok: true, reply: groq.reply, action, parameters: args, model: groq.model });
    }

    const local = ['create_pdf_from_photos', 'scan_to_pdf', 'compress_images'].includes(action);
    let artifact: ToolArtifact | undefined;
    let summary: unknown = { action, completed: false };

    if (local) {
      const result = await executeAssistantTool(action, args, images);
      summary = result.summary;
      artifact = result.artifact;
    }

    const history = [...contents, response.candidates?.[0]?.content].filter(Boolean);
    if (local) {
      history.push({
        role: 'user',
        parts: [{
          functionResponse: {
            id: call.id,
            name: action,
            response: { result: summary },
          },
        }],
      });
      const finalResponse = await ai.models.generateContent({
        model,
        contents: history,
        config: { tools: [{ functionDeclarations: FUNCTION_DECLARATIONS }] },
      });
      return NextResponse.json({ ok: true, reply: finalResponse.text || 'Listo. La herramienta terminó correctamente.', action, parameters: args, model, artifact });
    }

    return NextResponse.json({ ok: true, reply: response.text || 'Listo.', action, parameters: args, model, artifact });
  } catch (error) {
    console.error('ArcoirisAI error:', error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Error interno de ArcoirisAI.' }, { status: 500 });
  }
}
