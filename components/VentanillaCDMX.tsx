'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  abrirPortal,
  confirmarCaptura,
  consultarApi,
  descargarPdf,
  esAppNativa,
  guardarUltimaPlaca,
  leerHistorial,
  leerUltimaPlaca,
  urlDeBlob,
  vaciarCola,
  type DocumentoReciente,
  type PdfDescargado,
  type SesionPortal,
} from '@/lib/client/ventanillaClient';
import {
  URLS_OFICIALES,
  esPlacaValida,
  normalizarPlaca,
  type RespuestaTramite,
  type TipoTramite,
  type VarianteActa,
} from '@/lib/ventanilla/tipos';

// Colores con valores explícitos (no dependen de la configuración del tema de Tailwind).
const C = {
  tarjeta: 'bg-[#FFFDF8] ring-1 ring-black/5 rounded-3xl',
  papel: 'bg-[#FBF3E3]',
  tinta: 'text-[#2B2420]',
  suave: 'text-[#5C5248]',
  boton: 'bg-[#2E5A6C] text-white',
};

type Fase = 'inicio' | 'consultando' | 'portal' | 'procesando';

type Visor = {
  nombre: string;
  blobUrl: string;
  bytes: number;
  base64: string;
  registrado: boolean;
};

const ACCESOS: Array<{ tipo: TipoTramite; emoji: string; titulo: string; detalle: string }> = [
  { tipo: 'tenencia', emoji: '🚗', titulo: 'Adeudos de tenencia', detalle: 'Consulta y descarga tu formato de adeudos con la placa.' },
  { tipo: 'verificacion', emoji: '🌿', titulo: 'Verificación vehicular', detalle: 'Estatus de tu verificación y citas con la placa.' },
  { tipo: 'acta', emoji: '📜', titulo: 'Acta del Registro Civil', detalle: 'Copia certificada. Necesitas tu Llave CDMX.' },
];

const MOTIVOS_FALLBACK: Record<string, string> = {
  captcha: 'El portal pidió una verificación de seguridad (CAPTCHA).',
  cloudflare_challenge: 'El portal pidió una verificación de seguridad.',
  waf_bloqueo: 'El portal bloqueó la consulta automática.',
  limite_de_peticiones: 'El portal pidió esperar antes de consultar de nuevo.',
  respuesta_no_json: 'El portal necesita que lo uses directamente.',
  llave_cdmx_requerida: 'Este trámite requiere iniciar sesión con tu Llave CDMX.',
  endpoint_no_configurado: 'La consulta rápida aún no está disponible para este trámite.',
  scraper_no_configurado: 'La consulta rápida aún no está disponible para este trámite.',
};

