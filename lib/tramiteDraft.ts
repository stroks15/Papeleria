export type TramiteDraft = {
  paso: number;
  valores: Record<string, string>;
  updatedAt: number;
};

const PREFIX = 'papeleria-arcoiris:tramite:';
const VERSION = 1;

function key(slug: string): string {
  return `${PREFIX}${VERSION}:${slug}`;
}

export function cargarBorrador(slug: string): TramiteDraft | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<TramiteDraft>;
    if (
      typeof parsed.paso !== 'number' ||
      typeof parsed.valores !== 'object' ||
      parsed.valores === null
    ) {
      return null;
    }

    return {
      paso: parsed.paso,
      valores: parsed.valores as Record<string, string>,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function guardarBorrador(
  slug: string,
  draft: Pick<TramiteDraft, 'paso' | 'valores'>,
): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      key(slug),
      JSON.stringify({
        paso: draft.paso,
        valores: draft.valores,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Si el almacenamiento está lleno/bloqueado, el formulario sigue funcionando.
  }
}

export function borrarBorrador(slug: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key(slug));
  } catch {
    // No bloquear la UX por un fallo de almacenamiento.
  }
}
