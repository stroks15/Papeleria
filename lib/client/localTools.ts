import { PDFDocument } from 'pdf-lib';
import { decodificarImagen, esArchivoPdf, imagenAJpeg } from '@/lib/client/imageDecode';

export type LocalArtifact = { filename: string; mimeType: string; dataUrl: string; size: number };

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return 'data:' + mimeType + ';base64,' + btoa(binary);
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number, error: string): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(error))), tipo, calidad));
}

/** Foto(s) o PDF(s) -> un solo PDF. Los PDFs se anexan tal cual; las imágenes se centran en hoja A4. */
export async function photosToPdf(files: File[]): Promise<LocalArtifact> {
  if (!files.length || files.length > 20) throw new Error('Selecciona entre 1 y 20 imágenes.');
  const pdf = await PDFDocument.create();
  for (const file of files) {
    if (await esArchivoPdf(file)) {
      const origen = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
      const paginas = await pdf.copyPages(origen, origen.getPageIndices());
      paginas.forEach((p) => pdf.addPage(p));
      continue;
    }
    const { blob } = await imagenAJpeg(file, file.name || 'imagen', { maxLado: 2200, calidad: 0.9 });
    const image = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const page = pdf.addPage([595.28, 841.89]);
    const margin = 28;
    const scale = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height, 1);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  }
  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  return { filename: 'papeleria-arcoiris.pdf', mimeType: 'application/pdf', dataUrl: bytesToDataUrl(bytes, 'application/pdf'), size: bytes.byteLength };
}

export const scanToPdf = photosToPdf;

export async function compressPdf(file: File): Promise<LocalArtifact> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf') && !(await esArchivoPdf(file))) throw new Error('Selecciona un PDF.');
  if (file.size > 50 * 1024 * 1024) throw new Error('El PDF supera 50 MB.');
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false });
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, source.getPageIndices());
  pages.forEach((page) => output.addPage(page));
  const bytes = await output.save({ useObjectStreams: true, addDefaultPage: false });
  return { filename: file.name.replace(/\.pdf$/i, '') + '-optimizado.pdf', mimeType: 'application/pdf', dataUrl: bytesToDataUrl(bytes, 'application/pdf'), size: bytes.byteLength };
}

export async function restorePhoto(file: File): Promise<LocalArtifact> {
  const { blob: jpeg } = await imagenAJpeg(file, file.name || 'foto', { maxLado: 2200, calidad: 0.94 });
  const d = await decodificarImagen(jpeg, 'foto');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = d.ancho;
    canvas.height = d.alto;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible.');
    context.filter = 'contrast(1.06) saturate(1.05)';
    context.drawImage(d.fuente, 0, 0);
    const blob = await aBlob(canvas, 'image/jpeg', 0.94, 'No se pudo restaurar la foto.');
    return { filename: 'foto-restaurada.jpg', mimeType: 'image/jpeg', dataUrl: await readAsDataUrl(blob), size: blob.size };
  } finally {
    d.liberar();
  }
}

export async function credentialSheet(file: File): Promise<LocalArtifact> {
  const d = await decodificarImagen(file, file.name || 'foto');
  try {
    const targetW = 354;
    const targetH = 472;
    const canvas = document.createElement('canvas');
    canvas.width = targetW * 3;
    canvas.height = targetH * 3;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas no disponible.');
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const sourceRatio = d.ancho / d.alto;
    const targetRatio = targetW / targetH;
    let sx = 0;
    let sy = 0;
    let sw = d.ancho;
    let sh = d.alto;
    if (sourceRatio > targetRatio) {
      sw = d.alto * targetRatio;
      sx = (d.ancho - sw) / 2;
    } else {
      sh = d.ancho / targetRatio;
      sy = (d.alto - sh) / 2;
    }
    for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) context.drawImage(d.fuente, sx, sy, sw, sh, col * targetW, row * targetH, targetW, targetH);
    const blob = await aBlob(canvas, 'image/jpeg', 0.95, 'No se pudo crear la hoja.');
    return { filename: 'fotos-credencial.jpg', mimeType: 'image/jpeg', dataUrl: await readAsDataUrl(blob), size: blob.size };
  } finally {
    d.liberar();
  }
}
