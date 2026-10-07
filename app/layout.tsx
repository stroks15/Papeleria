import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Papelería Arcoíris',
  description: 'Te ayudamos a realizar tus trámites fácil y rápido.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="font-body bg-papel text-tinta antialiased">
        {children}
      </body>
    </html>
  );
}
