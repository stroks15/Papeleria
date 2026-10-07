'use client';

import { useEffect } from 'react';
import { Browser } from '@capacitor/browser';

type Props = { url: string; title: string; onClose: () => void };

export default function OfficialSiteModal({ url, title, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function abrirSitio() {
    try {
      await Browser.open({ url, toolbarColor: '#1F4E79' });
      onClose();
    } catch {
      // En web, si el navegador bloquea la ventana, dejamos el modal abierto.
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto flex h-full w-full max-w-xl flex-col overflow-hidden rounded-3xl bg-carta shadow-2xl">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-tinta/10 bg-carta px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-bold text-tinta">{title}</p>
            <p className="text-xs text-tinta-suave">Portal oficial del gobierno</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-papel px-3 py-2 text-sm font-bold text-tinta">Cerrar ✕</button>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-4 bg-white p-6 text-center">
          <div className="text-5xl">🏛️</div>
          <h2 className="text-xl font-bold text-tinta">Abrir sitio oficial</h2>
          <p className="text-sm leading-6 text-tinta-suave">
            Este portal no permite mostrarse dentro de una ventana incrustada. Para evitar el error
            “rechazó la conexión”, Papelería Arcoíris lo abrirá como página principal en tu navegador.
          </p>
          <button type="button" onClick={abrirSitio} className="rounded-2xl bg-oficial py-4 font-bold text-carta">
            Continuar al sitio oficial
          </button>
          <p className="text-xs text-tinta-suave break-all">{url}</p>
        </div>
      </div>
    </div>
  );
}
