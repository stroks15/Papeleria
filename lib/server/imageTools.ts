import sharp from 'sharp';

export type ProcessedImage = { dataUrl: string; mimeType: string; bytes: number };

function decodeBase64(value: string): { buffer: Buffer; mimeType: string } {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (match) return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
  return { mimeType: 'image/jpeg', buffer: Buffer.from(value, 'base64') };
}

export async function compressImageBase64(
  input: string,
  options: { quality?: number; maxWidth?: number; maxHeight?: number } = {},
): Promise<ProcessedImage> {
  const { buffer } = decodeBase64(input);
  if (buffer.byteLength > 15 * 1024 * 1024) throw new Error('La imagen supera el límite de 15 MB.');

  const quality = Math.max(35, Math.min(90, options.quality ?? 78));
  const image = sharp(buffer).rotate();
  const resized = options.maxWidth || options.maxHeight
    ? image.resize({ width: options.maxWidth, height: options.maxHeight, fit: 'inside', withoutEnlargement: true })
    : image;

  const output = await resized.jpeg({ quality, mozjpeg: true }).toBuffer();
  return {
    dataUrl: `data:image/jpeg;base64,${output.toString('base64')}`,
    mimeType: 'image/jpeg',
    bytes: output.byteLength,
  };
}

export async function compressImagesBase64(
  images: string[],
  options: { quality?: number; maxWidth?: number; maxHeight?: number } = {},
): Promise<ProcessedImage[]> {
  if (images.length > 20) throw new Error('Máximo 20 imágenes por lote.');
  return Promise.all(images.map((image) => compressImageBase64(image, options)));
}
