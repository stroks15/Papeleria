'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Props = {
  modo: 'unica' | 'multiple';
  onTerminar: (fotos: Blob[]) => void;
  onCancelar: () => void;
};

/**
 * Cámara con MediaDevices (funciona en el navegador y en el WebView de la APK).
 * En modo múltiple NO se cierra tras cada disparo: acumula fotos y muestra un
 * contador flotante con un botón ✅ para terminar.
 */
export default function CamaraMultiple({ modo, onTerminar, onCancelar }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const flujoRef = useRef<MediaStream | null>(null);
  const [fotos, setFotos] = useState<Blob[]>([]);
  const [error, setError] = useState('');
  const [lista, setLista] = useState(false);
  const [destello, setDestello] = useState(false);

  const detener = useCallback(() => {
    flujoRef.current?.getTracks().forEach((t) => t.stop());
    flujoRef.current = null;
  }, []);

  useEffect(() => {
    let vivo = true;
    async function iniciar() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin-api');
        const flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } },
          audio: false,
        });
        if (!vivo) {
          flujo.getTracks().forEach((t) => t.stop());
          return;
        }
        flujoRef.current = flujo;
        const video = videoRef.current;
        if (video) {
          video.srcObject = flujo;
          await video.play().catch(() => undefined);
        }
        setLista(true);
      } catch {
        setError('No se pudo abrir la cámara. Revisa que le diste permiso a la app, o usa «Subir desde galería».');
      }
    }
    void iniciar();
    return () => {
      vivo = false;
      detener();
    };
  }, [detener]);

  async function disparar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;
    setDestello(true);
    window.setTimeout(() => setDestello(false), 120);
    if (modo === 'unica') {
      detener();
      onTerminar([blob]);
      return;
    }
    setFotos((prev) => [...prev, blob]);
  }

  function terminar() {
    detener();
    onTerminar(fotos);
  }

  function cancelar() {
    detener();
    onCancelar();
  }

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black" role="dialog" aria-label="Cámara">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {destello && <div className="absolute inset-0 bg-white/70" />}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-base font-semibold text-white">{error}</div>
        )}
        {modo === 'multiple' && lista && (
          <div className="absolute right-4 top-4 flex items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-white" aria-live="polite">
            <span className="text-lg font-bold">📷 {fotos.length}</span>
            <button
              type="button"
              onClick={terminar}
              disabled={!fotos.length}
              aria-label="Terminar y ver fotos"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-2xl disabled:opacity-40"
            >
              ✅
            </button>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 bg-black px-6 py-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}>
        <button type="button" onClick={cancelar} className="rounded-full bg-white/20 px-5 py-3 text-base font-bold text-white">
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void disparar()}
          disabled={!lista}
          aria-label="Tomar foto"
          className="h-20 w-20 rounded-full border-4 border-white bg-white/90 active:scale-95 disabled:opacity-40"
        />
        <span className="w-24 text-right text-sm font-semibold text-white/80">{modo === 'multiple' ? 'Varias fotos' : 'Una foto'}</span>
      </div>
    </div>
  );
}
