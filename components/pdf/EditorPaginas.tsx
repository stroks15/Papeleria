'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ImagenItem } from '@/lib/client/pdfComposer';
import MiniaturaLayout from '@/components/pdf/MiniaturaLayout';
import {
  cambiarPlantilla,
  colocaciones,
  distribuir,
  imagenesUsadas,
  limitar,
  normalizarRect,
  paginaDePlantilla,
  PLANTILLAS,
  plantillaPorId,
  type ItemLibre,
  type Pagina,
  type PlantillaId,
  type Rect,
} from '@/lib/pdfLayout';

type Props = {
  imagenes: ImagenItem[];
  paginas: Pagina[];
  onCambio: (paginas: Pagina[]) => void;
  plantillaPorDefecto: PlantillaId;
};

type Seleccion = { pagina: number; ranura?: number; itemId?: string };

let contadorItems = 0;

/** Editor de hojas: asigna fotos a cada ranura o las coloca libremente (mover, tamaño). */
export default function EditorPaginas({ imagenes, paginas, onCambio, plantillaPorDefecto }: Props) {
  const [sel, setSel] = useState<Seleccion | null>(null);
  const paginasRef = useRef(paginas);
  const areas = useRef<Array<HTMLDivElement | null>>([]);
  useEffect(() => {
    paginasRef.current = paginas;
  }, [paginas]);

  const porId = new Map(imagenes.map((i) => [i.id, i]));
  const usadas = imagenesUsadas(paginas);
  const sinUsar = imagenes.filter((i) => !usadas.has(i.id));

  function reemplazar(indice: number, nueva: Pagina) {
    onCambio(paginasRef.current.map((p, i) => (i === indice ? nueva : p)));
  }

  function sacarDeTodas(lista: Pagina[], imagenId: string): Pagina[] {
    return lista.map((p) =>
      p.tipo === 'libre'
        ? { ...p, items: p.items.filter((it) => it.imagenId !== imagenId) }
        : { ...p, ranuras: p.ranuras.map((r) => (r === imagenId ? null : r)) },
    );
  }

  function elegirImagen(imagenId: string) {
    if (!sel) return;
    const pagina = paginasRef.current[sel.pagina];
    if (!pagina) return;
    const limpias = sacarDeTodas(paginasRef.current, imagenId);
    const destino = limpias[sel.pagina];
    if (destino.tipo === 'plantilla' && sel.ranura !== undefined) {
      const ranuras = destino.ranuras.slice();
      ranuras[sel.ranura] = imagenId;
      onCambio(limpias.map((p, i) => (i === sel.pagina ? { ...destino, ranuras } : p)));
    } else if (destino.tipo === 'libre') {
      contadorItems += 1;
      const nuevo: ItemLibre = { id: 'it-' + contadorItems, imagenId, x: 0.25, y: 0.25, w: 0.5, h: 0.5 };
      onCambio(limpias.map((p, i) => (i === sel.pagina ? { ...destino, items: [...destino.items, nuevo] } : p)));
      setSel({ pagina: sel.pagina, itemId: nuevo.id });
    }
  }

  function quitarDeRanura(pi: number, ri: number) {
    const p = paginasRef.current[pi];
    if (p.tipo !== 'plantilla') return;
    const ranuras = p.ranuras.slice();
    ranuras[ri] = null;
    reemplazar(pi, { ...p, ranuras });
  }

  function actualizarItem(pi: number, itemId: string, rect: Rect) {
    const p = paginasRef.current[pi];
    if (p.tipo !== 'libre') return;
    reemplazar(pi, { ...p, items: p.items.map((it) => (it.id === itemId ? { ...it, ...rect } : it)) });
  }

  function quitarItem(pi: number, itemId: string) {
    const p = paginasRef.current[pi];
    if (p.tipo !== 'libre') return;
    reemplazar(pi, { ...p, items: p.items.filter((it) => it.id !== itemId) });
    setSel({ pagina: pi });
  }

  function arrastrar(e: ReactPointerEvent<HTMLElement>, pi: number, item: ItemLibre, modo: 'mover' | 'tamano') {
    e.stopPropagation();
    e.preventDefault();
    const caja = areas.current[pi];
    if (!caja) return;
    const r = caja.getBoundingClientRect();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const base = { x: item.x, y: item.y, w: item.w, h: item.h };
    setSel({ pagina: pi, itemId: item.id });
    const mover = (ev: PointerEvent) => {
      const dx = (ev.clientX - x0) / r.width;
      const dy = (ev.clientY - y0) / r.height;
      actualizarItem(pi, item.id, modo === 'mover' ? normalizarRect({ ...base, x: base.x + dx, y: base.y + dy }) : normalizarRect({ ...base, w: base.w + dx, h: base.h + dy }));
    };
    const soltar = () => {
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  }

  function tamanoRapido(pi: number, item: ItemLibre, w: number, h: number) {
    const cx = item.x + item.w / 2;
    const cy = item.y + item.h / 2;
    actualizarItem(pi, item.id, normalizarRect({ x: limitar(cx - w / 2, 0, 1 - w), y: limitar(cy - h / 2, 0, 1 - h), w, h }));
  }

  function mover(pi: number, delta: number) {
    const destino = pi + delta;
    if (destino < 0 || destino >= paginas.length) return;
    const copia = paginas.slice();
    [copia[pi], copia[destino]] = [copia[destino], copia[pi]];
    onCambio(copia);
    setSel(null);
  }

  function eliminarHoja(pi: number) {
    onCambio(paginas.filter((_, i) => i !== pi));
    setSel(null);
  }

  /** Rellena con imágenes sin usar las ranuras que quedaron vacías. */
  function rellenar(pagina: Pagina, libres: string[]): Pagina {
    if (pagina.tipo !== 'plantilla') return pagina;
    const cola = libres.slice();
    return { ...pagina, ranuras: pagina.ranuras.map((r) => r ?? cola.shift() ?? null) };
  }

  function elegirPlantilla(pi: number, valor: PlantillaId | 'libre') {
    const p = paginasRef.current[pi];
    if (valor === 'libre') {
      const items: ItemLibre[] = colocaciones(p).map((c) => {
        contadorItems += 1;
        return { id: 'it-' + contadorItems, imagenId: c.imagenId, ...c.rect };
      });
      reemplazar(pi, { tipo: 'libre', items });
    } else {
      const nueva = p.tipo === 'plantilla' ? cambiarPlantilla(p, valor) : paginaDePlantilla(valor, colocaciones(p).map((c) => c.imagenId));
      reemplazar(pi, rellenar(nueva, sinUsar.map((i) => i.id)));
    }
    setSel({ pagina: pi });
  }

  function acomodarRestantes() {
    if (!sinUsar.length) return;
    onCambio([...paginas, ...distribuir(sinUsar.map((i) => i.id), plantillaPorDefecto)]);
  }

  const hojaSel = sel ? paginas[sel.pagina] : undefined;
  const itemSel = hojaSel && hojaSel.tipo === 'libre' && sel?.itemId ? hojaSel.items.find((it) => it.id === sel.itemId) : undefined;

  return (
    <div className="space-y-4">
      {/* Bandeja de fotos */}
      <section className="rounded-3xl bg-carta p-3 ring-1 ring-tinta/10" aria-label="Tus imágenes">
        <p className="mb-2 text-sm font-bold text-tinta">
          Tus imágenes ({imagenes.length}) · sin usar: {sinUsar.length}
        </p>
        <p className="mb-2 text-xs text-tinta-suave">
          {sel ? 'Toca una imagen para ponerla en la hoja ' + (sel.pagina + 1) + '.' : 'Toca un recuadro de una hoja y luego la imagen que quieres ahí.'}
        </p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {imagenes.map((img) => (
            <button
              key={img.id}
              type="button"
              onClick={() => elegirImagen(img.id)}
              className={'relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white ring-2 ' + (usadas.has(img.id) ? 'ring-green-500' : 'ring-tinta/20')}
              aria-label={'Usar ' + img.nombre}
            >
              <img src={img.url} alt="" className="h-full w-full object-contain" />
              {usadas.has(img.id) && <span className="absolute right-1 top-1 rounded-full bg-green-500 px-1.5 text-xs font-bold text-white">✓</span>}
            </button>
          ))}
        </div>
        {sinUsar.length > 0 && (
          <button type="button" onClick={acomodarRestantes} className="mt-2 rounded-xl bg-oficial px-4 py-2 text-sm font-bold text-white">
            Acomodar las {sinUsar.length} sin usar en hojas nuevas
          </button>
        )}
      </section>

      {/* Hojas */}
      {paginas.map((pagina, pi) => {
        const cols = colocaciones(pagina);
        const esLibre = pagina.tipo === 'libre';
        return (
          <section key={pi} className="rounded-3xl bg-carta p-3 ring-1 ring-tinta/10" aria-label={'Hoja ' + (pi + 1)}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-tinta">Hoja {pi + 1}</h3>
              <div className="flex gap-1">
                <button type="button" onClick={() => mover(pi, -1)} disabled={pi === 0} aria-label="Subir hoja" className="rounded-lg bg-papel px-3 py-1 font-bold disabled:opacity-30">↑</button>
                <button type="button" onClick={() => mover(pi, 1)} disabled={pi === paginas.length - 1} aria-label="Bajar hoja" className="rounded-lg bg-papel px-3 py-1 font-bold disabled:opacity-30">↓</button>
                <button type="button" onClick={() => eliminarHoja(pi)} aria-label="Eliminar hoja" className="rounded-lg bg-red-100 px-3 py-1 font-bold text-red-700">✕</button>
              </div>
            </div>

            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Diseño de la hoja">
              {PLANTILLAS.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  onClick={() => elegirPlantilla(pi, pl.id)}
                  title={pl.nombre}
                  aria-label={pl.nombre}
                  className={'shrink-0 rounded-lg p-1 ring-2 ' + (pagina.tipo === 'plantilla' && pagina.plantilla === pl.id ? 'bg-oficial/10 ring-oficial' : 'ring-transparent')}
                >
                  <MiniaturaLayout plantilla={pl.id} ancho={34} />
                </button>
              ))}
              <button
                type="button"
                onClick={() => elegirPlantilla(pi, 'libre')}
                className={'shrink-0 rounded-lg px-3 text-sm font-bold ring-2 ' + (esLibre ? 'bg-oficial/10 ring-oficial' : 'bg-papel ring-transparent')}
              >
                ✋ Libre
              </button>
            </div>

            {/* Vista de la hoja */}
            <div className="mx-auto w-full max-w-[300px]">
              <div className="relative w-full rounded-sm bg-white shadow-md ring-1 ring-black/15" style={{ aspectRatio: '210 / 297' }}>
                <div ref={(el) => { areas.current[pi] = el; }} className="absolute" style={{ inset: '3.3% 4.7%' }} onClick={() => setSel({ pagina: pi })}>
                  {pagina.tipo === 'plantilla' &&
                    plantillaPorId(pagina.plantilla).ranuras.map((r, ri) => {
                      const id = pagina.ranuras[ri];
                      const img = id ? porId.get(id) : undefined;
                      const activa = sel?.pagina === pi && sel.ranura === ri;
                      return (
                        <div
                          key={ri}
                          role="button"
                          tabIndex={0}
                          onClick={(ev) => { ev.stopPropagation(); setSel({ pagina: pi, ranura: ri }); }}
                          onKeyDown={(ev) => { if (ev.key === 'Enter') setSel({ pagina: pi, ranura: ri }); }}
                          className={'absolute flex items-center justify-center p-[2px] ' + (activa ? 'z-10' : '')}
                          style={{ left: r.x * 100 + '%', top: r.y * 100 + '%', width: r.w * 100 + '%', height: r.h * 100 + '%' }}
                        >
                          <div className={'relative flex h-full w-full items-center justify-center rounded-[3px] ' + (activa ? 'ring-4 ring-oficial' : 'ring-1 ring-dashed ring-black/30') + (img ? '' : ' bg-papel/70')}>
                            {img ? <img src={img.url} alt="" className="h-full w-full object-contain" /> : <span className="text-2xl font-bold text-tinta-suave">+</span>}
                            {img && (
                              <button type="button" onClick={(ev) => { ev.stopPropagation(); quitarDeRanura(pi, ri); }} aria-label="Quitar imagen" className="absolute right-0 top-0 rounded-bl-lg bg-red-600 px-1.5 text-xs font-bold text-white">✕</button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {pagina.tipo === 'libre' &&
                    pagina.items.map((it) => {
                      const img = porId.get(it.imagenId);
                      const activo = sel?.pagina === pi && sel.itemId === it.id;
                      if (!img) return null;
                      return (
                        <div
                          key={it.id}
                          onPointerDown={(ev) => arrastrar(ev, pi, it, 'mover')}
                          onClick={(ev) => ev.stopPropagation()}
                          className={'absolute cursor-move select-none ' + (activo ? 'z-10 ring-4 ring-oficial' : 'ring-1 ring-black/30')}
                          style={{ left: it.x * 100 + '%', top: it.y * 100 + '%', width: it.w * 100 + '%', height: it.h * 100 + '%', touchAction: 'none' }}
                        >
                          <img src={img.url} alt="" draggable={false} className="pointer-events-none h-full w-full object-contain" />
                          <div
                            onPointerDown={(ev) => arrastrar(ev, pi, it, 'tamano')}
                            className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border-2 border-white bg-oficial"
                            style={{ touchAction: 'none' }}
                            aria-label="Cambiar tamaño"
                          />
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {esLibre && (
              <div className="mt-3 space-y-2 text-sm">
                <p className="text-tinta-suave">
                  Toca la hoja y luego una imagen de arriba para agregarla. Arrastra para moverla y usa el círculo azul para cambiar su tamaño.
                </p>
                {itemSel && sel?.pagina === pi && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => tamanoRapido(pi, itemSel, 1, 1)} className="rounded-lg bg-papel px-3 py-1 font-bold">Hoja completa</button>
                    <button type="button" onClick={() => tamanoRapido(pi, itemSel, 1, 0.5)} className="rounded-lg bg-papel px-3 py-1 font-bold">50%</button>
                    <button type="button" onClick={() => tamanoRapido(pi, itemSel, 0.5, 0.5)} className="rounded-lg bg-papel px-3 py-1 font-bold">25%</button>
                    <button type="button" onClick={() => quitarItem(pi, itemSel.id)} className="rounded-lg bg-red-100 px-3 py-1 font-bold text-red-700">Quitar</button>
                  </div>
                )}
              </div>
            )}
            {!cols.length && <p className="mt-2 text-center text-sm text-tinta-suave">Hoja vacía: no se incluirá en el PDF.</p>}
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => onCambio([...paginas, rellenar(paginaDePlantilla(plantillaPorDefecto), sinUsar.map((i) => i.id))])}
        className="w-full rounded-2xl bg-papel py-3 text-lg font-bold text-tinta ring-2 ring-tinta/10"
      >
        + Agregar hoja
      </button>
    </div>
  );
}
