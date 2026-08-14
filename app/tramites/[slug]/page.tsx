const TRAMITES_META: Record<string, { title: string, official?: string }> = {
  'cfe': { title: 'Recibo CFE', official: 'https://app.cfe.mx/Aplicaciones/CCFE/ReciboDeLuzGMX/Consulta' },
  'tenencia-cdmx': { title: 'Tenencia CDMX', official: 'https://data.finanzas.cdmx.gob.mx/Front_ten/' },
  'tenencia-edomex': { title: 'Tenencia EDOMEX', official: 'https://tenencia.edomex.gob.mx/TenenciaIndividual/tenencia/A06E1A88B8A6ED4B/#/' },
  'multas-edomex': { title: 'Multas EDOMEX', official: 'https://infracciones.ssedomex.gob.mx/Search' },
  'multas-cdmx': { title: 'Multas CDMX', official: 'https://data.finanzas.cdmx.gob.mx/consulta_adeudos' },
  'agua-sacmex': { title: 'Agua SACMEX', official: 'https://aplicaciones.sacmex.cdmx.gob.mx/fut/' },
}

export default function TramitePage({ params }: { params: { slug: string } }){
  const slug = params.slug
  const meta = TRAMITES_META[slug] || { title: 'Trámite' }

  return (
    <main className="min-h-screen p-4 max-w-md mx-auto">
      <header className="mb-4">
        <h2 className="text-2xl font-bold">{meta.title}</h2>
        <p className="text-gray-600">Vamos paso a paso — "No te preocupes, te ayudaré"</p>
      </header>

      <section className="bg-white rounded-xl p-4 shadow-sm">
        <ol className="list-decimal pl-5 space-y-3 text-lg">
          <li>Elegir trámite</li>
          <li>Capturar datos</li>
          <li>Validar información</li>
          <li>Finalizar</li>
        </ol>

        <div className="mt-4">
          {/* Simple dynamic form for CFE example */}
          {slug === 'cfe' ? (
            <form className="space-y-3">
              <div>
                <label className="block text-lg font-medium">Nombre de servicio</label>
                <input className="w-full mt-1 p-3 rounded-lg border text-lg" placeholder="Ej: Juan Pérez" />
              </div>

              <div>
                <label className="block text-lg font-medium">Número de servicio</label>
                <input className="w-full mt-1 p-3 rounded-lg border text-lg" placeholder="Ej: 1234567890" />
              </div>

              <div className="text-sm text-gray-600">Lada: 55 • Teléfono: 57445419 • Correo: dexterh4ck@gmail.com</div>

              <div className="flex gap-2 mt-3">
                <button type="button" className="btn-large bg-green-500 text-white flex-1">Siguiente</button>
                <button type="button" className="btn-large bg-red-100 text-red-700 flex-1">🔄 Nuevo trámite</button>
              </div>

              <div className="mt-3 text-sm text-gray-700">Si el sitio oficial muestra un CAPTCHA, te informaremos y no intentaremos resolverlo.</div>
            </form>
          ) : (
            <div className="text-lg">
              Para este trámite abriremos el sitio oficial para que sigas las indicaciones.
              <br/><br/>
              Sitio oficial: {meta.official ? (
                <a className="text-blue-600 underline" href={meta.official} target="_blank" rel="noopener noreferrer">{meta.official}</a>
              ) : (
                'No disponible'
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
