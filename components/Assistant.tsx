'use client';

import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { Tramite } from '@/lib/tramites';
import { nombresPasos } from '@/lib/tramites';

type AssistantProps = { modo?: 'inicio' | 'tramite'; tramite?: Tramite; pasoActual?: number; ayudaCampoActivo?: string };
type AssistantContext = { currentModule: string; currentStep: string | number };
type Artifact = { filename: string; mimeType: string; dataBase64: string; size: number };
type Attachment = { data: string; mimeType: string; name: string };
type AssistantResponse = { ok: boolean; reply?: string; action?: string; parameters?: Record<string, unknown>; artifact?: Artifact; error?: string };

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function Assistant({ modo = 'inicio', tramite, pasoActual, ayudaCampoActivo }: AssistantProps) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState(mensajeInicial());
  const [entrada, setEntrada] = useState('');
  const [cargando, setCargando] = useState(false);
  const [adjuntos, setAdjuntos] = useState<Attachment[]>([]);
  const [archivoGenerado, setArchivoGenerado] = useState<Artifact | null>(null);

  function mensajeInicial() {
    if (modo === 'inicio') return 'Hola. Soy tu asistente de Papelería Arcoíris. Puedo ayudarte con herramientas, documentos y trámites.';
    if (tramite && pasoActual) return 'Paso ' + pasoActual + ' de 4 · ' + tramite.nombre + ' · ' + nombresPasos[pasoActual - 1] + '. Si tienes una duda, pregúntame aquí.';
    return 'Vamos paso a paso. Pregúntame lo que necesites.';
  }

  function contextoActual(): AssistantContext {
    return { currentModule: tramite?.nombre ?? modo, currentStep: pasoActual ?? 'inicio' };
  }

  async function seleccionarArchivos(files: FileList | null) {
    if (!files) return;
    const selected = Array.from(files)
      .filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
      .slice(0, 20);
    const data = await Promise.all(selected.map(async (file) => ({ data: await readFile(file), mimeType: file.type || 'application/pdf', name: file.name })));
    setAdjuntos(data);
    setArchivoGenerado(null);
    setMensaje(data.length + ' archivo(s) listos. Ahora dime qué quieres que haga la IA con ellos.');
  }

  async function consultarArcoirisAI(mensajeDelUsuario: string) {
    const texto = mensajeDelUsuario.trim();
    if (!texto || cargando) return;
    setCargando(true);
    try {
      const apiBase = process.env.NEXT_PUBLIC_ASSISTANT_API_URL || (typeof window !== 'undefined' && window.location.protocol.startsWith('capacitor') ? 'https://papeleria-arcoiris.vercel.app' : '');
      const response = await fetch(apiBase + '/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: texto,
          context: contextoActual(),
          images: adjuntos.filter((x) => x.mimeType.startsWith('image/')).map((x) => x.data),
          files: adjuntos,
        }),
      });
      const data: AssistantResponse = await response.json();
      if (!response.ok || !data.ok) {
        setMensaje(data.error || 'No pude procesar tu solicitud.');
        return;
      }
      setMensaje(data.reply || 'Listo.');
      if (data.artifact) setArchivoGenerado(data.artifact);
      if (data.action && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arcoiris:assistant-action', { detail: { action: data.action, parameters: data.parameters ?? {} } }));
      }
      setEntrada('');
      if (data.artifact) setAdjuntos([]);
    } catch {
      setMensaje('No pude conectar con ArcoirisAI. Intenta de nuevo.');
    } finally {
      setCargando(false);
    }
  }

  function responder(tipo: 'no-se' | 'que-sigue' | 'repetir') {
    if (tipo === 'repetir') return void consultarArcoirisAI('Repite y explícame de forma sencilla el paso actual.');
    if (tipo === 'no-se') return void consultarArcoirisAI(ayudaCampoActivo ? 'No sé qué poner aquí. Ayúdame con este campo: ' + ayudaCampoActivo : 'No sé qué poner aquí. Explícame qué debo escribir.');
    void consultarArcoirisAI('¿Qué sigue? Explícame el siguiente paso.');
  }

  async function descargarArtifact() {
    if (!archivoGenerado) return;
    try {
      if (Capacitor.isNativePlatform()) {
        const { guardarArchivoEnAndroid } = await import('@/lib/nativeFiles');
        await guardarArchivoEnAndroid(
          archivoGenerado.filename,
          archivoGenerado.mimeType,
          archivoGenerado.dataBase64,
        );
        setMensaje('Archivo guardado en Descargas/Papelería Arcoíris.');
        return;
      }
      const link = document.createElement('a');
      link.href = 'data:' + archivoGenerado.mimeType + ';base64,' + archivoGenerado.dataBase64;
      link.download = archivoGenerado.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setMensaje('No se pudo guardar el archivo. Intenta pulsar Descargar de nuevo.');
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir asistente" className="fixed bottom-20 right-4 z-40 flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-white bg-oficial text-4xl text-white shadow-[0_8px_28px_rgba(0,0,0,.35)]">
        🌈
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 px-3 pb-3" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md rounded-[28px] border-2 border-black/10 bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <span className="block font-display text-xl font-bold text-tinta">ArcoirisAI</span>
                <span className="text-xs font-semibold text-tinta-suave">Gemini + Groq · ayuda en tu trámite</span>
              </div>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar asistente" className="rounded-full bg-papel px-4 py-2 text-xl font-black text-tinta shadow-sm">✕</button>
            </div>

            <div className="mb-4 max-h-56 overflow-y-auto rounded-2xl border-2 border-black/10 bg-white p-4 text-base font-medium leading-6 text-tinta shadow-inner" aria-live="polite">{mensaje}</div>

            <label className="mb-3 block cursor-pointer rounded-2xl border-2 border-dashed border-oficial bg-papel px-4 py-4 text-center text-sm font-bold text-tinta">
              📎 Adjuntar imágenes o PDF a la IA
              <input type="file" accept="image/*,application/pdf,.pdf" multiple className="sr-only" onChange={(e) => void seleccionarArchivos(e.target.files)} />
            </label>

            {adjuntos.length > 0 && <p className="mb-3 rounded-xl bg-papel px-3 py-2 text-xs font-semibold text-tinta">{adjuntos.length} archivo(s) adjunto(s).</p>}

            {archivoGenerado && (
              <div className="mb-3 rounded-2xl border-2 border-black/10 bg-papel p-3">
                <p className="text-sm font-bold text-tinta">Archivo listo: {archivoGenerado.filename}</p>
                <button type="button" onClick={()=>void descargarArtifact()} className="mt-2 rounded-xl bg-oficial px-4 py-2 text-sm font-bold text-white">Descargar</button>
              </div>
            )}

            <div className="mb-3 flex gap-2">
              <input value={entrada} onChange={(e) => setEntrada(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void consultarArcoirisAI(entrada); }} placeholder="Escribe tu pregunta…" className="min-w-0 flex-1 rounded-full border-2 border-black/10 bg-white px-4 py-3 text-base text-tinta outline-none focus:border-oficial" aria-label="Mensaje para ArcoirisAI" />
              <button type="button" onClick={() => void consultarArcoirisAI(entrada)} disabled={cargando || !entrada.trim()} className="rounded-full bg-oficial px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{cargando ? '…' : 'Enviar'}</button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => responder('no-se')} disabled={cargando} className="rounded-full border border-black/10 bg-papel px-3 py-2 text-sm font-bold text-tinta">No sé qué poner</button>
              <button type="button" onClick={() => responder('que-sigue')} disabled={cargando} className="rounded-full border border-black/10 bg-papel px-3 py-2 text-sm font-bold text-tinta">¿Qué sigue?</button>
              <button type="button" onClick={() => responder('repetir')} disabled={cargando} className="rounded-full border border-black/10 bg-papel px-3 py-2 text-sm font-bold text-tinta">Repetir</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
