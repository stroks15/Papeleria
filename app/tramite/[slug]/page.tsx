import { notFound } from 'next/navigation';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import TramiteFlow from '@/components/TramiteFlow';
import { getTramitePorSlug, tramites } from '@/lib/tramites';

export function generateStaticParams() {
  return tramites.map((t) => ({ slug: t.slug }));
}

export default function PaginaTramite({ params }: { params: { slug: string } }) {
  const tramite = getTramitePorSlug(params.slug);
  if (!tramite) notFound();

  return (
    <main className="min-h-screen">
      <Header subtitulo={tramite.descripcionCorta} />
      <TramiteFlow tramite={tramite} />
      <BottomNav />
    </main>
  );
}
