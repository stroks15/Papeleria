import { PDFDocument } from 'pdf-lib';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ImageInput = string | { data: string; mimeType?: string; name?: string };

function decodeImage(input: ImageInput): { bytes: Uint8Array; mimeType: string } {
  const value = typeof input === 'string' ? input : input.data;
  if (value.startsWith('data:')) {
    const match = value.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) throw new Error('Imagen Base64 inválida.');
    return { mimeType: match[1], bytes: Uint8Array.from(Buffer.from(match[2], 'base64')) };
  }
  return {
    mimeType: typeof input === 'string' && input.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
    bytes: Uint8Array.from(Buffer.from(value, 'base64')),
  };
}

async function resolveImage(input: ImageInput): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const value = typeof input === 'string' ? input : input.data;
  if (value.startsWith('/') && !value.startsWith('//')) {
    const safe = path.normalize(value).replace(/^([/\\])+/, '');
    const full = path.join(process.cwd(), 'public', safe);
    if (!full.startsWith(path.join(process.cwd(), 'public'))) throw new Error('Ruta de imagen no permitida.');
    return { bytes: new Uint8Array(await fs.readFile(full)), mimeType: full.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }
  return decodeImage(input);
}

export async function createPdfFromImages(images: ImageInput[], title = 'documento'): Promise<Buffer> {
  if (!Array.isArray(images) || images.length === 0 || images.length > 20) {
    throw new Error('Debes proporcionar entre 1 y 20 imágenes.');
  }

  const pdf = await PDFDocument.create();
  for (const input of images) {
    const { bytes, mimeType } = await resolveImage(input);
    const image = mimeType.includes('png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([595.28, 841.89]);
    const margin = 28;
    const maxW = page.getWidth() - margin * 2;
    const maxH = page.getHeight() - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

export async function scanToPdf(images: ImageInput[]): Promise<Buffer> {
  return createPdfFromImages(images, 'escaneo');
}

export function pdfDataUrl(pdf: Buffer): string {
  return `data:application/pdf;base64,${pdf.toString('base64')}`;
}
