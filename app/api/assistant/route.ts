import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL = process.env.ARCOIRIS_AI_MODEL || 'gemini-2.5-flash';

const TOOLS = [
  ['create_pdf_from_photos','Foto a PDF'],['scan_to_pdf','Escaneo múltiple a PDF'],['compress_pdf','Comprimir PDF'],['restore_photo','Restaurar fotos'],['create_cheatsheet','Hoja de resumen visual'],['create_local_ad','Anuncio / cartel'],['create_flashcards','Flashcards'],['create_print_order','Pedido de impresión'],['create_id_photos','Foto tipo credencial'],['create_reminder','Recordatorio'],['fill_form','Llenado de formatos'],['research_topic','Investigación'],['open_government_procedure','Trámite gubernamental'],['help_user','Ayuda'],['reset_procedure','Nuevo trámite'],['go_back','Regresar'],['go_home','Inicio'],['open_file','Abrir archivo'],['share_file','Compartir archivo'],['print_file','Imprimir archivo']
];

const SYSTEM_PROMPT = `Eres ArcoirisAI Assistant de Papelería Arcoíris. Entiende la petición y elige UNA acción permitida. Nunca inventes acciones, ejecutes código ni saltes CAPTCHAs. Responde solo con el JSON solicitado.\nAcciones:\n${TOOLS.map(([name,title])=>`- ${name}: ${title}`).join('\n')}`;

export async function POST(req: Request) {
  if (!process.env.GEMINI_API_KEY) return NextResponse.json({ok:false,error:'ArcoirisAI no está configurado todavía.'},{status:500});
  try {
    const body = await req.json();
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message) return NextResponse.json({ok:false,error:'Falta el mensaje.'},{status:400});
    const context = body.context && typeof body.context === 'object' ? body.context : {};
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: `Contexto actual: módulo=${context.currentModule || 'inicio'}, paso=${context.currentStep || 'inicio'}.\nMensaje del usuario: ${message}`,
      config:{systemInstruction:SYSTEM_PROMPT,responseMimeType:'application/json',responseSchema:{type:Type.OBJECT,properties:{reply:{type:Type.STRING},action:{type:Type.STRING},parameters:{type:Type.OBJECT}},required:['reply','action']}}
    });
    const parsed = JSON.parse(response.text || '{}');
    const allowed = new Set(TOOLS.map(([name])=>name));
    if (!allowed.has(parsed.action)) return NextResponse.json({ok:false,error:'La acción solicitada no está permitida.'},{status:502});
    return NextResponse.json({ok:true,reply:parsed.reply || 'Listo. Te ayudo con el siguiente paso.',action:parsed.action,parameters:parsed.parameters || {},model:MODEL});
  } catch (error) {
    console.error('ArcoirisAI error:',error);
    return NextResponse.json({ok:false,error:'Error interno de ArcoirisAI.'},{status:500});
  }
}
