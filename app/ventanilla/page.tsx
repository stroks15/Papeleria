import type { Metadata } from 'next';
import Header from '@/components/Header';
import BottomNav from '@/components/BottomNav';
import VentanillaCDMX from '@/components/VentanillaCDMX';

export const metadata: Metadata = {
  title: 'Ventanilla Digital CDMX · Papelería Arcoíris',
};

export default function PaginaVentanilla() {
  return (
    <main className="min-h-screen pb-24">
      <Header subtitulo="Ventanilla digital de trámites rápidos de la CDMX" />
      <VentanillaCDMX />
      <BottomNav />
    </main>
  );
}
