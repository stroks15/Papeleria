'use client';

import { useState } from 'react';
import { apiBase, guardarServidor, probarServidor, urlValida } from '@/lib/client/api';

/** Pequeño panel para corregir la dirección del servidor si la APK no logra conectarse. */
export default function AjusteServidor() {
  const [url, setUrl] = useState(() => apiBase());
  const [estado, setEstado] = useState('');
  const [probando, setProbando] = useState(false);

  async function probar() {
    if (!urlValida(url)) return setEstado('Escribe una dirección que empiece con https://');
    guardarServidor(url);
    setProbando(true);
    const r = await probarServidor();
    setEstado((r.ok ? '✅ ' : '⚠️ ') + r.mensaje);
    setProbando(false);
  }

  return (
    <div className="mb-3 rounded-2xl border-2 border-black/10 bg-papel p-3 text-sm text-tinta">
      <p className="mb-2 font-bold">¿No conecta? Revisa la dirección del servidor</p>
      <input value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" aria-label="Dirección del servidor" className="mb-2 w-full rounded-xl border-2 border-black/10 bg-white px-3 py-2 text-base outline-none" />
      <button type="button" onClick={() => void probar()} disabled={probando} style={{ backgroundColor: '#2E5A6C', color: '#FFFFFF' }} className="rounded-xl px-4 py-2 font-bold disabled:opacity-50">{probando ? 'Probando…' : 'Guardar y probar'}</button>
      {estado && <p className="mt-2 font-semibold" aria-live="polite">{estado}</p>}
    </div>
  );
}
