'use client';

import { useState } from 'react';
import type { Tramite } from '@/lib/tramites';
import { nombresPasos } from '@/lib/tramites';

type AssistantProps = {
  modo: 'inicio' | 'tramite';
  tramite?: Tramite;
  pasoActual?: number;
  ayudaCampoActivo?: string;
};

export default function Assistant({
  modo,
  tramite,
  pasoActual,
  ayudaCampoActivo,
}: AssistantProps) {
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string>(mensajeInicial());

  function mensajeInicial(): string {
    if (modo === 'inicio') {
      return 'Hola, soy tu asistente de Papelería Arcoíris. Elige el trámite que necesitas y vamos paso a paso.';
    }
    if (tramite && pasoActual) {
      return `Estamos en el paso ${pasoActual} de 4 de ${tramite.nombre}: ${nombresPasos[pasoActual - 1]}. No te preocupes, te ayudaré.`;
    }
    return 'Vamos paso a paso. No te preocupes, te ayudaré.';
  }

  function responder(tipo: 'no-se' | 'que-sigue' | 'repetir') {
    if (tipo === 'repetir') {
      setMensaje(mensajeInicial());
      return;
    }
    if (tipo === 'no-se') {
      setMensaje(
        ayudaCampoActivo ??
          'Llena cada campo con la información que se pide. Si algo no aplica, sigue con el siguiente.'
      );
      return;
    }
    if (tramite && pasoActual && pasoActual < 4) {
      setMensaje(`Lo siguiente será: ${nombresPasos[pasoActual]}.`);
    } else if (tramite && pasoActual === 4) {
      setMensaje(
        'Ya casi terminamos: solo falta abrir el sitio oficial y, si te pide más datos, seguimos juntos.'
      );
    } else {
      setMensaje('Elige uno de los trámites de la lista para comenzar.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir asistente"
        className="fixed bottom-20 right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-oficial text-3xl text-carta shadow-lg transition-transform active:scale-95"
      >
        🌈
      </button>
      {abierto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-tinta/30 px-4 pb-4"
          onClick={() => setAbierto(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-carta p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-tinta">
                Tu asistente
              </span>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label="Cerrar"
                className="text-2xl text-tinta-suave"
              >
                ✕
              </button>
            </div>
            <p className="mb-4 text-tinta">{mensaje}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => responder('no-se')}
                className="rounded-full bg-papel px-4 py-2 text-sm font-medium text-tinta ring-1 ring-tinta/10"
              >
                No sé qué poner aquí
              </button>
              <button
                type="button"
                onClick={() => responder('que-sigue')}
                className="rounded-full bg-papel px-4 py-2 text-sm font-medium text-tinta ring-1 ring-tinta/10"
              >
                ¿Qué sigue?
              </button>
              <button
                type="button"
                onClick={() => responder('repetir')}
                className="rounded-full bg-papel px-4 py-2 text-sm font-medium text-tinta ring-1 ring-tinta/10"
              >
                Repetir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
