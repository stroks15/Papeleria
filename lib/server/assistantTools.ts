import { createPdfFromImages, scanToPdf, type ImageInput } from './documentTools';
import { compressImagesBase64 } from './imageTools';

export type ToolArtifact = { filename: string; mimeType: string; dataBase64: string; size: number };

export async function executeAssistantTool(name: string, args: Record<string, unknown>, inputImages: string[]): Promise<{ summary: unknown; artifact?: ToolArtifact }> {
  const images = (Array.isArray(args.images) ? args.images : inputImages) as ImageInput[];
  if (name === 'create_pdf_from_photos' || name === 'scan_to_pdf') {
    if (!images.length) throw new Error('Necesito al menos una imagen para crear el PDF.');
    const pdf = name === 'scan_to_pdf' ? await scanToPdf(images) : await createPdfFromImages(images);
    return {
      summary: { created: true, pages: images.length, mimeType: 'application/pdf', size: pdf.length },
      artifact: { filename: name === 'scan_to_pdf' ? 'escaneo-arcoiris.pdf' : 'fotos-arcoiris.pdf', mimeType: 'application/pdf', dataBase64: pdf.toString('base64'), size: pdf.length },
    };
  }

  if (name === 'compress_images') {
    const results = await compressImagesBase64(inputImages.length ? inputImages : (args.images as string[] || []), {
      quality: typeof args.quality === 'number' ? args.quality : 78,
      maxWidth: typeof args.maxWidth === 'number' ? args.maxWidth : 2000,
      maxHeight: typeof args.maxHeight === 'number' ? args.maxHeight : 2000,
    });
    return { summary: { compressed: results.length, images: results.map((x) => ({ mimeType: x.mimeType, bytes: x.bytes })) }, artifact: results[0] ? { filename: 'imagen-comprimida.jpg', mimeType: results[0].mimeType, dataBase64: results[0].dataUrl.split(',')[1], size: results[0].bytes } : undefined };
  }

  return { summary: { action: name, completed: false, note: 'Esta acción se resuelve en el frontend mediante el evento del asistente.' } };
}
