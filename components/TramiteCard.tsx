import Link from 'next/link';
import type { Tramite } from '@/lib/tramites';

export default function TramiteCard({ tramite }: { tramite: Tramite }) {
  return (
    <Link
      href={`/tramite/${tramite.slug}`}
      className="flex items-center gap-4 rounded-3xl bg-carta p-4 shadow-sm ring-1 ring-tinta/5 transition-transform active:scale-[0.98]"
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
        style={{ backgroundColor: tramite.colorSuaveHex }}
        aria-hidden
      >
        {tramite.emoji}
      </span>
      <span className="flex flex-col">
        <span className="font-display text-lg font-bold text-tinta">
          {tramite.nombre}
        </span>
        <span className="text-sm text-tinta-suave">{tramite.descripcionCorta}</span>
      </span>
    </Link>
  );
}
