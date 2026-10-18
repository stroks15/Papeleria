'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import EditorPaginas from '@/components/pdf/EditorPaginas';
import MiniaturaLayout from '@/components/pdf/MiniaturaLayout';
import { extraerImagenes, type ImagenCruda } from '@/lib/client/docImages';
import { cargarImagen, componerPdf, guardarArchivo, liberarImagenes, type ImagenItem } from '@/lib/client/pdfComposer';
import { colocaciones, paginaDePlantilla, PLANTILLAS, type Pagina, type PlantillaId } from '@/lib/pdfLayout';

const MAX_MB = 80;

async function crudaABlob(c: ImagenCruda): Promise<Blob | null> {
  if (c.tipo === 'archivo') return new Blob([new Uint8Array(c.bytes)], { type: c.mime });
  const canvas = document.createElement('canvas');
  canvas.width = c.ancho;
  canvas.height = c.alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(new ImageData(new Uint8ClampedArray(c.rgba), c.ancho, c.alto), 0, 0);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export default function ExtractorImagenes() {
  const [fase, setFase] = useState<'espera' | 'analizando' | 'listo'>('espera');
  const [encontradas, setEncontradas] = useState(0);
  const [omitidas, setOmitidas] = useState(0);
  const [imagenes, setImagenes] = useState<ImagenItem[]>([]);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [defecto, setDefecto] = useState<PlantillaId>('cuatro');
  const [mensaje, setMensaje] = useState('');
  const [arrastrando, setArrastrando] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  const imagenesRef = useRef<ImagenItem[]>([]);
  useEffect(() => {
    imagenesRef.current = imagenes;
  }, [imagenes]);
  useEffect(() => () => liberarImagenes(imagenesRef.current), []);

  async function procesar(archivo: File | undefined) {
    if (!archivo) return;
    const nombre = archivo.name.toLowerCase();
    if (!/\.(pdf|docx?)$/.test(nombre) && archivo.type !== 'application/pdf') {
      setMensaje('Solo se aceptan archivos PDF, DOC o DOCX.');
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      setMensaje('El archivo supera ' + MAX_MB + ' MB.');
      return;
    }
    liberarImagenes(imagenes);
    setImagenes([]);
    setPaginas([]);
    setMensaje('');
    setEncontradas(0);
    setFase('analizando');
    try {
      const { imagenes: crudas, omitidas: saltadas } = await extraerImagenes(archivo, setEncontradas);
      const items: ImagenItem[] = [];
      let fallidas = saltadas;
      for (const c of crudas) {
        const blob = await crudaABlob(c);
        const item = blob ? await cargarImagen(blob, c.nombre) : null;
        if (item) items.push(item);
        else fallidas += 1;
      }
      setOmitidas(fallidas);
      setImagenes(items);
      setEncontradas(items.length);
      setPaginas(items.length ? [paginaDePlantilla(defecto, items.map((i) => i.id))] : []);
      setFase('listo');
      if (!items.length) setMensaje('No se encontraron imágenes que se puedan extraer en este documento.');
    } catch (e) {
      setFase('espera');
      setMensaje(e instanceof Error ? e.message : 'No se pudo analizar el documento.');
    }
  }

  async function crearPdf() {
    setTrabajando(true);
    setMensaje('Creando PDF en tu teléfono…');
    try {
      const bytes = await componerPdf(paginas, imagenes);
      setMensaje(await guardarArchivo(bytes, 'imagenes-reorganizadas-' + Date.now() + '.pdf', 'application/pdf'));
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo crear el PDF.');
    } finally {
      setTrabajando(false);
    }
  }

  const hojas = paginas.filter((p) => colocaciones(p).length > 0).length;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-papel p-4 pb-32">
      <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-carta px-4 py-2 font-bold text-tinta shadow-sm ring-2 ring-tinta/10">← Volver al inicio</Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-tinta">🗂️ Reorganizar imágenes de un documento</h1>
      <p className="text-sm text-tinta-suave">Sube un PDF o Word: sacamos sus imágenes y las acomodas en hojas nuevas. Todo ocurre en tu teléfono.</p>

      <div
        onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => { e.preventDefault(); setArrastrando(false); void procesar(e.dataTransfer.files?.[0]); }}
        className={'mt-4 rounded-3xl border-2 border-dashed p-6 text-center ' + (arrastrando ? 'border-oficial bg-oficial/10' : 'border-oficial/60 bg-carta')}
      >
        <input ref={entrada} type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => { void procesar(e.target.files?.[0]); e.target.value = ''; }} />
        <p className="text-4xl" aria-hidden>📥</p>
        <p className="mt-2 font-bold text-tinta">Arrastra aquí tu archivo o</p>
        <button type="button" onClick={() => entrada.current?.click()} className="mt-2 rounded-2xl bg-oficial px-5 py-3 font-bold text-white">Elegir PDF, DOC o DOCX</button>
        <p className="mt-2 text-xs text-tinta-suave">Máximo {MAX_MB} MB</p>
      </div>

      {fase === 'analizando' && (
        <p className="mt-4 rounded-2xl bg-carta px-4 py-3 text-sm font-bold text-tinta ring-2 ring-tinta/10" aria-live="polite">
          Analizando documento… Se encontraron {encontradas} imágenes
        </p>
      )}
      {fase === 'listo' && imagenes.length > 0 && (
        <p className="mt-4 rounded-2xl bg-carta px-4 py-3 text-sm font-bold text-tinta ring-2 ring-tinta/10" aria-live="polite">
          Listo. Se encontraron {imagenes.length} imágenes{omitidas ? ' (' + omitidas + ' en un formato que no se puede leer)' : ''}.
        </p>
      )}

      {fase === 'listo' && imagenes.length > 0 && (
        <>
          <section className="mt-4 rounded-3xl bg-carta p-3 ring-1 ring-tinta/10">
            <h2 className="mb-2 text-sm font-bold text-tinta">Diseño para las hojas nuevas</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {PLANTILLAS.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => setDefecto(pl.id)}
                  aria-label={pl.nombre}
                  title={pl.nombre}
                  className={'shrink-0 rounded-lg p-1 ring-2 ' + (defecto === pl.id ? 'bg-oficial/10 ring-oficial' : 'ring-transparent')}
                >
                  <MiniaturaLayout plantilla={pl.id} ancho={34} />
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-tinta-suave">Cada hoja puede tener su propio diseño: cámbialo dentro de la hoja.</p>
          </section>
          <section className="mt-4" aria-label="Hojas del PDF">
            <EditorPaginas imagenes={imagenes} paginas={paginas} onCambio={setPaginas} plantillaPorDefecto={defecto} />
          </section>
        </>
      )}

      {mensaje && <p className="mt-4 rounded-2xl bg-carta px-4 py-3 text-sm font-semibold text-tinta ring-2 ring-tinta/10" aria-live="polite">{mensaje}</p>}

      {imagenes.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-carta/95 p-4 backdrop-blur" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
          <div className="mx-auto max-w-md">
            <button type="button" onClick={() => void crearPdf()} disabled={trabajando || !hojas} className="w-full rounded-2xl bg-oficial py-4 text-lg font-bold text-white disabled:opacity-40">
              {trabajando ? 'Trabajando…' : 'Crear PDF (' + hojas + ' hoja' + (hojas === 1 ? '' : 's') + ')'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
