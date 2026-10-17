'use client';

import {
  decodePDFRawStream,
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
} from 'pdf-lib';

/**
 * Extracción de imágenes de PDF y DOCX 100% en el dispositivo, sin librerías
 * extra: PDF con pdf-lib (ya incluida) y DOCX leyendo el ZIP con las APIs del
 * navegador (DecompressionStream).
 */

export type ImagenCruda =
  | { tipo: 'archivo'; nombre: string; mime: string; bytes: Uint8Array } // JPEG/PNG/GIF/WebP originales
  | { tipo: 'pixeles'; nombre: string; ancho: number; alto: number; rgba: Uint8ClampedArray };

export type ResultadoExtraccion = { imagenes: ImagenCruda[]; omitidas: number };
export type AlProgresar = (encontradas: number) => void;

const LADO_MINIMO = 24; // descarta puntitos y adornos

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
function nombresFiltros(dict: PDFDict): string[] {
  const f = dict.lookup(PDFName.of('Filter'));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) {
    const out: string[] = [];
    for (let i = 0; i < f.size(); i += 1) {
      const x = f.lookup(i);
      if (x instanceof PDFName) out.push(x.decodeText());
    }
    return out;
  }
  return [];
}

function numero(dict: PDFDict, clave: string): number {
  const v = dict.lookup(PDFName.of(clave));
  return v instanceof PDFNumber ? v.asNumber() : 0;
}

type Muestras = { ancho: number; alto: number; datos: Uint8Array };

/** Decodifica un stream de imagen a muestras de 8 bits por componente. null si no se soporta. */
function muestrasDe(stream: PDFRawStream): Muestras | null {
  const dict = stream.dict;
  const ancho = numero(dict, 'Width');
  const alto = numero(dict, 'Height');
  const bpc = numero(dict, 'BitsPerComponent') || 8;
  if (!ancho || !alto || bpc !== 8) return null;
  if (dict.lookup(PDFName.of('ImageMask')) === PDFBool.True) return null;
  const datos = decodePDFRawStream(stream).decode();
  return { ancho, alto, datos };
}

type EspacioColor = { comps: number; paleta?: Uint8Array; baseComps?: number };

function espacioDeColor(dict: PDFDict): EspacioColor | null {
  const cs = dict.lookup(PDFName.of('ColorSpace'));
  if (cs instanceof PDFName) {
    const n = cs.decodeText();
    if (n === 'DeviceRGB') return { comps: 3 };
    if (n === 'DeviceGray') return { comps: 1 };
    if (n === 'DeviceCMYK') return { comps: 4 };
    return null;
  }
  if (cs instanceof PDFArray && cs.size() > 0) {
    const tipo = cs.lookup(0);
    if (!(tipo instanceof PDFName)) return null;
    const t = tipo.decodeText();
    if (t === 'ICCBased') {
      const perfil = cs.lookup(1);
      if (perfil instanceof PDFRawStream) {
        const n = numero(perfil.dict, 'N');
        if (n === 1 || n === 3 || n === 4) return { comps: n };
      }
      return null;
    }
    if (t === 'CalRGB') return { comps: 3 };
    if (t === 'CalGray') return { comps: 1 };
    if (t === 'Indexed') {
      const base = cs.lookup(1);
      const tabla = cs.lookup(3);
      let baseComps = 0;
      if (base instanceof PDFName) baseComps = base.decodeText() === 'DeviceRGB' ? 3 : base.decodeText() === 'DeviceGray' ? 1 : 0;
      else if (base instanceof PDFArray && base.lookup(0) instanceof PDFName) {
        const bt = (base.lookup(0) as PDFName).decodeText();
        baseComps = bt === 'CalRGB' ? 3 : bt === 'CalGray' ? 1 : 0;
      }
      let paleta: Uint8Array | null = null;
      if (tabla instanceof PDFRawStream) paleta = decodePDFRawStream(tabla).decode();
      else if (tabla instanceof PDFHexString || tabla instanceof PDFString) paleta = tabla.asBytes();
      if (!paleta || !baseComps) return null;
      return { comps: 1, paleta, baseComps };
    }
  }
  return null;
}

