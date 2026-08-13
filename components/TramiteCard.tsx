import React from 'react'

export const TramiteCard = ({ emoji, title }: { emoji: string, title: string }) => {
  return (
    <div className="bg-white rounded-xl p-4 shadow-md flex items-center gap-4">
      <div className="text-3xl">{emoji}</div>
      <div>
        <div className="text-xl font-semibold">{title}</div>
        <div className="text-sm text-gray-500">Vamos paso a paso — No te preocupes</div>
      </div>
    </div>
  )
}
