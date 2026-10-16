import { GoogleGenAI } from '@google/genai';

export type GatewayInput = {
  action: string;
  message: string;
  context?: Record<string, unknown>;
  images?: string[];
  files?: Array<{ data: string; mimeType: string; name: string }>;
};

export type GatewayResult = {
  reply: string;
  provider: 'gemini' | 'groq' | 'xai' | 'fallback';
  model: string;
  /** Proveedores que fallaron antes de obtener esta respuesta (solo diagnóstico). */
  failed?: string[];
};

// Cada variable admite una lista separada por comas: se prueban en orden.
function modelList(value: string | undefined, defaults: string[]): string[] {
  const parsed = (value || '').split(',').map((x) => x.trim()).filter(Boolean);
  return parsed.length ? parsed : defaults;
}

const GEMINI_MODELS = modelList(process.env.GEMINI_AI_MODEL, ['gemini-3.8-flash', 'gemini-2.5-flash']);
const GROQ_TEXT_MODELS = modelList(process.env.GROQ_AI_MODEL, ['qwen/qwen3.8-27b', 'llama-3.3-70b-versatile']);
const GROQ_VISION_MODELS = modelList(process.env.GROQ_VISION_MODEL, ['meta-llama/llama-4-scout-17b-16e-instruct']);
// Grok (xAI) es un eslabón opcional: solo se usa si hay XAI_API_KEY.
const XAI_MODELS = modelList(process.env.XAI_AI_MODEL, ['grok-4']);

// Presupuesto total por solicitud: la ruta declara maxDuration = 30 s y el
// cliente espera hasta ~35 s, así que el respaldo debe terminar antes.
const TOTAL_BUDGET_MS = 26_000;
const GEMINI_ATTEMPT_MS = 11_000;
const GROQ_ATTEMPT_MS = 12_000;
const XAI_ATTEMPT_MS = 12_000;
const MIN_ATTEMPT_MS = 1_500;

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

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const status = (error as Error & { status?: number }).status;
    return (status ? 'HTTP ' + status + ' · ' : '') + error.message.slice(0, 160);
  }
  return String(error).slice(0, 160);
}

class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(label + ' superó el tiempo de espera (' + ms + ' ms).');
    this.name = 'TimeoutError';
  }
}

