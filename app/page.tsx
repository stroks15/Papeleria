"use client";

import Link from "next/link";
import { AssistantProvider } from "@/context/AssistantContext";
import { AIServiceCard } from "@/components/AIServiceCard";
import Assistant from "@/components/Assistant";
import TramiteCard from "@/components/TramiteCard";
import { aiServicios } from "@/lib/ai-services";
import { tramites } from "@/lib/tramites";

export default function Home() {
  return (
    <AssistantProvider>
      <main className="min-h-screen p-4 max-w-md mx-auto">
        <header className="flex items-center justify-between my-4">
          <h1 className="text-2xl font-bold">
            Hola, soy tu asistente de Papelería Arcoíris 🌈
          </h1>
        </header>

        <p className="text-lg mt-2 mb-4">
          Te ayudamos a realizar tus trámites digitales paso a paso
        </p>

        <section className="mb-4 grid grid-cols-1 gap-3" aria-label="Herramientas nuevas">
          <Link href="/herramientas/creador-pdf" className="flex items-center gap-4 rounded-3xl bg-carta p-4 shadow-sm ring-2 ring-[#2E5A6C] active:scale-[0.98]">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-papel text-2xl" aria-hidden>📄</span>
            <span className="flex flex-col">
              <span className="font-display text-lg font-bold text-tinta">Creador de PDF con diseños</span>
              <span className="text-sm text-tinta-suave">Fotos de cámara o galería en 1, 2, 3, 4 por hoja o acomodo libre.</span>
            </span>
          </Link>
          <Link href="/herramientas/reorganizar-documento" className="flex items-center gap-4 rounded-3xl bg-carta p-4 shadow-sm ring-2 ring-[#2E5A6C] active:scale-[0.98]">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-papel text-2xl" aria-hidden>🗂️</span>
            <span className="flex flex-col">
              <span className="font-display text-lg font-bold text-tinta">Reorganizar imágenes de un documento</span>
              <span className="text-sm text-tinta-suave">Saca las imágenes de un PDF o Word y acomódalas en hojas nuevas.</span>
            </span>
          </Link>
        </section>

        <Link
          href="/ventanilla"
          className="mb-4 flex items-center gap-4 rounded-3xl bg-[#2E5A6C] p-4 text-white shadow-sm active:scale-[0.98]"
        >
          <span className="text-3xl" aria-hidden>🏛️</span>
          <span className="flex flex-col">
            <span className="text-lg font-bold">Ventanilla Digital CDMX</span>
            <span className="text-sm opacity-90">Tenencia, verificación y actas del Registro Civil</span>
          </span>
        </Link>

        <section className="grid grid-cols-1 gap-3" aria-label="Trámites disponibles">
          {tramites.map((tramite) => (
            <TramiteCard key={tramite.slug} tramite={tramite} />
          ))}
        </section>

        <section className="mt-8">
          <div className="mb-3">
            <h2 className="text-xl font-bold text-tinta">Herramientas y servicios</h2>
            <p className="text-sm text-tinta-suave">Elige una opción para comenzar.</p>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {aiServicios.map((servicio) => (
              <AIServiceCard key={servicio.id} servicio={servicio} />
            ))}
          </div>
        </section>

        <Assistant />

        <footer className="mt-8 text-center text-sm text-gray-600">
          🌈 PAPELERÍA ARCOÍRIS — Fácil y con ayuda
        </footer>
      </main>
    </AssistantProvider>
  );
}
