"use client";

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

        <div className="fixed bottom-6 right-4">
          <Assistant />
        </div>

        <footer className="mt-8 text-center text-sm text-gray-600">
          🌈 PAPELERÍA ARCOÍRIS — Fácil y con ayuda
        </footer>
      </main>
    </AssistantProvider>
  );
}
