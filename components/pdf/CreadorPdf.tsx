'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Capacitor } from '@capacitor/core';
import CamaraMultiple from '@/components/pdf/CamaraMultiple';
import EditorPaginas from '@/components/pdf/EditorPaginas';
import MiniaturaLayout from '@/components/pdf/MiniaturaLayout';
import { cargarImagenes, componerPdf, guardarArchivo, liberarImagenes, type ImagenItem } from '@/lib/client/pdfComposer';
import { colocaciones, distribuir, plantillaPorId, PLANTILLAS_POPULARES, type Pagina, type PlantillaId } from '@/lib/pdfLayout';

type Eleccion = PlantillaId | 'libre';
const MAX_IMAGENES = 60;

export default function CreadorPdf() {
  const [imagenes, setImagenes] = useState<ImagenItem[]>([]);
  const [paginas, setPaginas] = useState<Pagina[]>([]);
  const [eleccion, setEleccion] = useState<Eleccion>('uno');
  const [camara, setCamara] = useState<'unica' | 'multiple' | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const galeria = useRef<HTMLInputElement>(null);
  const fotoNativa = useRef<HTMLInputElement>(null);
  const imagenesRef = useRef<ImagenItem[]>([]);
  useEffect(() => {
    imagenesRef.current = imagenes;
  }, [imagenes]);
  useEffect(() => () => liberarImagenes(imagenesRef.current), []);

  const plantillaBase: PlantillaId = eleccion === 'libre' ? 'uno' : eleccion;

  function reacomodar(lista: ImagenItem[], el: Eleccion) {
    if (!lista.length) return setPaginas([]);
    if (el === 'libre') return setPaginas([{ tipo: 'libre', items: [] }]);
    setPaginas(distribuir(lista.map((i) => i.id), el));
  }

  async function agregar(archivos: Array<File | Blob>) {
    if (!archivos.length) return;
    setTrabajando(true);
    const { items, omitidas } = await cargarImagenes(archivos.slice(0, Math.max(0, MAX_IMAGENES - imagenes.length)));
    const todas = [...imagenes, ...items];
    setImagenes(todas);
    reacomodar(todas, eleccion);
    setMensaje(items.length + ' imagen(es) agregada(s).' + (omitidas ? ' ' + omitidas + ' no se pudieron abrir.' : ''));
    setTrabajando(false);
  }

  function elegir(el: Eleccion) {
    setEleccion(el);
    reacomodar(imagenes, el);
  }

  function reiniciar() {
    liberarImagenes(imagenes);
    setImagenes([]);
    setPaginas([]);
    setMensaje('');
  }

  async function crearPdf() {
    setTrabajando(true);
    setMensaje('Creando PDF en tu teléfono…');
    try {
      const bytes = await componerPdf(paginas, imagenes);
      setMensaje(await guardarArchivo(bytes, 'papeleria-arcoiris-' + Date.now() + '.pdf', 'application/pdf'));
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo crear el PDF.');
    } finally {
      setTrabajando(false);
    }
  }

  const hojasConContenido = paginas.filter((p) => colocaciones(p).length > 0).length;

  return (
    <main className="mx-auto min-h-screen max-w-md bg-papel p-4 pb-32">
      <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-carta px-4 py-2 font-bold text-tinta shadow-sm ring-2 ring-tinta/10">← Volver al inicio</Link>
      <h1 className="mt-4 font-display text-2xl font-bold text-tinta">📄 Creador de PDF con diseños</h1>
      <p className="text-sm text-tinta-suave">Todo se hace en tu teléfono: tus fotos no se suben a ningún servidor.</p>

      {/* 1. Fotos */}
      <section className="mt-4 rounded-3xl bg-carta p-4 ring-1 ring-tinta/10">
        <h2 className="mb-3 font-bold text-tinta">1. Agrega tus fotos</h2>
        <input ref={galeria} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void agregar(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <input ref={fotoNativa} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void agregar(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={() => galeria.current?.click()} className="rounded-2xl bg-papel p-3 text-left font-bold text-tinta ring-2 ring-tinta/10">🖼️ Subir desde galería / almacenamiento</button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => (Capacitor.isNativePlatform() ? fotoNativa.current?.click() : setCamara('unica'))}
              className="rounded-2xl bg-papel p-3 font-bold text-tinta ring-2 ring-tinta/10"
            >
              📷 Foto única
            </button>
            <button type="button" onClick={() => setCamara('multiple')} className="rounded-2xl bg-papel p-3 font-bold text-tinta ring-2 ring-tinta/10">📸 Fotos múltiples</button>
          </div>
        </div>
        {imagenes.length > 0 && (
          <div className="mt-3 flex items-center justify-between text-sm text-tinta">
            <span>{imagenes.length} foto(s) cargada(s)</span>
            <button type="button" onClick={reiniciar} className="font-bold text-red-700 underline">Vaciar</button>
          </div>
        )}
      </section>

      {/* 2. Diseño */}
      <section className="mt-4 rounded-3xl bg-carta p-4 ring-1 ring-tinta/10">
        <h2 className="mb-3 font-bold text-tinta">2. Elige el diseño</h2>
        <div className="grid grid-cols-2 gap-3">
          {PLANTILLAS_POPULARES.map((id) => {
            const n = plantillaPorId(id).ranuras.length;
            const activa = eleccion === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => elegir(id)}
                aria-pressed={activa}
                className={'flex flex-col items-center gap-2 rounded-2xl p-3 text-center ring-2 ' + (activa ? 'bg-oficial/10 ring-oficial' : 'bg-papel ring-tinta/10')}
              >
                <MiniaturaLayout plantilla={id} ancho={70} />
                <span className="text-sm font-bold text-tinta">{n === 1 ? '1 por página' : n + ' por página'}</span>
                <span className="text-xs text-tinta-suave">{id === 'uno' ? 'Completa' : id === 'dos-50' ? '50% y 50%' : id === 'tres-1-2' ? 'Mixto' : 'Cuadrícula 2x2'}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => elegir('libre')}
          aria-pressed={eleccion === 'libre'}
          className={'mt-3 w-full rounded-2xl p-3 text-left ring-2 ' + (eleccion === 'libre' ? 'bg-oficial/10 ring-oficial' : 'bg-papel ring-tinta/10')}
        >
          <span className="block font-bold text-tinta">✋ Acomodo libre / personalizado</span>
          <span className="text-xs text-tinta-suave">Tú decides cuántas imágenes van en cada hoja y de qué tamaño.</span>
        </button>
      </section>

      {/* 3. Editor */}
      {imagenes.length > 0 && (
        <section className="mt-4" aria-label="Hojas del PDF">
          <h2 className="mb-2 font-bold text-tinta">3. Revisa y ajusta las hojas</h2>
          <EditorPaginas
            imagenes={imagenes}
            paginas={paginas}
            onCambio={setPaginas}
            plantillaPorDefecto={plantillaBase}
          />
        </section>
      )}

      {mensaje && <p className="mt-4 rounded-2xl bg-carta px-4 py-3 text-sm font-semibold text-tinta ring-2 ring-tinta/10" aria-live="polite">{mensaje}</p>}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/10 bg-carta/95 p-4 backdrop-blur" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }}>
        <div className="mx-auto max-w-md">
          <button
            type="button"
            onClick={() => void crearPdf()}
            disabled={trabajando || !imagenes.length || !hojasConContenido}
            className="w-full rounded-2xl bg-oficial py-4 text-lg font-bold text-white disabled:opacity-40"
          >
            {trabajando ? 'Trabajando…' : 'Crear PDF (' + hojasConContenido + ' hoja' + (hojasConContenido === 1 ? '' : 's') + ')'}
          </button>
        </div>
      </div>

      {camara && (
        <CamaraMultiple
          modo={camara}
          onCancelar={() => setCamara(null)}
          onTerminar={(fotos) => {
            setCamara(null);
            void agregar(fotos);
          }}
        />
      )}
    </main>
  );
}
