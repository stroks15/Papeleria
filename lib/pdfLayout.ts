// Motor de layouts: funciones puras (sin DOM) para repartir imágenes en hojas.
// Todas las medidas son fracciones (0-1) del área útil de la hoja, con origen
// arriba-izquierda. Así sirven igual para la vista previa y para el PDF.

export type Rect = { x: number; y: number; w: number; h: number };

export type PlantillaId =
  | 'uno'
  | 'uno-50'
  | 'uno-25-arriba'
  | 'uno-25-centro'
  | 'dos-50'
  | 'dos-25'
  | 'tres-1-2'
  | 'tres-2-1'
  | 'cuatro'
  | 'mitad-cuarto';

export type Plantilla = { id: PlantillaId; nombre: string; ranuras: Rect[] };

export const PLANTILLAS: Plantilla[] = [
  { id: 'uno', nombre: '1 por hoja (completa)', ranuras: [{ x: 0, y: 0, w: 1, h: 1 }] },
  { id: 'uno-50', nombre: '1 al 50%', ranuras: [{ x: 0, y: 0, w: 1, h: 0.5 }] },
  { id: 'uno-25-arriba', nombre: '1 al 25% (arriba, centrada)', ranuras: [{ x: 0.25, y: 0, w: 0.5, h: 0.5 }] },
  { id: 'uno-25-centro', nombre: '1 al 25% (al centro de la hoja)', ranuras: [{ x: 0.25, y: 0.25, w: 0.5, h: 0.5 }] },
  {
    id: 'dos-50',
    nombre: '2 por hoja (50% y 50%)',
    ranuras: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: 'dos-25',
    nombre: '2 al 25% cada una',
    ranuras: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'tres-1-2',
    nombre: '3 mixto (1 grande arriba, 2 abajo)',
    ranuras: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'tres-2-1',
    nombre: '3 mixto (2 arriba, 1 grande abajo)',
    ranuras: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 1, h: 0.5 },
    ],
  },
  {
    id: 'cuatro',
    nombre: '4 por hoja (cuadrícula 2x2)',
    ranuras: [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
  {
    id: 'mitad-cuarto',
    nombre: '1 al 50% y 1 al 25%',
    ranuras: [
      { x: 0, y: 0, w: 1, h: 0.5 },
      { x: 0.25, y: 0.5, w: 0.5, h: 0.5 },
    ],
  },
];

/** Las 4 opciones populares de la herramienta 1. */
export const PLANTILLAS_POPULARES: PlantillaId[] = ['uno', 'dos-50', 'tres-1-2', 'cuatro'];

export function plantillaPorId(id: PlantillaId): Plantilla {
  const p = PLANTILLAS.find((x) => x.id === id);
  if (!p) throw new Error('Plantilla desconocida: ' + id);
  return p;
}

// ---------------------------------------------------------------------------
// Modelo de páginas
// ---------------------------------------------------------------------------
export type ItemLibre = { id: string; imagenId: string } & Rect;

export type Pagina =
  | { tipo: 'plantilla'; plantilla: PlantillaId; ranuras: Array<string | null> }
  | { tipo: 'libre'; items: ItemLibre[] };

export type Colocacion = { imagenId: string; rect: Rect };

export function paginaDePlantilla(plantilla: PlantillaId, imagenes: Array<string | null> = []): Pagina {
  const n = plantillaPorId(plantilla).ranuras.length;
  const ranuras: Array<string | null> = [];
  for (let i = 0; i < n; i += 1) ranuras.push(imagenes[i] ?? null);
  return { tipo: 'plantilla', plantilla, ranuras };
}

/** Reparte las imágenes (en orden) en tantas hojas como hagan falta. */
export function distribuir(imagenIds: string[], plantilla: PlantillaId): Pagina[] {
  const n = plantillaPorId(plantilla).ranuras.length;
  const paginas: Pagina[] = [];
  for (let i = 0; i < imagenIds.length; i += n) {
    paginas.push(paginaDePlantilla(plantilla, imagenIds.slice(i, i + n)));
  }
  return paginas;
}

export function colocaciones(pagina: Pagina): Colocacion[] {
  if (pagina.tipo === 'libre') {
    return pagina.items.map((it) => ({ imagenId: it.imagenId, rect: { x: it.x, y: it.y, w: it.w, h: it.h } }));
  }
  const { ranuras } = plantillaPorId(pagina.plantilla);
  const salida: Colocacion[] = [];
  pagina.ranuras.forEach((id, i) => {
    if (id && ranuras[i]) salida.push({ imagenId: id, rect: ranuras[i] });
  });
  return salida;
}

export function imagenesUsadas(paginas: Pagina[]): Set<string> {
  const usadas = new Set<string>();
  for (const p of paginas) for (const c of colocaciones(p)) usadas.add(c.imagenId);
  return usadas;
}

/** Quita una imagen de todas las hojas (la ranura queda vacía). */
export function quitarImagen(paginas: Pagina[], imagenId: string): Pagina[] {
  return paginas.map((p) =>
    p.tipo === 'libre'
      ? { ...p, items: p.items.filter((it) => it.imagenId !== imagenId) }
      : { ...p, ranuras: p.ranuras.map((r) => (r === imagenId ? null : r)) },
  );
}

/** Cambia la plantilla de una hoja conservando las imágenes en orden. */
export function cambiarPlantilla(pagina: Pagina, plantilla: PlantillaId): Pagina {
  const actuales = colocaciones(pagina).map((c) => c.imagenId);
  return paginaDePlantilla(plantilla, actuales);
}

// ---------------------------------------------------------------------------
// Matemática de ajuste (object-contain)
// ---------------------------------------------------------------------------
export function limitar(valor: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, valor));
}

