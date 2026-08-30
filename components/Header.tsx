import Link from 'next/link';

export default function Header({ subtitulo }: { subtitulo?: string }) {
  return (
    <header className="px-5 pt-6 pb-4">
      <Link href="/" className="flex items-center gap-2">
        <span className="text-3xl" aria-hidden>
          🌈
        </span>
        <span className="font-display text-2xl font-bold text-tinta">
          Papelería Arcoíris
        </span>
      </Link>
      {subtitulo && <p className="mt-1 text-tinta-suave">{subtitulo}</p>}
    </header>
  );
}
