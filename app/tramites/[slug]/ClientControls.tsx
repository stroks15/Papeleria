'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

export default function ClientControls({ official }: { official?: string }){
  const router = useRouter()

  return (
    <div className="mt-4 flex flex-col sm:flex-row gap-2">
      <button
        type="button"
        onClick={() => router.back()}
        className="btn-large bg-gray-100 text-gray-800 px-4 py-2 rounded"
      >
        Volver
      </button>

      <button
        type="button"
        onClick={() => router.push('/')}
        className="btn-large bg-blue-500 text-white px-4 py-2 rounded"
      >
        Inicio
      </button>

      {official ? (
        <button
          type="button"
          onClick={() => window.open(official, '_blank', 'noopener')}
          className="btn-large bg-green-500 text-white px-4 py-2 rounded"
        >
          Abrir sitio oficial
        </button>
      ) : null}
    </div>
  )
}
