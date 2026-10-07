'use client';

import { useState } from 'react';
import type { Tramite } from '@/lib/tramites';
import { nombresPasos } from '@/lib/tramites';

type AssistantProps = {
  modo?: 'inicio' | 'tramite';
  tramite?: Tramite;
  pasoActual?: number;
  ayudaCampoActivo?: string;
};

type AssistantContext = {
  currentModule: string;
  currentStep: string | number;
};

type Artifact = {
  filename: string;
  mimeType: string;
  dataBase64: string;
  size: number;
};

type AssistantResponse = {
  ok: boolean;
  reply?: string;
  action?: string;
  parameters?: Record<string, unknown>;
  artifact?: Artifact;
  error?: string;
};

function dataUrlToBlob(dataUrl: string, mimeType: string) {
  const binary = atob(dataUrl);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export default function Assistant({
  modo = 'inicio',
  tramite,
  pasoActual,
  ayudaCampoActivo,
}: AssistantProps) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState(mensajeInicial());
  const [entrada, setEntrada] = useState('');
  const [cargando, setCargando] = useState(false);
  const [imagenes, setImagenes] = useState<string[]>([]);
  const [archivoGenerado, setArchivoGenerado] = useState<Artifact | null>(null);

  function mensajeInicial(): string {
    if (modo === 'inicio') return 'Hola, soy tu asistente de Papelería Arcoíris. Elige el servicio o trámite que necesitas y vamos paso a paso.';
    if (tramite && pasoActual) return `Estamos en el paso ${pasoActual} de 4 de ${tramite.nombre}: ${nombresPasos[pasoActual - 1]}. No te preocupes, te ayudaré.`;
    return 'Vamos paso a paso. No te preocupes, te ayudaré.';
  }

  function contextoActual(): AssistantContext {
    return { currentModule: tramite?.nombre ?? modo, currentStep: pasoActual ?? 'inicio' };
  }

  async function seleccionarImagenes(files: FileList | null) {
    if (!files) return;
    const seleccionadas = Array.from(files).slice(0, 20);
    const data = await Promise.all(seleccionadas.map((file) => new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setImagenes(data);
    setArchivoGenerado(null);
    setMensaje(`${data.length} imagen(es) listas. Ahora dime, por ejemplo: “hazme un PDF” o “comprime estas fotos”.`);
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
        body: JSON.stringify({ message: texto, context: contextoActual(), images: imagenes }),
      });
      const data: AssistantResponse = await response.json();

      if (!response.ok || !data.ok) {
        setMensaje(data.error || 'No pude procesar tu solicitud. Intenta de nuevo.');
        return;
      }

      setMensaje(data.reply || 'Listo. Te ayudo con el siguiente paso.');
      if (data.artifact) setArchivoGenerado(data.artifact);

      if (data.action && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('arcoiris:assistant-action', {
          detail: { action: data.action, parameters: data.parameters ?? {} },
        }));
      }
      setEntrada('');
      if (data.artifact) setImagenes([]);
    } catch (error) {
      console.error('Error al consultar ArcoirisAI:', error);
      setMensaje('Perdón, no pude conectar con ArcoirisAI. Revisa que las APIs estén configuradas.');
    } finally {
      setCargando(false);
    }
  }

  function responder(tipo: 'no-se' | 'que-sigue' | 'repetir') {
    if (tipo === 'repetir') return void consultarArcoirisAI('Repite y explícame de forma sencilla el paso actual.');
    if (tipo === 'no-se') return void consultarArcoirisAI(ayudaCampoActivo ? `No sé qué poner aquí. Ayúdame con este campo: ${ayudaCampoActivo}` : 'No sé qué poner aquí. Explícame qué debo escribir.');
    void consultarArcoirisAI('¿Qué sigue? Explícame el siguiente paso.');
  }

  function descargarArtifact() {
    if (!archivoGenerado) return;
    const url = `data:${archivoGenerado.mimeType};base64,${archivoGenerado.dataBase64}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = archivoGenerado.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir asistente" className="fixed bottom-20 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-oficial text-3xl text-carta shadow-lg transition-transform active:scale-95">🌈</button>

      {abierto && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/30 px-4 pb-4" onClick={() => setAbierto(false)}>
          <div className="w-full max-w-md rounded-3xl bg-carta p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-tinta">Tu asistente IA</span>
              <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-2xl text-tinta-suave">✕</button>
            </div>

            <p className="mb-4 text-tinta" aria-live="polite">{mensaje}</p>

            <label className="mb-3 block rounded-2xl border-2 border-dashed border-tinta/10 bg-papel px-4 py-3 text-center text-sm font-semibold text-tinta cursor-pointer">
              📷 Agregar fotos para IA
              <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => void seleccionarImagenes(e.target.files)} />
            </label>

            {imagenes.length > 0 && (
              <p className="mb-3 text-xs text-tinta-suave">{imagenes.length} imagen(es) adjuntas.</p>
            )}

            {archivoGenerado && (
              <div className="mb-3 rounded-2xl bg-papel p-3">
                <p className="text-sm font-semibold text-tinta">Archivo listo: {archivoGenerado.filename}</p>
                <button type="button" onClick={descargarArtifact} className="mt-2 rounded-xl bg-oficial px-4 py-2 text-sm font-bold text-carta">Descargar</button>
              </div>
            )}

            <div className="mb-3 flex gap-2">
              <input value={entrada} onChange={(e) => setEntrada(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void consultarArcoirisAI(entrada); }} placeholder="Escribe qué necesitas…" className="min-w-0 flex-1 rounded-full bg-papel px-4 py-2 text-sm text-tinta outline-none ring-1 ring-tinta/10 focus:ring-2 focus:ring-oficial" aria-label="Mensaje para ArcoirisAI" />
              <button type="button" onClick={() => void consultarArcoirisAI(entrada)} disabled={cargando || !entrada.trim()} className="rounded-full bg-oficial px-4 py-2 text-sm font-bold text-carta disabled:opacity-50">{cargando ? '…' : 'Enviar'}</button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => responder('no-se')} disabled={cargando} className="rounded-full bg-papel px-4 py-2 text-sm font-medium text-tinta ring-1 ring-tinta/10">No sé qué poner aquí</button>
              <button type="button" onClick={() => responder('que-sigue')} disabled={cargando} className="rounded-full bg-papel px-4 py-2 text-sm font-medium text-tinta ring-1 ring-tinta/10">¿Qué sigue?</button>
              <button type="button" onClick={() => responder('repetir')} disabled={cargando} className="rounded-full bg-papel px-4 py-2 text-sm font-medium text-tinta ring-1 ring-tinta/10">Repetir</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
