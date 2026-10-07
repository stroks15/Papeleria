import Link from 'next/link';

export default function BottomNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-center border-t border-tinta/10 bg-carta/95 py-2 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 rounded-xl px-5 py-2 text-base font-bold text-tinta">
        <span className="text-xl" aria-hidden>🏠</span>
        Inicio
      </Link>
    </nav>
  );
}