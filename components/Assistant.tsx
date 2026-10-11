'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { CampoTramite, Tramite } from '@/lib/tramites';
import {
  contextoParaIA,
  respuestaRapida,
  responderPorReglas,
  saludoAsistente,
  type ContextoAsistente,
  type TipoRespuestaRapida,
} from '@/lib/assistantRules';

type AssistantProps = {
  modo?: 'inicio' | 'tramite';
  tramite?: Tramite;
  pasoActual?: number;
  campoActivo?: CampoTramite;
};

type Artifact = { filename: string; mimeType: string; dataBase64: string; size: number };
type Attachment = { data: string; mimeType: string; name: string };
type AssistantResponse = {
  ok: boolean;
  reply?: string;
  action?: string;
  parameters?: Record<string, unknown>;
  artifact?: Artifact;
  error?: string;
};
type Mensaje = { id: number; de: 'yo' | 'asistente'; texto: string };

const TIMEOUT_MS = 30_000;
const MAX_MENSAJES = 30;

// Colores sólidos en línea: el asistente nunca depende de que Tailwind genere sus clases
// para verse bien (antes, sin estas clases el panel quedaba transparente dentro de la APK).
const FONDO_PANEL = '#FFFFFF';
const FONDO_PAPEL = '#FBF3E3';
const COLOR_OFICIAL = '#2E5A6C';
const COLOR_TINTA = '#2B2420';

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function urlBase(): string {
  const configurada = process.env.NEXT_PUBLIC_ASSISTANT_API_URL;
  if (configurada) return configurada.replace(/\/$/, '');
  // Dentro de la APK no hay servidor propio: se usa el backend publicado en Vercel.
  if (Capacitor.isNativePlatform()) return 'https://papeleria-flax.vercel.app';
  return window.location.origin;
}