function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, ms: number, label: string): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError(label, ms));
    }, ms);
  });
  return Promise.race([task(controller.signal), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function basePrompt(input: GatewayInput) {
  return [
    PROMPTS[input.action] || PROMPTS.help_user,
    'Responde en español, con lenguaje claro y accionable.',
    'Contexto: ' + JSON.stringify(input.context || {}),
    'Si el contexto trae "openPage", la persona tiene abierta esa página oficial dentro de la app. Tú NO ves su contenido: guíala con base en el trámite, los campos esperados ("fields") y la ruta de la URL, y si dudas pídele que describa o adjunte una captura. Nunca pidas ni repitas contraseñas, CURP ni datos bancarios.',
    'Petición: ' + input.message,
  ].join('\n');
}

async function gemini(input: GatewayInput, model: string, timeoutMs: number): Promise<GatewayResult> {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY no configurada.');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const parts: Array<Record<string, unknown>> = [{ text: 'Eres ArcoirisAI, asistente de Papelería Arcoíris.\n' + basePrompt(input) }];

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

  const response = await withTimeout(
    () => ai.models.generateContent({ model, contents: [{ role: 'user', parts }], config: { temperature: 0.25 } }),
    timeoutMs,
    'Gemini ' + model,
  );
  const reply = cleanText(response.text);
  if (!reply) throw new Error('Gemini no devolvió contenido.');
  return { reply, provider: 'gemini', model };
}

type OpenAiProvider = { provider: 'groq' | 'xai'; label: string; url: string; keyName: string };

const GROQ_API: OpenAiProvider = { provider: 'groq', label: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', keyName: 'GROQ_API_KEY' };
const XAI_API: OpenAiProvider = { provider: 'xai', label: 'Grok', url: 'https://api.x.ai/v1/chat/completions', keyName: 'XAI_API_KEY' };

// Groq y xAI usan el mismo formato de chat/completions que OpenAI.
async function openAiCompatible(api: OpenAiProvider, input: GatewayInput, model: string, withImages: boolean, timeoutMs: number): Promise<GatewayResult> {
  const apiKey = process.env[api.keyName];
  if (!apiKey) throw new Error(api.keyName + ' no configurada.');

  let prompt = basePrompt(input);

  // Ni Groq ni Grok leen PDF aquí. Los archivos de texto sí se pasan como texto y, si hay
  // PDF, se avisa para que el modelo no finja haberlo leído.
  const unreadable: string[] = [];
  for (const file of (input.files || []).slice(0, 5)) {
    const parsed = dataUrlParts(file.data);
    if (parsed && parsed.mimeType.startsWith('text/')) {
      prompt += '\n\nArchivo "' + file.name + '":\n' + Buffer.from(parsed.data, 'base64').toString('utf8').slice(0, 12_000);
    } else if (parsed && parsed.mimeType === 'application/pdf') {
      unreadable.push(file.name);
    }
  }
  if (unreadable.length) {
    prompt += '\n\nNota: no pudiste leer estos PDF adjuntos (' + unreadable.join(', ') + '). Díselo al usuario y pídele que pegue el texto si lo necesita.';
  }

  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
  if (withImages) {
    // Formato compatible con OpenAI; Groq admite pocas imágenes por solicitud.
    for (const image of (input.images || []).slice(0, 5)) {
      const parsed = dataUrlParts(image);
      if (parsed && parsed.mimeType.startsWith('image/')) {
        userContent.push({ type: 'image_url', image_url: { url: image } });
      }
    }
  }

  const response = await withTimeout(
    (signal) => fetch(api.url, {
      method: 'POST',
      signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_completion_tokens: 1800,
        messages: [
          { role: 'system', content: 'Eres ArcoirisAI. Responde en español. No inventes fuentes, no pidas contraseñas y nunca intentes resolver CAPTCHA.' },
          { role: 'user', content: userContent },
        ],
      }),
    }),
    timeoutMs,
    api.label + ' ' + model,
  );

  if (!response.ok) {
    const error = new Error(api.label + ' ' + model + ' respondió ' + response.status) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  const reply = cleanText(data?.choices?.[0]?.message?.content);
  if (!reply) throw new Error(api.label + ' no devolvió contenido.');
  return { reply, provider: api.provider, model };
}

function fallback(input: GatewayInput, failed: string[]): GatewayResult {
  const topic = input.message.trim() || 'tu tema';
  const base = { provider: 'fallback' as const, model: 'deterministic', failed };
  if (input.action === 'research_topic') return { ...base, reply: 'Investigación sobre: ' + topic + '\n\n1. Introducción\nDefine el tema y su importancia.\n\n2. Conceptos clave\n• Define los términos principales.\n• Explica causas, características y consecuencias.\n\n3. Desarrollo\nOrganiza la información en apartados y distingue hechos de opiniones.\n\n4. Conclusión\nResume los hallazgos.\n\nNota: la versión sin IA no inventa fuentes; agrega aquí las fuentes oficiales consultadas.' };
  if (input.action === 'create_flashcards') return { ...base, reply: 'Flashcards base para ' + topic + '\n\n1. ¿Qué es?\nRespuesta: escribe la definición principal.\n\n2. ¿Cuáles son sus características?\nRespuesta: enumera las esenciales.\n\n3. ¿Por qué es importante?\nRespuesta: explica su utilidad.\n\n4. ¿Qué ejemplo lo representa?\nRespuesta: agrega un ejemplo concreto.\n\n5. ¿Qué error común debe evitarse?\nRespuesta: agrega el error y su corrección.' };
  if (input.action === 'create_cheatsheet') return { ...base, reply: 'HOJA DE RESUMEN · ' + topic + '\n\nCONCEPTO PRINCIPAL\nEscribe la definición esencial.\n\n3 IDEAS CLAVE\n• Idea 1\n• Idea 2\n• Idea 3\n\nEJEMPLO\nAgrega un ejemplo práctico.\n\nREPASO\n¿Qué recuerdas sin mirar tus apuntes?' };
  return { ...base, reply: 'Puedo ayudarte con ' + topic + '. La IA no está disponible en este momento; puedes continuar con las herramientas locales sin consumir cuota.' };
}

/**
 * Cadena de respaldo: Gemini (cada modelo configurado) → Groq (cada modelo
 * configurado; con visión si hay imágenes) → Grok/xAI (si hay XAI_API_KEY) → respuesta determinística sin IA.
 * Cualquier fallo (429, 5xx, timeout, modelo inexistente, clave inválida,
 * respuesta vacía) pasa al siguiente eslabón; no hay errores "terminales".
 */
export async function runAiTask(input: GatewayInput): Promise<GatewayResult> {
  const startedAt = Date.now();
  const failed: string[] = [];
  const hasImages = (input.images || []).some((x) => x.startsWith('data:image/'));
  const remaining = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  type Attempt = { label: string; run: (ms: number) => Promise<GatewayResult>; maxMs: number };
  const attempts: Attempt[] = [
    ...GEMINI_MODELS.map((model): Attempt => ({
      label: 'gemini:' + model,
      maxMs: GEMINI_ATTEMPT_MS,
      run: (ms) => gemini(input, model, ms),
    })),
    ...(hasImages ? GROQ_VISION_MODELS : GROQ_TEXT_MODELS).map((model): Attempt => ({
      label: 'groq:' + model,
      maxMs: GROQ_ATTEMPT_MS,
      run: (ms) => openAiCompatible(GROQ_API, input, model, hasImages, ms),
    })),
    ...(process.env.XAI_API_KEY ? XAI_MODELS : []).map((model): Attempt => ({
      label: 'xai:' + model,
      maxMs: XAI_ATTEMPT_MS,
      run: (ms) => openAiCompatible(XAI_API, input, model, hasImages, ms),
    })),
  ];

  // Si un proveedor se queda sin responder (timeout), no se gasta el presupuesto
  // probando sus otros modelos: se pasa directo al siguiente proveedor.
  const timedOut = new Set<string>();

  for (const attempt of attempts) {
    const providerName = attempt.label.split(':')[0];
    if (timedOut.has(providerName)) {
      failed.push(attempt.label + ' (omitido: el proveedor no respondió)');
      continue;
    }
    const budget = Math.min(attempt.maxMs, remaining());
    if (budget < MIN_ATTEMPT_MS) {
      failed.push(attempt.label + ' (omitido: sin tiempo)');
      continue;
    }
    try {
      const result = await attempt.run(budget);
      return failed.length ? { ...result, failed } : result;
    } catch (error) {
      if (error instanceof TimeoutError) timedOut.add(providerName);
      failed.push(attempt.label + ' → ' + describeError(error));
    }
  }

  console.warn('AI gateway: todos los proveedores fallaron.', failed);
  return fallback(input, failed);
}
