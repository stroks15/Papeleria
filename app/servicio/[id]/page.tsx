"use client"

import { useState } from 'react'
import Link from 'next/link'
import { aiServicios } from '@/lib/ai-services'

export default function ServicioPage({ params }: { params: { id: string } }) {
  const servicio = aiServicios.find(item => item.id === params.id)
  const [mensaje, setMensaje] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [cargando, setCargando] = useState(false)

  if (!servicio) {
    return (
      <main className="min-h-screen p-4 max-w-md mx-auto">
        <p className="text-tinta">Servicio no encontrado.</p>
        <Link href="/" className="mt-4 inline-block rounded-full bg-oficial px-4 py-2 text-carta">Volver al inicio</Link>
      </main>
    )
  }

  async function iniciarServicio() {
    setCargando(true)
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: mensaje.trim() || `Quiero usar el servicio: ${servicio.title}`,
          context: {
            currentModule: servicio.id,
            currentStep: 'inicio',
            requestedAction: servicio.action,
          },
        }),
      })
      const data = await res.json()
      setRespuesta(data.ok ? data.reply : (data.error || 'No se pudo iniciar el servicio.'))
    } catch {
      setRespuesta('No pude conectar con ArcoirisAI. Intenta de nuevo.')
    } finally {
      setCargando(false)
    }
  }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto">
      <Link href="/" className="text-sm font-medium text-tinta-suave">← Volver</Link>

      <section className="mt-4 rounded-3xl bg-carta p-5 shadow-sm ring-1 ring-tinta/5">
        <div className="flex items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-papel text-3xl" aria-hidden>
            {servicio.emoji}
          </span>
          <div>
            <h1 className="text-2xl font-bold text-tinta">{servicio.title}</h1>
            <p className="text-sm text-tinta-suave">{servicio.description}</p>
          </div>
        </div>

        <label className="mt-5 block text-sm font-medium text-tinta" htmlFor="mensaje-servicio">
          ¿Qué necesitas hacer?
        </label>
        <textarea
          id="mensaje-servicio"
          value={mensaje}
          onChange={event => setMensaje(event.target.value)}
          placeholder={`Cuéntame qué necesitas para ${servicio.title.toLowerCase()}...`}
          className="mt-2 min-h-28 w-full rounded-2xl bg-papel p-3 text-tinta outline-none ring-1 ring-tinta/10 focus:ring-2 focus:ring-oficial"
        />

        <button
          type="button"
          onClick={iniciarServicio}
          disabled={cargando}
          className="mt-4 w-full rounded-2xl bg-oficial px-4 py-3 font-bold text-carta disabled:opacity-60"
        >
          {cargando ? 'Procesando…' : 'Comenzar con ArcoirisAI'}
        </button>

        {respuesta && (
          <div className="mt-4 rounded-2xl bg-papel p-4 text-tinta" aria-live="polite">
            {respuesta}
          </div>
        )}
      </section>
    </main>
  )
}
