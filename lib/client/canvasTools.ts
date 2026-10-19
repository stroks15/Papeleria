import { decodificarImagen } from '@/lib/client/imageDecode';

export type CropOptions = { width: number; height: number; x?: number; y?: number };

export async function cropToCredential(file: File, options: CropOptions = { width: 354, height: 472 }): Promise<Blob> {
  const d = await decodificarImagen(file, file.name || 'foto');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = options.width;
    canvas.height = options.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible.');

    const targetRatio = options.width / options.height;
    const sourceRatio = d.ancho / d.alto;
    let sx = 0, sy = 0, sw = d.ancho, sh = d.alto;
    if (sourceRatio > targetRatio) {
      sw = d.alto * targetRatio;
      sx = (d.ancho - sw) / 2;
    } else {
      sh = d.ancho / targetRatio;
      sy = (d.alto - sh) / 2;
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(d.fuente, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/jpeg', 0.9));
  } finally {
    d.liberar();
  }
}

export async function removeSimpleBackground(file: File, threshold = 245): Promise<Blob> {
  const d = await decodificarImagen(file, file.name || 'foto');
  try {
    const canvas = document.createElement('canvas');
    canvas.width = d.ancho;
    canvas.height = d.alto;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas no disponible.');
    ctx.drawImage(d.fuente, 0, 0);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i] >= threshold && image.data[i + 1] >= threshold && image.data[i + 2] >= threshold) image.data[i + 3] = 0;
    }
    ctx.putImageData(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear la imagen.'))), 'image/png'));
  } finally {
    d.liberar();
  }
}
