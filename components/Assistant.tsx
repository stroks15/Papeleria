"use client"

import React, { useState } from 'react'
import { useAssistant } from '../context/AssistantContext'

export default function Assistant(){
  const [open, setOpen] = useState(false)
  const { messages, sendMessage, resetSession } = useAssistant()
  const [input, setInput] = useState('')

  const handleSend = async () => {
    if (!input.trim()) return
    await sendMessage(input.trim())
    setInput('')
  }

  return (
    <div className="fixed bottom-6 right-4 z-50">
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-large bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full shadow-lg flex items-center gap-3">
          <span className="text-2xl">🌈</span>
          <span>ArcoirisAI</span>
        </button>
      ) : (
        <div className="w-80 bg-white rounded-2xl shadow-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-pink-400 to-yellow-300 flex items-center justify-center">🌈</div>
              <div>
                <div className="font-semibold">ArcoirisAI Assistant</div>
                <div className="text-xs text-gray-600">"Vamos paso a paso"</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { resetSession() }} className="text-sm text-red-600">🔄 Nuevo trámite</button>
              <button onClick={() => setOpen(false)} className="text-sm text-gray-600">Cerrar</button>
            </div>
          </div>

          <div className="mt-3 max-h-64 overflow-y-auto space-y-2">
            {messages.length === 0 && (
              <div className="text-sm text-gray-700">Hola, soy tu asistente. Puedes preguntarme qué escribir o cómo seguir.</div>
            )}

            {messages.map(m => (
              <div key={m.id} className={`p-2 rounded-lg ${m.from === 'user' ? 'bg-blue-50 text-right' : 'bg-gray-100 text-left'}`}>
                <div className="text-sm">{m.text}</div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <input value={input} onChange={e => setInput(e.target.value)} placeholder='Ej: "No sé qué poner"' className="flex-1 p-2 rounded-lg border text-lg" />
            <button onClick={handleSend} className="btn-large bg-green-500 text-white">Enviar</button>
          </div>

          <div className="mt-2 text-xs text-gray-500">Si ves CAPTCHA en el sitio oficial, te diremos que lo completes manualmente.</div>
        </div>
      )}
    </div>
  )
}