function aRgba(m: Muestras, es: EspacioColor, alfa: Uint8Array | null): Uint8ClampedArray {
  const total = m.ancho * m.alto;
  const out = new Uint8ClampedArray(total * 4);
  const d = m.datos;
  for (let i = 0; i < total; i += 1) {
    let r = 0;
    let g = 0;
    let b = 0;
    if (es.paleta && es.baseComps) {
      const idx = d[i] * es.baseComps;
      if (es.baseComps === 3) {
        r = es.paleta[idx];
        g = es.paleta[idx + 1];
        b = es.paleta[idx + 2];
      } else {
        r = g = b = es.paleta[idx];
      }
    } else if (es.comps === 1) {
      r = g = b = d[i];
    } else if (es.comps === 3) {
      r = d[i * 3];
      g = d[i * 3 + 1];
      b = d[i * 3 + 2];
    } else {
      const k = d[i * 4 + 3];
      r = ((255 - d[i * 4]) * (255 - k)) / 255;
      g = ((255 - d[i * 4 + 1]) * (255 - k)) / 255;
      b = ((255 - d[i * 4 + 2]) * (255 - k)) / 255;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = alfa ? alfa[i] : 255;
  }
  return out;
}

function esperado(m: Muestras, comps: number): boolean {
  return m.datos.length >= m.ancho * m.alto * comps;
}

function imagenDeStream(stream: PDFRawStream, nombre: string): ImagenCruda | 'omitida' | null {
  const dict = stream.dict;
  const ancho = numero(dict, 'Width');
  const alto = numero(dict, 'Height');
  if (ancho < LADO_MINIMO || alto < LADO_MINIMO) return null; // decoración: ni se cuenta
  const filtros = nombresFiltros(dict);

  // JPEG: los bytes del PDF YA son un JPEG completo, a su resolución original.
  if (filtros.length === 1 && filtros[0] === 'DCTDecode') {
    return { tipo: 'archivo', nombre: nombre + '.jpg', mime: 'image/jpeg', bytes: stream.contents };
  }
  if (filtros.some((f) => f === 'DCTDecode' || f === 'JPXDecode' || f === 'CCITTFaxDecode' || f === 'JBIG2Decode')) return 'omitida';

  try {
    const m = muestrasDe(stream);
    const es = espacioDeColor(dict);
    if (!m || !es) return 'omitida';
    if (!esperado(m, es.comps)) return 'omitida';
    let alfa: Uint8Array | null = null;
    const sm = dict.lookup(PDFName.of('SMask'));
    if (sm instanceof PDFRawStream && numero(sm.dict, 'Width') === ancho && numero(sm.dict, 'Height') === alto) {
      const f = nombresFiltros(sm.dict);
      if (!f.some((x) => x === 'DCTDecode' || x === 'JPXDecode')) {
        const a = decodePDFRawStream(sm).decode();
        if (a.length >= ancho * alto) alfa = a;
      }
    }
    return { tipo: 'pixeles', nombre: nombre + '.png', ancho, alto, rgba: aRgba(m, es, alfa) };
  } catch {
    return 'omitida';
  }
}

function recorrerRecursos(recursos: PDFDict | undefined, vistos: Set<string>, salida: PDFRawStream[], profundidad: number): void {
  if (!recursos || profundidad > 3) return;
  const xobjs = recursos.lookup(PDFName.of('XObject'));
  if (!(xobjs instanceof PDFDict)) return;
  for (const [, valor] of xobjs.entries()) {
    const clave = valor instanceof PDFRef ? valor.tag : '';
    if (clave && vistos.has(clave)) continue;
    if (clave) vistos.add(clave);
    const obj = valor instanceof PDFRef ? xobjs.context.lookup(valor) : valor;
    if (!(obj instanceof PDFRawStream)) continue;
    const sub = obj.dict.lookup(PDFName.of('Subtype'));
    if (sub === PDFName.of('Image')) salida.push(obj);
    else if (sub === PDFName.of('Form')) {
      const r = obj.dict.lookup(PDFName.of('Resources'));
      if (r instanceof PDFDict) recorrerRecursos(r, vistos, salida, profundidad + 1);
    }
  }
}

export async function extraerImagenesDePdf(bytes: Uint8Array, alProgresar?: AlProgresar): Promise<ResultadoExtraccion> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const vistos = new Set<string>();
  const streams: PDFRawStream[] = [];
  for (const pagina of doc.getPages()) {
    const recursos = pagina.node.Resources();
    recorrerRecursos(recursos, vistos, streams, 0); // en orden de página
  }
  const imagenes: ImagenCruda[] = [];
  let omitidas = 0;
  for (const s of streams) {
    const r = imagenDeStream(s, 'imagen-' + (imagenes.length + 1));
    if (r === null) continue;
    if (r === 'omitida') {
      omitidas += 1;
      continue;
    }
    imagenes.push(r);
    alProgresar?.(imagenes.length);
  }
  return { imagenes, omitidas };
}

// ---------------------------------------------------------------------------
// DOCX (ZIP)
// ---------------------------------------------------------------------------
type EntradaZip = { nombre: string; metodo: number; tamComprimido: number; despl: number };

