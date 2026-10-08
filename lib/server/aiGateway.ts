import { GoogleGenAI } from '@google/genai';

export type GatewayInput = {
  action: string;
  message: string;
  context?: Record<string, unknown>;
  images?: string[];
  files?: Array<{ data: string; mimeType: string; name: string }>;
};

export type GatewayResult = { reply: string; provider: 'gemini' | 'groq' | 'fallback'; model: string };

const GEMINI_MODEL = process.env.GEMINI_AI_MODEL || 'gemini-3.8-flash';
const GROQ_MODEL = process.env.GROQ_AI_MODEL || 'qwen/qwen3.8-27b';
const VISION_ACTIONS = new Set(['create_cheatsheet', 'create_flashcards', 'fill_form']);

const PROMPTS: Record<string, string> = {
  create_cheatsheet: 'Convierte el material en una hoja de resumen visual para estudiar. Usa títulos, conceptos clave, ejemplos, errores comunes y una sección final de repaso. No inventes datos que no estén en el material.',
  create_flashcards: 'Convierte el material en 10-20 flashcards, ordenadas de básico a avanzado y basadas únicamente en el material proporcionado.',
  fill_form: 'Analiza el formato y guía al usuario campo por campo. Identifica etiqueta, dato esperado, ejemplo y advertencia. Nunca rellenes contraseñas, códigos de verificación ni CAPTCHA.',
  research_topic: 'Prepara una investigación educativa clara. Separa hechos, conceptos, preguntas abiertas y fuentes sugeridas. Si no tienes navegación ni fuentes proporcionadas, dilo explícitamente y no inventes referencias.',
  create_local_ad: 'Redacta contenido corto para un anuncio de papelería: título, oferta, descripción y llamada a la acción.',
  create_print_order: 'Organiza un pedido de impresión con archivos, cantidad, tamaño, color, acabado y notas. Si faltan datos, crea una lista de pendientes.',
  create_reminder: 'Convierte la petición en un recordatorio claro con título, fecha/hora si fue proporcionada y una nota breve.',
  help_user: 'Ayuda al usuario de Papelería Arcoíris de forma sencilla y práctica.',
};

function cleanText(value: string | undefined) { return (value || '').replace(/\u0000/g, '').trim(); }
function dataUrlParts(value: string) {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  return match ? { mimeType: match[1], data: match[2] } : null;
}
function retryable(status: number) { return status === 408 || status === 409 || status === 429 || status >= 500; }

async function gemini(input: GatewayInput): Promise<GatewayResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada.');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const parts: Array<Record<string, unknown>> = [{ text: [
    'Eres ArcoirisAI, asistente de Papelería Arcoíris.',
    PROMPTS[input.action] || PROMPTS.help_user,
    'Responde en español, con lenguaje claro y accionable.',
    'Contexto: ' + JSON.stringify(input.context || {}),
    'Petición: ' + input.message,
  ].join('\n') }];

  for (const image of (input.images || []).slice(0, 10)) {
    const parsed = dataUrlParts(image);
    if (parsed && parsed.mimeType.startsWith('image/')) {
      parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
    }
  }

  for (const file of (input.files || []).slice(0, 5)) {
    const parsed = dataUrlParts(file.data);
    if (parsed && (parsed.mimeType === 'application/pdf' || parsed.mimeType.startsWith('text/'))) {
      parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.data } });
    }
  }

  const response = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: 'user', parts }],
    config: { temperature: 0.25 },
  });
  const reply = cleanText(response.text);
  if (!reply) throw new Error('Gemini no devolvió contenido.');
  return { reply, provider: 'gemini', model: GEMINI_MODEL };
}

async function groq(input: GatewayInput): Promise<GatewayResult> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY no configurada.');

  const userContent: Array<Record<string, unknown>> = [{
    type: 'text',
    text: (PROMPTS[input.action] || PROMPTS.help_user)
      + '\nContexto: ' + JSON.stringify(input.context || {})
      + '\nPetición: ' + input.message,
  }];

  // Groq recibe imágenes con el formato OpenAI-compatible. Esto evita perder
  // la fotografía cuando Gemini falla o está temporalmente limitado.
  for (const image of (input.images || []).slice(0, 10)) {
    const parsed = dataUrlParts(image);
    if (parsed && parsed.mimeType.startsWith('image/')) {
      userContent.push({ type: 'image_url', image_url: { url: image } });
    }
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.2,
      max_completion_tokens: 1800,
      messages: [
        { role: 'system', content: 'Eres ArcoirisAI. Responde en español. No inventes fuentes, no pidas contraseñas y nunca intentes resolver CAPTCHA.' },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const error = new Error('Groq HTTP ' + response.status) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const reply = cleanText(data?.choices?.[0]?.message?.content);
  if (!reply) throw new Error('Groq no devolvió contenido.');
  return { reply, provider: 'groq', model: GROQ_MODEL };
}

function fallback(input: GatewayInput): GatewayResult {
  const topic = input.message.trim() || 'tu tema';
  if (input.action === 'research_topic') return { provider: 'fallback', model: 'deterministic', reply: 'Investigación sobre: ' + topic + '\n\n1. Introducción\nDefine el tema y su importancia.\n\n2. Conceptos clave\n• Define los términos principales.\n• Explica causas, características y consecuencias.\n\n3. Desarrollo\nOrganiza la información en apartados y distingue hechos de opiniones.\n\n4. Conclusión\nResume los hallazgos.\n\nNota: la versión sin IA no inventa fuentes; agrega aquí las fuentes oficiales consultadas.' };
  if (input.action === 'create_flashcards') return { provider: 'fallback', model: 'deterministic', reply: 'Flashcards base para ' + topic + '\n\n1. ¿Qué es?\nRespuesta: escribe la definición principal.\n\n2. ¿Cuáles son sus características?\nRespuesta: enumera las esenciales.\n\n3. ¿Por qué es importante?\nRespuesta: explica su utilidad.\n\n4. ¿Qué ejemplo lo representa?\nRespuesta: agrega un ejemplo concreto.\n\n5. ¿Qué error común debe evitarse?\nRespuesta: agrega el error y su corrección.' };
  if (input.action === 'create_cheatsheet') return { provider: 'fallback', model: 'deterministic', reply: 'HOJA DE RESUMEN · ' + topic + '\n\nCONCEPTO PRINCIPAL\nEscribe la definición esencial.\n\n3 IDEAS CLAVE\n• Idea 1\n• Idea 2\n• Idea 3\n\nEJEMPLO\nAgrega un ejemplo práctico.\n\nREPASO\n¿Qué recuerdas sin mirar tus apuntes?' };
  return { provider: 'fallback', model: 'deterministic', reply: 'Puedo ayudarte con ' + topic + '. La IA no está disponible en este momento; puedes continuar con las herramientas locales sin consumir cuota.' };
}

export async function runAiTask(input: GatewayInput): Promise<GatewayResult> {
  const hasMedia = Boolean((input.images?.length || 0) + (input.files?.length || 0));
  const order = VISION_ACTIONS.has(input.action) || hasMedia ? ['gemini', 'groq'] : ['groq', 'gemini'];
  let lastError: unknown;

  for (const provider of order) {
    try {
      return provider === 'gemini' ? await gemini(input) : await groq(input);
    } catch (error) {
      lastError = error;
      const status = (error as Error & { status?: number }).status;
      if (status !== undefined && !retryable(status)) break;
    }
  }

  console.warn('AI gateway fallback:', lastError);
  return fallback(input);
}
