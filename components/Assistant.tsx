import React from 'react'

export default function Assistant(){
  return (
    <div className="w-72 bg-white/95 rounded-2xl shadow-lg p-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-pink-400 to-yellow-300 flex items-center justify-center text-xl">🌈</div>
        <div>
          <div className="font-semibold">ArcoirisAI Assistant</div>
          <div className="text-xs text-gray-600">"Vamos paso a paso"</div>
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-700">Puedo explicarte los pasos, decirte qué falta y acompañarte durante el trámite.</div>

      <div className="mt-3">
        <button className="btn-large w-full bg-gradient-to-r from-pink-500 to-purple-500 text-white">Abrir asistente</button>
      </div>
    </div>
  )
}
