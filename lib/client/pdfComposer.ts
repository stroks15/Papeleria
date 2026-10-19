'use client';

import { Capacitor } from '@capacitor/core';
import { PDFDocument } from 'pdf-lib';
import { decodificarImagen, imagenAJpeg } from '@/lib/client/imageDecode';
import { ajustarContener, colocaciones, HOJA, rectAPdf, type Pagina } from '@/lib/pdfLayout';

/** Imagen cargada en memoria del dispositivo. Nada de esto sale del teléfono. */
export type ImagenItem = {
  id: string;
  nombre: string;
  url: string; // object URL para la vista previa
  ancho: number;
  alto: number;
  blob: Blob;
};

let contador = 0;
function nuevoId(): string {
  contador += 1;
  return 'img-' + Date.now().toString(36) + '-' + contador;
}

export async function cargarImagen(blob: Blob, nombre: string): Promise<ImagenItem | null> {
  try {
    const d = await decodificarImagen(blob, nombre);
    const item: ImagenItem = { id: nuevoId(), nombre, url: URL.createObjectURL(d.blob), ancho: d.ancho, alto: d.alto, blob: d.blob };
    d.liberar();
    return item;
  } catch {
    return null; // PDF, HEIC, archivo dañado o formato que el WebView no sabe abrir
  }
}

export async function cargarImagenes(archivos: Array<File | Blob>): Promise<{ items: ImagenItem[]; omitidas: number }> {
  const items: ImagenItem[] = [];
  let omitidas = 0;
  for (const a of archivos) {
    const nombre = a instanceof File ? a.name : 'imagen';
    const item = await cargarImagen(a, nombre);
    if (item) items.push(item);
    else omitidas += 1;
  }
  return { items, omitidas };
}

export function liberarImagenes(items: ImagenItem[]): void {
  for (const it of items) URL.revokeObjectURL(it.url);
}

const MAX_LADO_PDF = 3000;

async function aJpeg(blob: Blob): Promise<Uint8Array> {
  const { blob: jpg } = await imagenAJpeg(blob, 'imagen', { maxLado: MAX_LADO_PDF, calidad: 0.92 });
  return new Uint8Array(await jpg.arrayBuffer());
}

/** Genera el PDF en el dispositivo. Las imágenes se ajustan sin deformarse. */
export async function componerPdf(paginas: Pagina[], imagenes: ImagenItem[]): Promise<Uint8Array> {
  const porId = new Map(imagenes.map((i) => [i.id, i]));
  const pdf = await PDFDocument.create();
  const incrustadas = new Map<string, Awaited<ReturnType<PDFDocument['embedJpg']>>>();
  let hojas = 0;

  for (const pagina of paginas) {
    const cols = colocaciones(pagina);
    if (!cols.length) continue; // hoja vacía: no se exporta
    const hoja = pdf.addPage([HOJA.ancho, HOJA.alto]);
    hojas += 1;
    for (const col of cols) {
      const origen = porId.get(col.imagenId);
      if (!origen) continue;
      let img = incrustadas.get(origen.id);
      if (!img) {
        img = await pdf.embedJpg(await aJpeg(origen.blob));
        incrustadas.set(origen.id, img);
      }
      const caja = rectAPdf(col.rect);
      const ajuste = ajustarContener(img.width, img.height, caja);
      hoja.drawImage(img, { x: caja.x + ajuste.dx, y: caja.y + ajuste.dy, width: ajuste.w, height: ajuste.h });
    }
  }
  if (!hojas) throw new Error('No hay imágenes colocadas en ninguna hoja.');
  return pdf.save({ useObjectStreams: true, addDefaultPage: false });
}

function aBase64(bytes: Uint8Array): string {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
  return btoa(binario);
}

/** Guarda en Descargas (APK) o descarga el archivo (web). Devuelve un mensaje para la persona. */
export async function guardarArchivo(bytes: Uint8Array, nombre: string, mimeType: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const { guardarArchivoEnAndroid } = await import('@/lib/nativeFiles');
    await guardarArchivoEnAndroid(nombre, mimeType, aBase64(bytes));
    return 'Guardado en Descargas/Papelería Arcoíris: ' + nombre;
  }
  const copia = new Uint8Array(bytes);
  const url = URL.createObjectURL(new Blob([copia], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'Descargado: ' + nombre;
}
