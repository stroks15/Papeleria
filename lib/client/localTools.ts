import { PDFDocument } from 'pdf-lib';

export type LocalArtifact = { filename: string; mimeType: string; dataUrl: string; size: number };

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.')); reader.readAsDataURL(file); });
}
function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = ''; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return 'data:' + mimeType + ';base64,' + btoa(binary);
}
async function imageToJpeg(file: File, quality = 0.9): Promise<Blob> {
  const bitmap = await createImageBitmap(file); const maxDimension = 2200;
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas no disponible.');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo convertir la imagen.')), 'image/jpeg', quality));
}
export async function photosToPdf(files: File[]): Promise<LocalArtifact> {
  if (!files.length || files.length > 20) throw new Error('Selecciona entre 1 y 20 imágenes.');
  const pdf = await PDFDocument.create();
  for (const file of files) {
    const jpeg = await imageToJpeg(file); const image = await pdf.embedJpg(new Uint8Array(await jpeg.arrayBuffer()));
    const page = pdf.addPage([595.28, 841.89]); const margin = 28;
    const scale = Math.min((page.getWidth() - margin * 2) / image.width, (page.getHeight() - margin * 2) / image.height, 1);
    const width = image.width * scale; const height = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - width) / 2, y: (page.getHeight() - height) / 2, width, height });
  }
  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  return { filename: 'papeleria-arcoiris.pdf', mimeType: 'application/pdf', dataUrl: bytesToDataUrl(bytes, 'application/pdf'), size: bytes.byteLength };
}
export const scanToPdf = photosToPdf;
export async function compressPdf(file: File): Promise<LocalArtifact> {
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Selecciona un PDF.');
  if (file.size > 50 * 1024 * 1024) throw new Error('El PDF supera 50 MB.');
  const source = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: false }); const output = await PDFDocument.create();
  const pages = await output.copyPages(source, source.getPageIndices()); pages.forEach((page) => output.addPage(page));
  const bytes = await output.save({ useObjectStreams: true, addDefaultPage: false });
  return { filename: file.name.replace(/\.pdf$/i, '') + '-optimizado.pdf', mimeType: 'application/pdf', dataUrl: bytesToDataUrl(bytes, 'application/pdf'), size: bytes.byteLength };
}
export async function restorePhoto(file: File): Promise<LocalArtifact> {
  const jpeg = await imageToJpeg(file, 0.94); const bitmap = await createImageBitmap(jpeg);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas no disponible.'); context.filter = 'contrast(1.06) saturate(1.05)'; context.drawImage(bitmap, 0, 0); bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo restaurar la foto.')), 'image/jpeg', 0.94));
  return { filename: 'foto-restaurada.jpg', mimeType: 'image/jpeg', dataUrl: await readAsDataUrl(new File([blob], 'restaurada.jpg', { type: 'image/jpeg' })), size: blob.size };
}
export async function credentialSheet(file: File): Promise<LocalArtifact> {
  const bitmap = await createImageBitmap(file); const targetW = 354; const targetH = 472; const canvas = document.createElement('canvas');
  canvas.width = targetW * 3; canvas.height = targetH * 3; const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas no disponible.');
  const sourceRatio = bitmap.width / bitmap.height; const targetRatio = targetW / targetH; let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
  if (sourceRatio > targetRatio) { sw = bitmap.height * targetRatio; sx = (bitmap.width - sw) / 2; } else { sh = bitmap.width / targetRatio; sy = (bitmap.height - sh) / 2; }
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < 3; col += 1) context.drawImage(bitmap, sx, sy, sw, sh, col * targetW, row * targetH, targetW, targetH);
  bitmap.close(); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo crear la hoja.')), 'image/jpeg', 0.95));
  return { filename: 'fotos-credencial.jpg', mimeType: 'image/jpeg', dataUrl: await readAsDataUrl(new File([blob], 'credenciales.jpg', { type: 'image/jpeg' })), size: blob.size };
}