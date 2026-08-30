import Link from 'next/link';

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-tinta/10 bg-carta/95 py-2 backdrop-blur">
      <Link
        href="/"
        className="flex flex-col items-center gap-0.5 px-4 py-1 text-sm font-medium text-tinta"
      >
        <span className="text-xl" aria-hidden>
          🏠
        </span>
        Inicio
      </Link>
      <a
        href="tel:5557445419"
        className="flex flex-col items-center gap-0.5 px-4 py-1 text-sm font-medium text-tinta-suave"
      >
        <span className="text-xl" aria-hidden>
          📞
        </span>
        Ayuda
      </a>
    </nav>
  );
}