/** Rect limitado para que no se salga de la hoja ni sea diminuto. */
export function normalizarRect(r: Rect, minimo = 0.08): Rect {
  const w = limitar(r.w, minimo, 1);
  const h = limitar(r.h, minimo, 1);
  return { x: limitar(r.x, 0, 1 - w), y: limitar(r.y, 0, 1 - h), w, h };
}

/**
 * Encaja una imagen dentro de una caja sin deformarla y centrada.
 * Se escala (reduce o amplía) hasta tocar los bordes de la caja, conservando la proporción.
 */
export function ajustarContener(anchoImg: number, altoImg: number, caja: { w: number; h: number }): { w: number; h: number; dx: number; dy: number } {
  if (anchoImg <= 0 || altoImg <= 0) return { w: 0, h: 0, dx: 0, dy: 0 };
  const escala = Math.min(caja.w / anchoImg, caja.h / altoImg);
  const w = anchoImg * escala;
  const h = altoImg * escala;
  return { w, h, dx: (caja.w - w) / 2, dy: (caja.h - h) / 2 };
}

// Hoja tamaño CARTA (8.5 x 11 in) en puntos PDF y márgenes.
export const HOJA = { ancho: 612, alto: 792, margen: 28, separacion: 6 } as const;

export type CajaPdf = { x: number; y: number; w: number; h: number };

/** Convierte una fracción de la hoja en una caja PDF (origen abajo-izquierda) con separación interna. */
export function rectAPdf(r: Rect): CajaPdf {
  const areaW = HOJA.ancho - HOJA.margen * 2;
  const areaH = HOJA.alto - HOJA.margen * 2;
  const pad = HOJA.separacion / 2;
  const w = Math.max(1, r.w * areaW - pad * 2);
  const h = Math.max(1, r.h * areaH - pad * 2);
  const x = HOJA.margen + r.x * areaW + pad;
  const yArriba = HOJA.margen + r.y * areaH + pad;
  return { x, y: HOJA.alto - yArriba - h, w, h };
}
