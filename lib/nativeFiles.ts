'use client';

import { Capacitor, registerPlugin } from '@capacitor/core';

type FileSaverPlugin = {
  save(options: { filename: string; mimeType: string; dataBase64: string }): Promise<{ uri: string; filename: string; size: number }>;
};

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');

export async function guardarArchivoEnAndroid(
  filename: string,
  mimeType: string,
  dataBase64: string,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) throw new Error('El guardado nativo solo está disponible en la APK.');
  await FileSaver.save({ filename, mimeType, dataBase64 });
}
