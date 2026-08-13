"use client"

import '../app/globals.css'
import { AssistantProvider } from '../context/AssistantContext'
import Link from 'next/link'
import { TramiteCard } from '../components/TramiteCard'
import Assistant from '../components/Assistant'

export default function Home() {
  const tramites = [
    { id: 'cfe', title: 'Recibo CFE', emoji: '📄' },
    { id: 'tenencia-cdmx', title: 'Tenencia CDMX', emoji: '🚗' },
    { id: 'tenencia-edomex', title: 'Tenencia EDOMEX', emoji: '🚙' },
    { id: 'multas-edomex', title: 'Multas EDOMEX', emoji: '⚠️' },
    { id: 'multas-cdmx', title: 'Multas CDMX', emoji: '⚠️' },
    { id: 'agua-sacmex', title: 'Agua SACMEX', emoji: '💧' },
  ]

  return (
    <AssistantProvider>
      <main className="min-h-screen p-4 max-w-md mx-auto">
        <header className="flex items-center justify-between my-4">
          <h1 className="text-2xl font-bold">Hola, soy tu asistente de Papelería Arcoíris 🌈</h1>
        </header>

        <p className="text-lg mt-2 mb-4">Te ayudamos a realizar tus trámites digitales paso a paso</p>

        <section className="grid grid-cols-1 gap-3">
          {tramites.map(t => (
            <Link key={t.id} href={`/tramites/${t.id}`}>
              <a>
                <TramiteCard emoji={t.emoji} title={t.title} />
              </a>
            </Link>
          ))}
        </section>

        <div className="fixed bottom-6 right-4">
          <Assistant />
        </div>

        <footer className="mt-8 text-center text-sm text-gray-600">🌈 PAPELERÍA ARCOÍRIS — Fácil y con ayuda</footer>

      </main>
    </AssistantProvider>
  )
}