function leerEntradasZip(b: Uint8Array): EntradaZip[] {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i -= 1) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('El archivo no es un documento válido.');
  const total = v.getUint16(eocd + 10, true);
  let pos = v.getUint32(eocd + 16, true);
  const entradas: EntradaZip[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < total; i += 1) {
    if (v.getUint32(pos, true) !== 0x02014b50) break;
    const metodo = v.getUint16(pos + 10, true);
    const tamComprimido = v.getUint32(pos + 20, true);
    const lonNombre = v.getUint16(pos + 28, true);
    const lonExtra = v.getUint16(pos + 30, true);
    const lonCom = v.getUint16(pos + 32, true);
    const despl = v.getUint32(pos + 42, true);
    entradas.push({ nombre: dec.decode(b.subarray(pos + 46, pos + 46 + lonNombre)), metodo, tamComprimido, despl });
    pos += 46 + lonNombre + lonExtra + lonCom;
  }
  return entradas;
}

async function inflarRaw(datos: Uint8Array): Promise<Uint8Array> {
  const copia = new Uint8Array(datos); // ArrayBuffer propio (no SharedArrayBuffer)
  const flujo = new Blob([copia]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function leerEntrada(b: Uint8Array, e: EntradaZip): Promise<Uint8Array> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (v.getUint32(e.despl, true) !== 0x04034b50) throw new Error('Documento dañado.');
  const inicio = e.despl + 30 + v.getUint16(e.despl + 26, true) + v.getUint16(e.despl + 28, true);
  const datos = b.subarray(inicio, inicio + e.tamComprimido);
  if (e.metodo === 0) return datos;
  if (e.metodo === 8) return inflarRaw(datos);
  throw new Error('Compresión no soportada.');
}

function mimeDe(nombre: string): string | null {
  const ext = nombre.toLowerCase().split('.').pop() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'bmp') return 'image/bmp';
  return null; // emf, wmf, tiff…
}

export function esZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function esOleAntiguo(bytes: Uint8Array): boolean {
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

export async function extraerImagenesDeDocx(bytes: Uint8Array, alProgresar?: AlProgresar): Promise<ResultadoExtraccion> {
  const entradas = leerEntradasZip(bytes);
  const media = entradas.filter((e) => /^word\/media\//i.test(e.nombre) && !e.nombre.endsWith('/'));
  const dec = new TextDecoder();

  // Orden de aparición en el documento: document.xml + sus relaciones.
  const orden: string[] = [];
  try {
    const docXml = entradas.find((e) => e.nombre === 'word/document.xml');
    const rels = entradas.find((e) => e.nombre === 'word/_rels/document.xml.rels');
    if (docXml && rels) {
      const xml = dec.decode(await leerEntrada(bytes, docXml));
      const relXml = dec.decode(await leerEntrada(bytes, rels));
      const mapa = new Map<string, string>();
      for (const m of Array.from(relXml.matchAll(/<Relationship\b[^>]*>/g))) {
        const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
        const destino = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
        if (id && destino) mapa.set(id, 'word/' + destino.replace(/^\/?(word\/)?/, ''));
      }
      for (const m of Array.from(xml.matchAll(/r:(?:embed|id)="([^"]+)"/g))) {
        const destino = mapa.get(m[1]);
        if (destino && !orden.includes(destino)) orden.push(destino);
      }
    }
  } catch {
    /* sin orden: se usa el orden del ZIP */
  }
  media.sort((a, b) => {
    const ia = orden.indexOf(a.nombre);
    const ib = orden.indexOf(b.nombre);
    return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
  });

  const imagenes: ImagenCruda[] = [];
  let omitidas = 0;
  for (const e of media) {
    const mime = mimeDe(e.nombre);
    if (!mime) {
      omitidas += 1;
      continue;
    }
    try {
      imagenes.push({ tipo: 'archivo', nombre: e.nombre.split('/').pop() || 'imagen', mime, bytes: await leerEntrada(bytes, e) });
      alProgresar?.(imagenes.length);
    } catch {
      omitidas += 1;
    }
  }
  return { imagenes, omitidas };
}

// ---------------------------------------------------------------------------
// Punto de entrada
// ---------------------------------------------------------------------------
export async function extraerImagenes(archivo: File, alProgresar?: AlProgresar): Promise<ResultadoExtraccion> {
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const nombre = archivo.name.toLowerCase();
  const esPdf = nombre.endsWith('.pdf') || archivo.type === 'application/pdf' || String.fromCharCode(...bytes.subarray(0, 4)) === '%PDF';
  if (esPdf) return extraerImagenesDePdf(bytes, alProgresar);
  if (esZip(bytes)) return extraerImagenesDeDocx(bytes, alProgresar);
  if (esOleAntiguo(bytes)) {
    throw new Error('Este es un .doc antiguo y no se puede leer en el teléfono. Ábrelo en Word y guárdalo como .docx; luego vuelve a subirlo.');
  }
  throw new Error('Formato no soportado. Sube un PDF, DOC o DOCX.');
}
