'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Tramite } from '@/lib/tramites';
import ProgresoPasos from './ProgresoPasos';
import Assistant from './Assistant';
import { guardarSesion, registrarEvento } from '@/lib/supabase';

function idSesion(): string {
  if (typeof window === 'undefined') return '';
  const clave = 'papeleria-arcoiris-sesion';
  let id = window.localStorage.getItem(clave);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(clave, id);
  }
  return id;
}

export default function TramiteFlow({ tramite }: { tramite: Tramite }) {
  const [paso, setPaso] = useState(2);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    registrarEvento(tramite.slug, 'inicio');
    // Solo al entrar al trámite.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const id = idSesion();
    if (id) guardarSesion(id, tramite.slug, paso, valores);
  }, [paso, valores, tramite.slug]);

  const campoActivo = useMemo(
    () => tramite.campos.find((c) => !valores[c.id]) ?? tramite.campos[0],
    [tramite.campos, valores]
  );

  function actualizarCampo(id: string, valor: string) {
    setValores((prev) => ({ ...prev, [id]: valor }));
  }

  function copiar(texto: string, etiqueta: string) {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(etiqueta);
      setTimeout(() => setCopiado(null), 2000);
    });
  }

  function nuevoTramite() {
    setValores({});
    setPaso(2);
  }

  const todosLosCamposLlenos = tramite.campos.every((c) => valores[c.id]?.trim());

  return (
    <div className="pb-32">
      <div className="h-1.5 w-full" style={{ backgroundColor: tramite.colorHex }} />
      <div className="px-5 pt-5">
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold"
          style={{ backgroundColor: tramite.colorSuaveHex, color: tramite.colorHex }}
        >
          <span aria-hidden>{tramite.emoji}</span>
          {tramite.nombre}
        </span>
      </div>

      <ProgresoPasos pasoActual={paso} colorHex={tramite.colorHex} />

      <div className="px-5">
        {paso === 2 && (
          <div className="flex flex-col gap-4">
            <p className="text-tinta-suave">
              Completa estos datos. Si no sabes algo, pregúntale a tu asistente.
            </p>
            {tramite.campos.map((campo) => (
              <label key={campo.id} className="flex flex-col gap-1.5">
                <span className="font-semibold text-tinta">{campo.etiqueta}</span>
                <input
                  type="text"
                  value={valores[campo.id] ?? ''}
                  onChange={(e) => actualizarCampo(campo.id, e.target.value)}
                  placeholder={campo.placeholder}
                  className="rounded-2xl border-2 border-tinta/10 bg-carta px-4 py-3.5 text-lg text-tinta outline-none focus:border-oficial"
                />
              </label>
            ))}
            <button
              type="button"
              disabled={!todosLosCamposLlenos}
              onClick={() => setPaso(3)}
              className="mt-2 rounded-2xl bg-oficial py-4 text-center text-lg font-bold text-carta disabled:opacity-40"
            >
              Revisar mis datos
            </button>
          </div>
        )}

        {paso === 3 && (
          <div className="flex flex-col gap-4">
            <p className="text-tinta-suave">Revisa que todo esté correcto antes de continuar.</p>
            <div className="flex flex-col gap-3 rounded-3xl bg-carta p-4 ring-1 ring-tinta/5">
              {tramite.campos.map((campo) => (
                <div key={campo.id} className="flex flex-col">
                  <span className="text-sm text-tinta-suave">{campo.etiqueta}</span>
                  <span className="text-lg font-semibold text-tinta">
                    {valores[campo.id]}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPaso(2)}
                className="flex-1 rounded-2xl bg-papel py-4 text-center text-lg font-bold text-tinta ring-2 ring-tinta/10"
              >
                Corregir
              </button>
              <button
                type="button"
                onClick={() => setPaso(4)}
                className="flex-1 rounded-2xl bg-oficial py-4 text-center text-lg font-bold text-carta"
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {paso === 4 && (
          <div className="flex flex-col gap-4">
            {tramite.autofillContacto && (
              <div className="flex flex-col gap-3 rounded-3xl bg-carta p-4 ring-1 ring-tinta/5">
                <p className="font-semibold text-tinta">
                  Ya tenemos tus datos de contacto configurados.
                </p>
                <p className="text-sm text-tinta-suave">
                  El sitio oficial te pedirá lada, teléfono y correo. Toca cada uno para
                  copiarlo.
                </p>
                <BotonCopiar
                  etiqueta="Lada"
                  valor={tramite.autofillContacto.lada}
                  copiado={copiado === 'Lada'}
                  onCopiar={() => copiar(tramite.autofillContacto!.lada, 'Lada')}
                />
                <BotonCopiar
                  etiqueta="Teléfono"
                  valor={tramite.autofillContacto.telefono}
                  copiado={copiado === 'Teléfono'}
                  onCopiar={() => copiar(tramite.autofillContacto!.telefono, 'Teléfono')}
                />
                <BotonCopiar
                  etiqueta="Correo"
                  valor={tramite.autofillContacto.correo}
                  copiado={copiado === 'Correo'}
                  onCopiar={() => copiar(tramite.autofillContacto!.correo, 'Correo')}
                />
              </div>
            )}

            <div className="rounded-3xl bg-carta p-4 ring-1 ring-tinta/5">
              <p className="font-semibold text-tinta">
                Si el sitio oficial te pide una verificación
              </p>
              <p className="mt-1 text-sm text-tinta-suave">
                El sitio oficial requiere una verificación de seguridad. Completa el
                CAPTCHA para continuar.
              </p>
            </div>

            <a
              href={tramite.urlOficial}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => registrarEvento(tramite.slug, 'completado')}
              className="rounded-2xl py-4 text-center text-lg font-bold text-carta"
              style={{ backgroundColor: tramite.colorHex }}
            >
              Abrir sitio oficial
            </a>

            <button
              type="button"
              onClick={nuevoTramite}
              className="rounded-2xl bg-papel py-4 text-center text-lg font-bold text-tinta ring-2 ring-tinta/10"
            >
              🔄 Nuevo trámite
            </button>
          </div>
        )}
      </div>

      <Assistant
        modo="tramite"
        tramite={tramite}
        pasoActual={paso}
        ayudaCampoActivo={campoActivo?.ayuda}
      />
    </div>
  );
}

function BotonCopiar({
  etiqueta,
  valor,
  copiado,
  onCopiar,
}: {
  etiqueta: string;
  valor: string;
  copiado: boolean;
  onCopiar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCopiar}
      className="flex items-center justify-between rounded-2xl bg-papel px-4 py-3 text-left"
    >
      <span>
        <span className="block text-xs text-tinta-suave">{etiqueta}</span>
        <span className="text-lg font-semibold text-tinta">{valor}</span>
      </span>
      <span className="text-sm font-semibold text-oficial">
        {copiado ? 'Copiado ✓' : 'Copiar'}
      </span>
    </button>
  );
}
