import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export type ToolArtifact = { filename: string; mimeType: string; dataBase64: string; size: number };

function decodeDataUrl(value: string): { mimeType: string; buffer: Buffer } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('Archivo Base64 inválido.');
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

export async function createPdfFromImages(images: string[]): Promise<Buffer> {
  if (!Array.isArray(images) || images.length === 0 || images.length > 20) throw new Error('Debes proporcionar entre 1 y 20 imágenes.');
  const pdf = await PDFDocument.create();
  for (const input of images) {
    const { mimeType, buffer } = decodeDataUrl(input);
    const image = mimeType.includes('png') ? await pdf.embedPng(buffer) : await pdf.embedJpg(buffer);
    const page = pdf.addPage([595.28, 841.89]);
    const margin = 28;
    const maxW = page.getWidth() - margin * 2;
    const maxH = page.getHeight() - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height, 1);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
  }
  return Buffer.from(await pdf.save());
}

export async function optimizePdf(input: string): Promise<Buffer> {
  const { mimeType, buffer } = decodeDataUrl(input);
  if (mimeType !== 'application/pdf') throw new Error('El archivo seleccionado no es un PDF.');
  if (buffer.byteLength > 50 * 1024 * 1024) throw new Error('El PDF supera el límite de 50 MB.');
  const source = await PDFDocument.load(buffer, { ignoreEncryption: false });
  const output = await PDFDocument.create();
  const pages = await output.copyPages(source, source.getPageIndices());
  pages.forEach((page) => output.addPage(page));
  return Buffer.from(await output.save({ useObjectStreams: true, addDefaultPage: false }));
}

export async function restorePhoto(input: string): Promise<Buffer> {
  const { buffer } = decodeDataUrl(input);
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error('La foto supera el límite de 15 MB.');
  return sharp(buffer).rotate().normalize().sharpen({ sigma: 1.1 }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

export async function createIdPhotoSheet(input: string): Promise<Buffer> {
  const { buffer } = decodeDataUrl(input);
  const photo = sharp(buffer).rotate().resize(354, 472, { fit: 'cover' });
  const rendered = await photo.jpeg({ quality: 95 }).toBuffer();
  const canvas = sharp({
    create: { width: 1062, height: 1416, channels: 3, background: { r: 255, g: 255, b: 255 } },
  });
  const composites = [];
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) composites.push({ input: rendered, left: col * 354, top: row * 472 });
  return canvas.composite(composites).jpeg({ quality: 95 }).toBuffer();
}

export async function executeAssistantTool(
  name: string,
  args: Record<string, unknown>,
  inputImages: string[],
  inputFiles: Array<{ data: string; mimeType: string; name: string }> = [],
): Promise<{ summary: unknown; artifact?: ToolArtifact }> {
  if (name === 'create_pdf_from_photos' || name === 'scan_to_pdf') {
    const pdf = await createPdfFromImages(inputImages);
    return {
      summary: { created: true, pages: inputImages.length, mimeType: 'application/pdf', size: pdf.length },
      artifact: { filename: name === 'scan_to_pdf' ? 'escaneo-arcoiris.pdf' : 'fotos-arcoiris.pdf', mimeType: 'application/pdf', dataBase64: pdf.toString('base64'), size: pdf.length },
    };
  }

  if (name === 'compress_pdf') {
    const file = inputFiles.find((x) => x.mimeType === 'application/pdf');
    if (!file) throw new Error('Selecciona un archivo PDF.');
    const pdf = await optimizePdf(file.data);
    return {
      summary: { optimized: true, originalBytes: file.data.length, outputBytes: pdf.length, mimeType: 'application/pdf' },
      artifact: { filename: file.name.replace(/\.pdf$/i, '') + '-optimizado.pdf', mimeType: 'application/pdf', dataBase64: pdf.toString('base64'), size: pdf.length },
    };
  }

  if (name === 'restore_photo') {
    if (!inputImages[0]) throw new Error('Selecciona una fotografía.');
    const image = await restorePhoto(inputImages[0]);
    return { summary: { restored: true, mimeType: 'image/jpeg', size: image.length }, artifact: { filename: 'foto-restaurada.jpg', mimeType: 'image/jpeg', dataBase64: image.toString('base64'), size: image.length } };
  }

  if (name === 'create_id_photos') {
    if (!inputImages[0]) throw new Error('Selecciona una fotografía.');
    const image = await createIdPhotoSheet(inputImages[0]);
    return { summary: { created: true, photos: 9, mimeType: 'image/jpeg', size: image.length }, artifact: { filename: 'fotos-credencial.jpg', mimeType: 'image/jpeg', dataBase64: image.toString('base64'), size: image.length } };
  }

  if (name === 'compress_images') {
    throw new Error('Usa Comprimir imágenes desde una herramienta específica.');
  }

  return { summary: { action: name, completed: false, note: 'La IA se encarga de esta función.' } };
}