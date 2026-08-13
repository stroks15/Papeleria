/* eslint-disable */
import './globals.css'
import { ReactNode } from 'react'

export const metadata = {
  title: 'PAPELERÍA ARCOÍRIS 🌈',
  description: 'Asistente de trámites para adultos - Papelería Arcoíris',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="bg-gradient-to-b from-pink-50 via-indigo-50 to-yellow-50 text-gray-900">
        {children}
      </body>
    </html>
  )
}
