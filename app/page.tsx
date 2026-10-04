"use client"

import '../app/globals.css'
import { AssistantProvider } from '../context/AssistantContext'
import Link from 'next/link'
import { TramiteCard } from '../components/TramiteCard'
import { AIServiceCard } from '../components/AIServiceCard'
import Assistant from '../components/Assistant'
import { aiServicios } from '../lib/ai-services'

export default function Home() {
  const tramites = [
    { id: 'recibo-cfe', title: 'Recibo CFE', emoji: '📄' },
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
            <Link key={t.id} href={`/tramite/${t.id}`}>
              <div className="flex items-center gap-4 rounded-3xl bg-carta p-4 shadow-sm ring-1 ring-tinta/5 transition-transform active:scale-[0.98]">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-papel text-2xl" aria-hidden>
                  {t.emoji}
                </span>
                <span className="font-display text-lg font-bold text-tinta">{t.title}</span>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-xl font-bold text-tinta">Herramientas y servicios</h2>
            <p className="text-sm text-tinta-suave">Elige una opción para comenzar.</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {aiServicios.map(servicio => (
              <AIServiceCard key={servicio.id} servicio={servicio} />
            ))}
          </div>
        </section>

        <div className="fixed bottom-6 right-4">
          <Assistant />
        </div>

        <footer className="mt-8 text-center text-sm text-gray-600">🌈 PAPELERÍA ARCOÍRIS — Fácil y con ayuda</footer>
      </main>
    </AssistantProvider>
  )
}
