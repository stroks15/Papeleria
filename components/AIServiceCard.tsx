import Link from 'next/link'
import type { AIServicio } from '@/lib/ai-services'

export function AIServiceCard({ servicio }: { servicio: AIServicio }) {
  return (
    <Link
      href={`/servicio/${servicio.id}`}
      className="flex items-center gap-4 rounded-3xl bg-carta p-4 shadow-sm ring-1 ring-tinta/5 transition-transform active:scale-[0.98]"
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-papel text-2xl"
        aria-hidden
      >
        {servicio.emoji}
      </span>
      <span className="flex flex-col">
        <span className="font-display text-lg font-bold text-tinta">{servicio.title}</span>
        <span className="text-sm text-tinta-suave">{servicio.description}</span>
      </span>
    </Link>
  )
}
