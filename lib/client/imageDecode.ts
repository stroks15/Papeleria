'use client';

/**
 * Decodificador de imágenes robusto para el WebView de la APK.
 *
 * El error "The source image could not be decoded" aparece cuando
 * createImageBitmap recibe algo que no puede abrir: un PDF, una foto HEIC,
 * un archivo sin tipo MIME (frecuente en Android) o un Blob con tipo incorrecto.
 * Aquí se detecta el formato real por los primeros bytes, se reconstruye el
 * Blob con el MIME correcto, se intenta createImageBitmap y, si falla, <img>.
 */

export type TipoDetectado = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/bmp' | 'image/avif' | 'heic' | 'pdf' | null;

export type Decodificada = {
  fuente: CanvasImageSource;
  ancho: number;
  alto: number;
  /** Blob normalizado (con el MIME real). */
  blob: Blob;
  liberar: () => void;
};

function ascii(b: Uint8Array, desde: number, hasta: number): string {
  let s = '';
  for (let i = desde; i < Math.min(hasta, b.length); i += 1) s += String.fromCharCode(b[i]);
  return s;
}

export function detectarTipo(b: Uint8Array): TipoDetectado {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && ascii(b, 1, 4) === 'PNG') return 'image/png';
  const cab = ascii(b, 0, 4);
  if (cab === 'GIF8') return 'image/gif';
  if (cab === '%PDF') return 'pdf';
  if (cab === 'RIFF' && ascii(b, 8, 12) === 'WEBP') return 'image/webp';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (ascii(b, 4, 8) === 'ftyp') {
    const marca = ascii(b, 8, 12);
    if (marca === 'avif' || marca === 'avis') return 'image/avif';
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(marca)) return 'heic';
  }
  return null;
}

/** true si el archivo es realmente un PDF (no se fía de la extensión ni del MIME). */
export async function esArchivoPdf(archivo: Blob): Promise<boolean> {
  try {
    const cab = new Uint8Array(await archivo.slice(0, 5).arrayBuffer());
    return ascii(cab, 0, 4) === '%PDF';
  } catch {
    return false;
  }
}

/** Lee el archivo a memoria y lo devuelve como Blob con el MIME real, o lanza un error claro. */
export async function prepararBlob(origen: Blob, nombre = 'imagen'): Promise<Blob> {
  const buf = await origen.arrayBuffer().catch(() => null);
  if (!buf) throw new Error('No se pudo leer "' + nombre + '". Vuelve a elegirla.');
  if (!buf.byteLength) throw new Error('"' + nombre + '" está vacía.');
  const tipo = detectarTipo(new Uint8Array(buf, 0, Math.min(32, buf.byteLength)));
  if (tipo === 'pdf') throw new Error('"' + nombre + '" es un PDF, no una imagen.');
  if (tipo === 'heic') {
    throw new Error('"' + nombre + '" está en formato HEIC/HEIF y no se puede abrir aquí. Conviértela a JPG o tómala de nuevo con la cámara de la app.');
  }
  if (!tipo) throw new Error('"' + nombre + '" no es una imagen compatible. Usa JPG, PNG, WebP o GIF.');
  return new Blob([buf], { type: tipo });
}

function cargarConImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img-error'));
    img.src = url;
  });
}

/** Decodifica con createImageBitmap y, si el WebView no puede, con <img>. */
export async function decodificarImagen(origen: Blob, nombre = 'imagen'): Promise<Decodificada> {
  const blob = await prepararBlob(origen, nombre);

  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      return { fuente: bmp, ancho: bmp.width, alto: bmp.height, blob, liberar: () => bmp.close() };
    } catch {
      /* se intenta con <img> */
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const img = await cargarConImg(url);
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('img-vacia');
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, blob, liberar: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('No se pudo abrir "' + nombre + '". Puede estar dañada o ser demasiado grande; prueba con otra foto JPG o PNG.');
  }
}

/** Convierte cualquier imagen compatible a JPEG (fondo blanco, lado máximo configurable). */
export async function imagenAJpeg(
  origen: Blob,
  nombre = 'imagen',
  opciones: { maxLado?: number; calidad?: number } = {},
): Promise<{ blob: Blob; ancho: number; alto: number }> {
  const { maxLado = 3000, calidad = 0.92 } = opciones;
  const d = await decodificarImagen(origen, nombre);
  try {
    const escala = Math.min(1, maxLado / Math.max(d.ancho, d.alto));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(d.ancho * escala));
    canvas.height = Math.max(1, Math.round(d.alto * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible en este dispositivo.');
    ctx.fillStyle = '#FFFFFF'; // PNG con transparencia: fondo blanco
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(d.fuente, 0, 0, canvas.width, canvas.height);
    const ancho = canvas.width;
    const alto = canvas.height;
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo convertir "' + nombre + '".'))), 'image/jpeg', calidad),
    );
    canvas.width = 0;
    canvas.height = 0;
    return { blob, ancho, alto };
  } finally {
    d.liberar();
  }
}
