'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type { AIServicio } from '@/lib/ai-services';
import { Capacitor } from '@capacitor/core';
import { credentialSheet, photosToPdf, compressPdf, restorePhoto } from '@/lib/client/localTools';
import { programarRecordatorio } from '@/lib/client/reminders';

type Artifact = { filename: string; mimeType: string; dataBase64: string; size: number };

function dataUrlToArtifact(filename: string, mimeType: string, dataUrl: string, size: number): Artifact {
  return { filename, mimeType, dataBase64: dataUrl.split(',')[1] || '', size };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

const LOCAL_ACTIONS = new Set(['create_pdf_from_photos', 'scan_to_pdf', 'compress_pdf', 'restore_photo', 'create_id_photos']);

export default function ServicioClient({ servicio }: { servicio: AIServicio }) {
  const [mensaje, setMensaje] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [fechaRecordatorio, setFechaRecordatorio] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const accept = useMemo(() => {
    if (servicio.input === 'images') return 'image/*';
    if (servicio.input === 'pdf') return 'application/pdf,.pdf';
    if (servicio.input === 'images-or-pdf') return 'image/*,application/pdf,.pdf';
    return undefined;
  }, [servicio.input]);

  const necesitaArchivo = servicio.input !== 'text';

  async function seleccionar(files: FileList | null) {
    if (!files) return;
    const lista = Array.from(files).filter((file) => {
      if (servicio.input === 'pdf') return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (servicio.input === 'images') return file.type.startsWith('image/');
      return file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    }).slice(0, servicio.input === 'images' ? 20 : 5);
    setArchivos(lista);
    setArtifact(null);
    setRespuesta(lista.length ? lista.length + ' archivo(s) seleccionado(s).' : 'El archivo seleccionado no es compatible.');
  }

  async function ejecutarLocal() {
    if (!archivos.length) throw new Error('Selecciona un archivo.');
    if (servicio.action === 'create_pdf_from_photos' || servicio.action === 'scan_to_pdf') {
      const result = await photosToPdf(archivos);
      return dataUrlToArtifact(result.filename, result.mimeType, result.dataUrl, result.size);
    }
    if (servicio.action === 'compress_pdf') {
      const result = await compressPdf(archivos[0]);
      return dataUrlToArtifact(result.filename, result.mimeType, result.dataUrl, result.size);
    }
    if (servicio.action === 'restore_photo') {
      const result = await restorePhoto(archivos[0]);
      return dataUrlToArtifact(result.filename, result.mimeType, result.dataUrl, result.size);
    }
    const result = await credentialSheet(archivos[0]);
    return dataUrlToArtifact(result.filename, result.mimeType, result.dataUrl, result.size);
  }

  async function ejecutarIA() {
    const dataUrls = await Promise.all(archivos.map(fileToDataUrl));
    const images = archivos.map((file, i) => file.type.startsWith('image/') ? dataUrls[i] : null).filter((x): x is string => !!x);
    const files = archivos.map((file, i) => ({
      data: dataUrls[i],
      mimeType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
      name: file.name,
    }));
    const apiBase = process.env.NEXT_PUBLIC_ASSISTANT_API_URL || (Capacitor.isNativePlatform() ? 'https://papeleria-arcoiris.vercel.app' : '');
    const response = await fetch(apiBase + '/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: mensaje.trim() || 'Analiza el material seleccionado y ayúdame con esta herramienta.',
        context: { currentModule: servicio.id, currentStep: 'inicio', requestedAction: servicio.action },
        images,
        files,
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'No se pudo ejecutar el servicio.');
    if (data.artifact) setArtifact(data.artifact);
    setRespuesta(data.reply || 'Listo.');
  }

  async function iniciarServicio() {
    setCargando(true);
    setArtifact(null);
    try {
      if (LOCAL_ACTIONS.has(servicio.action)) {
        const result = await ejecutarLocal();
        setArtifact(result);
        setRespuesta('Listo. Se procesó en el dispositivo, sin consumir cuota de IA.');
      } else if (servicio.action === 'create_reminder') {
        if (!fechaRecordatorio) throw new Error('Elige fecha y hora.');
        await programarRecordatorio(
          mensaje.trim() || 'Recordatorio de Papelería Arcoíris',
          mensaje.trim() || 'Tienes un recordatorio pendiente.',
          new Date(fechaRecordatorio),
        );
        setRespuesta('Recordatorio programado correctamente.');
      } else {
        await ejecutarIA();
      }
    } catch (error) {
      setRespuesta(error instanceof Error ? error.message : 'No se pudo completar la herramienta.');
    } finally {
      setCargando(false);
    }
  }

  function descargar() {
    if (!artifact) return;
    const link = document.createElement('a');
    link.href = 'data:' + artifact.mimeType + ';base64,' + artifact.dataBase64;
    link.download = artifact.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="min-h-screen bg-papel p-4 pb-10 max-w-md mx-auto">
      <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-carta px-4 py-2 text-base font-bold text-tinta shadow-sm ring-2 ring-tinta/10">
        <span className="text-xl" aria-hidden>←</span> Volver al inicio
      </Link>

      <section className="mt-4 rounded-3xl bg-carta p-5 shadow-md ring-1 ring-tinta/10">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-papel text-3xl" aria-hidden>{servicio.emoji}</span>
          <div>
            <h1 className="text-2xl font-bold text-tinta">{servicio.title}</h1>
            <p className="text-sm leading-5 text-tinta-suave">{servicio.description}</p>
          </div>
        </div>

        {necesitaArchivo && (
          <div className="mt-5">
            <input ref={inputRef} type="file" accept={accept} multiple={servicio.input === 'images' || servicio.input === 'images-or-pdf'} className="sr-only" onChange={(e) => void seleccionar(e.target.files)} />
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => void seleccionar(e.target.files)} />
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded-2xl border-2 border-dashed border-oficial bg-papel px-3 py-4 text-center font-bold text-tinta">
                📎 Seleccionar
              </button>
              {(servicio.input === 'images' || servicio.input === 'images-or-pdf') && (
                <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-2xl border-2 border-dashed border-oficial bg-white px-3 py-4 text-center font-bold text-tinta">
                  📷 Tomar foto
                </button>
              )}
            </div>
            {archivos.length > 0 && (
              <div className="mt-3 rounded-2xl bg-papel p-3 text-sm text-tinta">
                <p className="font-bold">{archivos.length} archivo(s) seleccionado(s)</p>
                <ul className="mt-1 space-y-1">{archivos.slice(0, 5).map((file) => <li key={file.name + file.size} className="truncate">• {file.name}</li>)}</ul>
              </div>
            )}
          </div>
        )}

        {servicio.action === 'create_reminder' && (
          <div className="mt-5">
            <label htmlFor="fecha-recordatorio" className="block text-sm font-bold text-tinta">Fecha y hora</label>
            <input id="fecha-recordatorio" type="datetime-local" value={fechaRecordatorio} onChange={(e) => setFechaRecordatorio(e.target.value)} className="mt-2 w-full rounded-2xl border-2 border-tinta/10 bg-white px-4 py-3 text-base text-tinta" />
          </div>
        )}

        {servicio.action !== 'create_reminder' && servicio.action !== 'create_print_order' && (
          <label className="mt-5 block text-sm font-bold text-tinta" htmlFor="mensaje-servicio">Instrucción</label>
        )}
        {servicio.action !== 'create_reminder' && (
          <textarea id="mensaje-servicio" value={mensaje} onChange={(event) => setMensaje(event.target.value)} placeholder={necesitaArchivo ? 'Ej. resume, analiza, restaura o prepara este material…' : 'Cuéntame qué necesitas…'} className="mt-2 min-h-28 w-full rounded-2xl bg-white p-3 text-base text-tinta outline-none ring-2 ring-tinta/10 focus:ring-oficial" />
        )}

        <button type="button" onClick={() => void iniciarServicio()} disabled={cargando || (necesitaArchivo && archivos.length === 0)} className="mt-4 w-full rounded-2xl bg-oficial px-4 py-4 text-lg font-bold text-carta shadow-sm disabled:opacity-50">
          {cargando ? 'Procesando…' : LOCAL_ACTIONS.has(servicio.action) ? 'Procesar en el dispositivo' : servicio.action === 'create_reminder' ? 'Programar recordatorio' : 'Ejecutar'}
        </button>

        {respuesta && <div className="mt-4 rounded-2xl bg-white p-4 text-base font-medium leading-6 text-tinta ring-2 ring-tinta/10" aria-live="polite">{respuesta}</div>}
        {artifact && (
          <div className="mt-4 rounded-2xl bg-papel p-4 ring-2 ring-tinta/10">
            <p className="font-bold text-tinta">Archivo listo: {artifact.filename}</p>
            <button type="button" onClick={descargar} className="mt-3 w-full rounded-xl bg-oficial px-4 py-3 font-bold text-carta">Descargar archivo</button>
          </div>
        )}
      </section>
    </main>
  );
}