function etiqueta(clave: string): string {
  const texto = clave.replace(/[_-]+/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function valorLegible(valor: unknown): string {
  if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  try {
    return JSON.stringify(valor);
  } catch {
    return '';
  }
}

function mensajeDeError(error: unknown, porDefecto: string): string {
  return error instanceof Error && error.message ? error.message : porDefecto;
}

export default function VentanillaCDMX() {
  const [placa, setPlaca] = useState('');
  const [variante, setVariante] = useState<VarianteActa>('nacimiento');
  const [fase, setFase] = useState<Fase>('inicio');
  const [resultado, setResultado] = useState<RespuestaTramite | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [visor, setVisor] = useState<Visor | null>(null);
  const [historial, setHistorial] = useState<DocumentoReciente[]>([]);
  // PDF detectado cuyo guardado automático falló: permite reintentar sin reabrir el portal.
  const [pdfPendiente, setPdfPendiente] = useState<{ url: string; tipo: TipoTramite; placa?: string; variante?: VarianteActa; clave: string } | null>(null);

  const sesionRef = useRef<SesionPortal | null>(null);
  const procesandoRef = useRef(false);
  const claveIntentoRef = useRef('');
  const blobRef = useRef<string | null>(null);
  const marcoRef = useRef<HTMLIFrameElement | null>(null);

  // --- ciclo de vida -------------------------------------------------------
  useEffect(() => {
    let activo = true;
    void (async () => {
      const [ultima, recientes] = await Promise.all([leerUltimaPlaca(), leerHistorial()]);
      if (!activo) return;
      if (ultima) setPlaca(ultima);
      setHistorial(recientes);
      void vaciarCola();
    })();
    return () => {
      activo = false;
      void sesionRef.current?.liberar();
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    };
  }, []);

  const reemplazarVisor = useCallback((siguiente: Visor | null) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    blobRef.current = siguiente?.blobUrl ?? null;
    setVisor(siguiente);
  }, []);

  // --- captura del PDF -----------------------------------------------------
  const procesarPdf = useCallback(
    async (url: string, tipo: TipoTramite, placaUsada: string | undefined, varianteUsada: VarianteActa | undefined, clave: string) => {
      setFase('procesando');
      setError(null);
      setPdfPendiente(null);
      try {
        const pdf: PdfDescargado = await descargarPdf(url, tipo);
        const { registrado, historial: recientes } = await confirmarCaptura({
          tipo,
          url,
          pdf,
          claveIntento: clave,
          placa: placaUsada,
          variante: tipo === 'acta' ? varianteUsada : undefined,
        });
        setHistorial(recientes);
        reemplazarVisor({
          nombre: pdf.nombre,
          blobUrl: urlDeBlob(pdf.bytes),
          bytes: pdf.bytes.byteLength,
          base64: pdf.base64,
          registrado,
        });
        setAviso(null);
      } catch (e) {
        setPdfPendiente({ url, tipo, placa: placaUsada, variante: varianteUsada, clave });
        setError(
          mensajeDeError(e, 'No pudimos descargar el PDF automáticamente.') +
            ' Puedes reintentar o volver a abrir el portal.',
        );
      } finally {
        procesandoRef.current = false;
        setFase('inicio');
      }
    },
    [reemplazarVisor],
  );

  const alDetectarPdf = useCallback(
    async (url: string, tipo: TipoTramite, placaUsada: string | undefined, varianteUsada: VarianteActa | undefined) => {
      if (procesandoRef.current) return; // el portal puede navegar varias veces a la misma URL
      procesandoRef.current = true;
      const clave = claveIntentoRef.current;
      // Cierra el WebView en cuanto se detecta el documento final.
      try {
        await sesionRef.current?.cerrar();
      } catch {
        // Si ya estaba cerrado no pasa nada.
      }
      sesionRef.current = null;
      await procesarPdf(url, tipo, placaUsada, varianteUsada, clave);
    },
    [procesarPdf],
  );

  // --- apertura del portal (Opción B) --------------------------------------
  const abrirEnPortal = useCallback(
    async (tipo: TipoTramite, url: string, placaUsada?: string, varianteUsada?: VarianteActa) => {
      setError(null);
      reemplazarVisor(null);
      setPdfPendiente(null);
      procesandoRef.current = false;
      claveIntentoRef.current = crypto.randomUUID();
      await sesionRef.current?.liberar();
      sesionRef.current = null;

      if (!esAppNativa()) {
        setFase('inicio');
        setAviso('Abrimos el portal oficial en otra pestaña. La captura automática del PDF solo funciona en la app.');
      } else {
        setFase('portal');
        setAviso('Completa el trámite en el portal. Cuando se genere tu PDF lo recibirás aquí automáticamente.');
      }

      try {
        sesionRef.current = await abrirPortal(url, {
          onPdf: (pdfUrl) => void alDetectarPdf(pdfUrl, tipo, placaUsada, varianteUsada),
          onCerrado: () => {
            if (procesandoRef.current) return; // lo cerramos nosotros al detectar el PDF
            sesionRef.current = null;
            setFase('inicio');
            setAviso('Cerraste el portal. Si tu documento no se descargó solo, vuelve a abrirlo e inténtalo de nuevo.');
          },
        });
      } catch (e) {
        setFase('inicio');
        setAviso(null);
        setError(mensajeDeError(e, 'No se pudo abrir el portal oficial.'));
      }
    },
    [alDetectarPdf, reemplazarVisor],
  );

  // --- acciones del dashboard ----------------------------------------------
  const iniciar = useCallback(
    async (tipo: TipoTramite) => {
      setError(null);
      setAviso(null);
      setResultado(null);
      reemplazarVisor(null);

      if (tipo === 'acta') {
        // Opción B directa: la Llave CDMX obliga a iniciar sesión en el portal.
        setResultado({ status: 'REQUIRES_VIEWPORT_FALLBACK', tipo, urlOficial: URLS_OFICIALES.acta, motivo: 'llave_cdmx_requerida' });
        await abrirEnPortal('acta', URLS_OFICIALES.acta, undefined, variante);
        return;
      }

      const limpia = normalizarPlaca(placa);
      if (!esPlacaValida(limpia)) {
        setError('Escribe una placa válida: de 5 a 8 letras o números.');
        return;
      }
      setPlaca(limpia);
      void guardarUltimaPlaca(limpia);

      setFase('consultando');
      try {
        const respuesta = await consultarApi(tipo, limpia);
        setResultado(respuesta);
        if (respuesta.status === 'REQUIRES_VIEWPORT_FALLBACK') {
          // Opción A no disponible: se abre el portal oficial de inmediato.
          await abrirEnPortal(tipo, respuesta.urlOficial ?? URLS_OFICIALES[tipo], limpia);
        } else {
          setFase('inicio');
        }
      } catch (e) {
        setFase('inicio');
        setError(mensajeDeError(e, 'No se pudo completar la consulta.'));
      }
    },
    [abrirEnPortal, placa, reemplazarVisor, variante],
  );

  const guardarEnDescargas = useCallback(async () => {
    if (!visor) return;
    try {
      if (esAppNativa()) {
        const { guardarArchivoEnAndroid } = await import('@/lib/nativeFiles');
        await guardarArchivoEnAndroid(visor.nombre, 'application/pdf', visor.base64);
        setAviso('Archivo guardado en Descargas/Papelería Arcoíris.');
        return;
      }
      const enlace = document.createElement('a');
      enlace.href = visor.blobUrl;
      enlace.download = visor.nombre;
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
    } catch {
      setError('No se pudo guardar el archivo. Inténtalo de nuevo.');
    }
  }, [visor]);

  const ocupado = fase !== 'inicio';
  const tipoDelResultado = resultado?.tipo;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-6">
      {/* Placa */}
      <section className={`${C.tarjeta} p-4`}>
        <label htmlFor="placa-ventanilla" className={`block font-bold ${C.tinta}`}>
          Placa del vehículo
        </label>
        <p className={`mt-0.5 text-sm ${C.suave}`}>Solo para tenencia y verificación.</p>
        <input
          id="placa-ventanilla"
          value={placa}
          onChange={(e) => setPlaca(normalizarPlaca(e.target.value).slice(0, 8))}
          placeholder="Ej. ABC1234"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          maxLength={8}
          className={`mt-2 w-full rounded-2xl border-2 border-black/10 bg-white px-4 py-3 text-lg font-semibold tracking-wider ${C.tinta} outline-none focus:border-[#2E5A6C]`}
        />
      </section>

      {/* Accesos rápidos */}
      <section className="flex flex-col gap-3" aria-label="Trámites disponibles">
        {ACCESOS.map((acceso) => (
          <div key={acceso.tipo} className={`${C.tarjeta} p-4`}>
            <div className="flex items-center gap-3">
              <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${C.papel}`} aria-hidden>
                {acceso.emoji}
              </span>
              <div className="min-w-0">
                <p className={`text-lg font-bold ${C.tinta}`}>{acceso.titulo}</p>
                <p className={`text-sm ${C.suave}`}>{acceso.detalle}</p>
              </div>
            </div>

            {acceso.tipo === 'acta' && (
              <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de acta">
                {(['nacimiento', 'matrimonio'] as const).map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    role="radio"
                    aria-checked={variante === opcion}
                    onClick={() => setVariante(opcion)}
                    className={`rounded-xl px-3 py-2 text-sm font-bold ${
                      variante === opcion ? C.boton : `${C.papel} ${C.tinta} ring-1 ring-black/10`
                    }`}
                  >
                    {opcion === 'nacimiento' ? 'Nacimiento' : 'Matrimonio'}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={ocupado}
              onClick={() => void iniciar(acceso.tipo)}
              className={`mt-3 w-full rounded-2xl py-3.5 text-base font-bold disabled:opacity-50 ${C.boton}`}
            >
              {fase === 'consultando' && tipoDelResultado === undefined && acceso.tipo !== 'acta' ? 'Consultando…' : acceso.tipo === 'acta' ? 'Abrir Registro Civil' : 'Consultar'}
            </button>
          </div>
        ))}
      </section>

      {/* Estado */}
      <section aria-live="polite" className="flex flex-col gap-3">
        {fase === 'consultando' && (
          <p className={`rounded-2xl p-4 font-semibold ${C.papel} ${C.tinta}`}>Consultando el portal oficial… esto puede tardar unos segundos.</p>
        )}
        {fase === 'procesando' && (
          <p className={`rounded-2xl p-4 font-semibold ${C.papel} ${C.tinta}`}>Recibimos tu documento. Guardándolo…</p>
        )}
        {aviso && <p className={`rounded-2xl p-4 text-sm font-semibold ${C.papel} ${C.tinta}`}>{aviso}</p>}
        {error && (
          <div className="rounded-2xl bg-[#FBE9E5] p-4 text-sm font-semibold text-[#7A2E1F]">
            <p>{error}</p>
            {pdfPendiente && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => {
                    procesandoRef.current = true;
                    void procesarPdf(pdfPendiente.url, pdfPendiente.tipo, pdfPendiente.placa, pdfPendiente.variante, pdfPendiente.clave);
                  }}
                  className={`rounded-xl px-4 py-2 font-bold disabled:opacity-50 ${C.boton}`}
                >
                  Reintentar descarga
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => void abrirEnPortal(pdfPendiente.tipo, URLS_OFICIALES[pdfPendiente.tipo], pdfPendiente.placa, pdfPendiente.variante)}
                  className={`rounded-xl px-4 py-2 font-bold ring-1 ring-black/10 disabled:opacity-50 ${C.papel} ${C.tinta}`}
                >
                  Abrir el portal de nuevo
                </button>
              </div>
            )}
          </div>
        )}

        {resultado && resultado.status !== 'REQUIRES_VIEWPORT_FALLBACK' && (
          <Resultado resultado={resultado} ocupado={ocupado} onAbrirPortal={() => void abrirEnPortal(resultado.tipo, resultado.urlOficial ?? URLS_OFICIALES[resultado.tipo], resultado.placa, variante)} />
        )}
        {resultado?.status === 'REQUIRES_VIEWPORT_FALLBACK' && fase === 'inicio' && !visor && !error && (
          <div className={`rounded-2xl p-4 text-sm ${C.papel} ${C.tinta}`}>
            <p className="font-semibold">{MOTIVOS_FALLBACK[resultado.motivo ?? ''] ?? 'Esta consulta se completa en el portal oficial.'}</p>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => void abrirEnPortal(resultado.tipo, resultado.urlOficial ?? URLS_OFICIALES[resultado.tipo], resultado.placa, variante)}
              className={`mt-3 rounded-xl px-4 py-2 font-bold disabled:opacity-50 ${C.boton}`}
            >
              Abrir el portal oficial
            </button>
          </div>
        )}
      </section>

      {/* Visor del PDF */}
      {visor && (
        <section className={`${C.tarjeta} p-4`} aria-label="Documento listo">
          <p className={`font-bold ${C.tinta}`}>📄 Documento listo</p>
          <p className={`mt-0.5 break-all text-sm ${C.suave}`}>
            {visor.nombre} · {(visor.bytes / 1024).toFixed(0)} KB
          </p>
          {!visor.registrado && (
            <p className={`mt-1 text-xs ${C.suave}`}>Sin conexión: el registro se enviará cuando vuelva Internet.</p>
          )}
          <iframe
            ref={marcoRef}
            src={visor.blobUrl}
            title="Vista previa del PDF"
            className="mt-3 h-96 w-full rounded-2xl border-2 border-black/10 bg-white"
          />
          <p className={`mt-1 text-xs ${C.suave}`}>
            Si no ves la vista previa, guarda el PDF y ábrelo con tu lector de documentos para imprimirlo.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void guardarEnDescargas()} className={`rounded-xl py-3 font-bold ${C.boton}`}>
              Guardar en Descargas
            </button>
            {!esAppNativa() ? (
              <button
                type="button"
                onClick={() => marcoRef.current?.contentWindow?.print()}
                className={`rounded-xl py-3 font-bold ring-1 ring-black/10 ${C.papel} ${C.tinta}`}
              >
                Imprimir
              </button>
            ) : (
              <button
                type="button"
                onClick={() => reemplazarVisor(null)}
                className={`rounded-xl py-3 font-bold ring-1 ring-black/10 ${C.papel} ${C.tinta}`}
              >
                Cerrar
              </button>
            )}
          </div>
        </section>
      )}

      {/* Historial */}
      {historial.length > 0 && (
        <section className={`${C.tarjeta} p-4`} aria-label="Documentos recientes">
          <p className={`font-bold ${C.tinta}`}>Documentos recientes</p>
          <ul className="mt-2 flex flex-col gap-2">
            {historial.map((doc) => (
              <li key={doc.nombre + doc.guardadoEn} className={`rounded-xl px-3 py-2 text-sm ${C.papel} ${C.tinta}`}>
                <span className="font-semibold break-all">{doc.nombre}</span>
                <span className={`block text-xs ${C.suave}`}>
                  {new Date(doc.guardadoEn).toLocaleString('es-MX')} · {(doc.bytes / 1024).toFixed(0)} KB
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Resultado({
  resultado,
  ocupado,
  onAbrirPortal,
}: {
  resultado: RespuestaTramite;
  ocupado: boolean;
  onAbrirPortal: () => void;
}) {
  if (resultado.status === 'OK') {
    const filas = Object.entries(resultado.datos ?? {}).filter(
      ([clave, valor]) => clave !== 'crudo' && clave !== 'placa' && valor !== null && valor !== undefined && valor !== '',
    );
    return (
      <div className={`${C.tarjeta} p-4`}>
        <p className={`font-bold ${C.tinta}`}>✅ Resultado para {resultado.placa}</p>
        {resultado.cached && <p className={`text-xs ${C.suave}`}>Consulta reciente guardada.</p>}
        {filas.length > 0 ? (
          <dl className="mt-2 flex flex-col gap-2">
            {filas.map(([clave, valor]) => (
              <div key={clave} className={`rounded-xl px-3 py-2 ${C.papel}`}>
                <dt className={`text-xs ${C.suave}`}>{etiqueta(clave)}</dt>
                <dd className={`font-semibold break-words ${C.tinta}`}>{valorLegible(valor)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className={`mt-2 text-sm ${C.suave}`}>El portal respondió sin datos adicionales.</p>
        )}
        <button
          type="button"
          disabled={ocupado}
          onClick={onAbrirPortal}
          className={`mt-3 w-full rounded-xl py-3 font-bold disabled:opacity-50 ${C.boton}`}
        >
          Descargar el formato en el portal oficial
        </button>
      </div>
    );
  }

  const textos: Record<string, string> = {
    PENDING: 'Ya hay una consulta en curso para esta placa. Espera un minuto y vuelve a intentarlo.',
    UNKNOWN: 'No pudimos confirmar la respuesta del portal. Para no duplicar la consulta espera unos minutos, o usa el portal oficial.',
    ERROR: 'No se pudo completar la consulta rápida.',
  };
  return (
    <div className={`rounded-2xl p-4 text-sm ${C.papel} ${C.tinta}`}>
      <p className="font-semibold">{textos[resultado.status] ?? 'No se pudo completar la consulta.'}</p>
      <button
        type="button"
        disabled={ocupado}
        onClick={onAbrirPortal}
        className={`mt-3 rounded-xl px-4 py-2 font-bold disabled:opacity-50 ${C.boton}`}
      >
        Abrir el portal oficial
      </button>
    </div>
  );
}
