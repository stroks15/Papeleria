import { notFound } from 'next/navigation';
import ServicioClient from '@/components/ServicioClient';
import { aiServicios } from '@/lib/ai-services';

export function generateStaticParams() {
  return aiServicios.map((servicio) => ({ id: servicio.id }));
}

export default function ServicioPage({ params }: { params: { id: string } }) {
  const servicio = aiServicios.find((item) => item.id === params.id);
  if (!servicio) notFound();
  return <ServicioClient servicio={servicio} />;
}
