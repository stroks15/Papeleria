
'use client';

import { useEffect } from 'react';

type Props = {
  url: string;
  title: string;
  onClose: () => void;
};

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

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden bg-carta shadow-2xl sm:h-[94vh] sm:rounded-3xl">
        <div className="flex min-h-14 items-center justify-between gap-3 border-b border-tinta/10 bg-carta px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-bold text-tinta">{title}</p>
            <p className="truncate text-xs text-tinta-suave">Sitio oficial</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-papel px-3 py-2 text-sm font-semibold text-tinta">
              Abrir aparte
            </a>
            <button type="button" onClick={onClose} className="rounded-xl bg-oficial px-3 py-2 text-sm font-bold text-carta" aria-label="Cerrar sitio oficial">
              Cerrar ✕
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-white">
          <iframe
            src={url}
            title={title}
            className="h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </div>
    </div>
  );
}