export default function Assistant({ modo = 'inicio', tramite, pasoActual, campoActivo }: AssistantProps) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [entrada, setEntrada] = useState('');
  const [cargando, setCargando] = useState(false);
  const [adjuntos, setAdjuntos] = useState<Attachment[]>([]);
  const [archivoGenerado, setArchivoGenerado] = useState<Artifact | null>(null);

  const siguienteId = useRef(1);
  const abortRef = useRef<AbortController | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  const ctx: ContextoAsistente = useMemo(
    () => ({ modo, tramite, paso: pasoActual, campoActivo }),
    [modo, tramite, pasoActual, campoActivo],
  );
  // El saludo se calcula en vivo para que siempre refleje el paso actual.
  const saludo = useMemo(() => saludoAsistente(ctx), [ctx]);

  const agregar = useCallback((de: Mensaje['de'], texto: string) => {
    setMensajes((prev) => [...prev, { id: siguienteId.current++, de, texto }].slice(-MAX_MENSAJES));
  }, []);

  // Cierra con Escape y bloquea el scroll del fondo mientras está abierto.
  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('keydown', onKey);
    const previo = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previo;
    };
  }, [abierto]);

  // Cancela una petición en curso si el componente se desmonta.
  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (abierto) finRef.current?.scrollIntoView({ block: 'end' });
  }, [mensajes, cargando, abierto]);

  async function seleccionarArchivos(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const seleccionados = Array.from(files)
        .filter(
          (file) =>
            file.type.startsWith('image/') ||
            file.type === 'application/pdf' ||
            file.name.toLowerCase().endsWith('.pdf'),
        )
        .slice(0, 20);
      if (seleccionados.length === 0) {
        agregar('asistente', 'Solo puedo leer imágenes y archivos PDF.');
        return;
      }
      const data = await Promise.all(
        seleccionados.map(async (file) => ({
          data: await readFile(file),
          mimeType: file.type || 'application/pdf',
          name: file.name,
        })),
      );
      setAdjuntos(data);
      setArchivoGenerado(null);
      agregar('asistente', `${data.length} archivo(s) listos. Ahora dime qué quieres que haga con ellos.`);
    } catch {
      agregar('asistente', 'No pude leer el archivo. Intenta con otro.');
    }
  }

  async function llamarIA(texto: string): Promise<AssistantResponse> {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(urlBase() + '/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: texto,
            context: contextoParaIA(ctx),
            images: adjuntos.filter((x) => x.mimeType.startsWith('image/')).map((x) => x.data),
            files: adjuntos,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new Error('ArcoirisAI tardó demasiado en responder. Revisa tu conexión e inténtalo de nuevo.');
        }
        throw new Error('No se pudo conectar con ArcoirisAI. Revisa tu conexión a Internet e inténtalo de nuevo.');
      }

      const raw = await response.text();
      let data: AssistantResponse;
      try {
        data = JSON.parse(raw) as AssistantResponse;
      } catch {
        throw new Error(
          response.ok ? 'El servidor devolvió una respuesta inválida.' : 'El servidor no está disponible en este momento.',
        );
      }
      if (!response.ok || !data.ok) throw new Error(data.error || 'No pude procesar tu solicitud.');
      return data;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function enviar(textoOriginal: string) {
    const texto = textoOriginal.trim();
    if (!texto || cargando) return;

    agregar('yo', texto);
    setEntrada('');

    const conArchivos = adjuntos.length > 0;
    const local = responderPorReglas(texto, ctx);

    // Preguntas conocidas del trámite: respuesta inmediata, sin red y sin gastar cuota de IA.
    if (!conArchivos && local.confianza === 'alta') {
      agregar('asistente', local.texto);
      return;
    }

    setCargando(true);
    try {
      const data = await llamarIA(texto);
      agregar('asistente', data.reply || 'Listo.');
      if (data.artifact) {
        setArchivoGenerado(data.artifact);
        setAdjuntos([]);
      }
      if (data.action) {
        window.dispatchEvent(
          new CustomEvent('arcoiris:assistant-action', {
            detail: { action: data.action, parameters: data.parameters ?? {} },
          }),
        );
      }
    } catch (error) {
      const motivo = error instanceof Error ? error.message : 'No pude conectar con ArcoirisAI.';
      if (conArchivos) {
        agregar('asistente', motivo);
      } else {
        // Respaldo: aunque la IA falle, la persona recibe ayuda útil del trámite.
        agregar('asistente', `${local.texto}\n\n(${motivo} Te rompí la conexión, pero te respondí con la ayuda guardada del trámite.)`);
      }
    } finally {
      setCargando(false);
    }
  }

  function rapida(tipo: TipoRespuestaRapida) {
    const etiquetas: Record<TipoRespuestaRapida, string> = {
      'no-se': 'No sé qué poner',
      'que-sigue': '¿Qué sigue?',
      repetir: 'Repetir',
    };
    agregar('yo', etiquetas[tipo]);
    agregar('asistente', respuestaRapida(tipo, ctx));
  }

  async function descargarArtifact() {
    if (!archivoGenerado) return;
    try {
      if (Capacitor.isNativePlatform()) {
        const { guardarArchivoEnAndroid } = await import('@/lib/nativeFiles');
        await guardarArchivoEnAndroid(archivoGenerado.filename, archivoGenerado.mimeType, archivoGenerado.dataBase64);
        agregar('asistente', 'Archivo guardado en Descargas/Papelería Arcoíris.');
        return;
      }
      const link = document.createElement('a');
      link.href = 'data:' + archivoGenerado.mimeType + ';base64,' + archivoGenerado.dataBase64;
      link.download = archivoGenerado.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      agregar('asistente', 'No se pudo guardar el archivo. Intenta pulsar Descargar de nuevo.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir asistente"
        className="fixed right-4 z-40 flex h-[68px] w-[68px] items-center justify-center rounded-full border-4 border-white text-4xl text-white shadow-[0_8px_28px_rgba(0,0,0,.35)]"
        style={{ backgroundColor: COLOR_OFICIAL, bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        🌈
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
          onClick={() => setAbierto(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Asistente ArcoirisAI"
        >
          <div
            className="flex w-full max-w-md flex-col rounded-t-[28px] shadow-2xl"
            style={{
              backgroundColor: FONDO_PANEL,
              color: COLOR_TINTA,
              maxHeight: '92vh',
              paddingTop: '1rem',
              paddingLeft: '1.25rem',
              paddingRight: '1.25rem',
              paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <span className="block font-display text-xl font-bold" style={{ color: COLOR_TINTA }}>
                  ArcoirisAI
                </span>
                <span className="text-xs font-semibold" style={{ color: '#5C5248' }}>
                  Ayuda en tu trámite
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar asistente"
                className="rounded-full px-4 py-2 text-xl font-black shadow-sm"
                style={{ backgroundColor: FONDO_PAPEL, color: COLOR_TINTA }}
              >
                ✕
              </button>
            </div>

            <div
              className="mb-3 min-h-[8rem] flex-1 overflow-y-auto rounded-2xl border-2 p-3 text-base font-medium leading-6"
              style={{ backgroundColor: FONDO_PANEL, borderColor: 'rgba(0,0,0,0.1)', maxHeight: '38vh' }}
              aria-live="polite"
            >
              <p className="mb-2 whitespace-pre-line">{saludo}</p>
              {mensajes.map((m) => (
                <p
                  key={m.id}
                  className="mb-2 whitespace-pre-line rounded-2xl px-3 py-2"
                  style={
                    m.de === 'yo'
                      ? { backgroundColor: FONDO_PAPEL, marginLeft: '2rem' }
                      : { backgroundColor: '#EEF4F6', marginRight: '1rem' }
                  }
                >
                  {m.texto}
                </p>
              ))}
              {cargando && (
                <p className="mb-2 rounded-2xl px-3 py-2" style={{ backgroundColor: '#EEF4F6' }}>
                  Pensando…
                </p>
              )}
              <div ref={finRef} />
            </div>

            <label
              className="mb-3 block cursor-pointer rounded-2xl border-2 border-dashed px-4 py-3 text-center text-sm font-bold"
              style={{ borderColor: COLOR_OFICIAL, backgroundColor: FONDO_PAPEL }}
            >
              📎 Adjuntar imagen o PDF (opcional)
              <input
                type="file"
                accept="image/*,application/pdf,.pdf"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const entradaArchivos = e.target;
                  void seleccionarArchivos(entradaArchivos.files).finally(() => {
                    entradaArchivos.value = '';
                  });
                }}
              />
            </label>

            {adjuntos.length > 0 && (
              <p className="mb-3 rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: FONDO_PAPEL }}>
                {adjuntos.length} archivo(s) adjunto(s).{' '}
                <button type="button" className="underline" onClick={() => setAdjuntos([])}>
                  Quitar
                </button>
              </p>
            )}

            {archivoGenerado && (
              <div className="mb-3 rounded-2xl border-2 p-3" style={{ backgroundColor: FONDO_PAPEL, borderColor: 'rgba(0,0,0,0.1)' }}>
                <p className="text-sm font-bold">Archivo listo: {archivoGenerado.filename}</p>
                <button
                  type="button"
                  onClick={() => void descargarArtifact()}
                  className="mt-2 rounded-xl px-4 py-2 text-sm font-bold text-white"
                  style={{ backgroundColor: COLOR_OFICIAL }}
                >
                  Descargar
                </button>
              </div>
            )}

            <div className="mb-3 flex gap-2">
              <input
                value={entrada}
                onChange={(e) => setEntrada(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void enviar(entrada);
                }}
                placeholder="Escribe tu pregunta…"
                className="min-w-0 flex-1 rounded-full border-2 px-4 py-3 text-base outline-none"
                style={{ backgroundColor: FONDO_PANEL, borderColor: 'rgba(0,0,0,0.15)', color: COLOR_TINTA }}
                aria-label="Mensaje para ArcoirisAI"
              />
              <button
                type="button"
                onClick={() => void enviar(entrada)}
                disabled={cargando || !entrada.trim()}
                className="rounded-full px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
                style={{ backgroundColor: COLOR_OFICIAL }}
              >
                {cargando ? '…' : 'Enviar'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['no-se', 'No sé qué poner'],
                  ['que-sigue', '¿Qué sigue?'],
                  ['repetir', 'Repetir'],
                ] as Array<[TipoRespuestaRapida, string]>
              ).map(([tipo, etiqueta]) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => rapida(tipo)}
                  className="rounded-full border px-3 py-2 text-sm font-bold"
                  style={{ backgroundColor: FONDO_PAPEL, borderColor: 'rgba(0,0,0,0.1)', color: COLOR_TINTA }}
                >
                  {etiqueta}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
