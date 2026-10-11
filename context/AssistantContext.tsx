"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react"
import { Capacitor } from "@capacitor/core"
import { supabase } from "../lib/supabase"

type Message = { id: string; from: "user" | "assistant"; text: string; createdAt: string }

type AssistantContextValue = {
  messages: Message[]
  sendMessage: (text: string) => Promise<void>
  resetSession: () => void
  sessionId: string
}

const AssistantContext = createContext<AssistantContextValue | undefined>(undefined)

const MESSAGES_KEY = "ar_messages"
const SESSION_KEY = "ar_session_id"

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key)
    else window.localStorage.setItem(key, value)
  } catch {
    // Almacenamiento lleno o bloqueado: la sesión sigue funcionando en memoria.
  }
}

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string>("")
  const hydrated = useRef(false)
  const counter = useRef(0)

  // Se hidrata solo en el cliente (evita diferencias entre servidor y navegador).
  useEffect(() => {
    const savedSession = readStorage(SESSION_KEY)
    setSessionId(savedSession || `${Date.now()}`)
    try {
      const raw = readStorage(MESSAGES_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setMessages(parsed as Message[])
      }
    } catch (e) {
      console.error("No se pudo cargar la sesión:", e)
    }
    hydrated.current = true
  }, [])

  // No se escribe hasta hidratar: antes se pisaba la sesión guardada con una lista vacía.
  useEffect(() => {
    if (!hydrated.current) return
    writeStorage(MESSAGES_KEY, JSON.stringify(messages.slice(-100)))
    if (sessionId) writeStorage(SESSION_KEY, sessionId)
  }, [messages, sessionId])

  const nextId = () => `${Date.now()}-${counter.current++}`

  const sendMessage = useCallback(
    async (text: string) => {
      const userMsg: Message = { id: nextId(), from: "user", text, createdAt: new Date().toISOString() }
      setMessages((prev) => [...prev, userMsg])

      try {
        const apiBase =
          process.env.NEXT_PUBLIC_ASSISTANT_API_URL ||
          (Capacitor.isNativePlatform() ? "https://papeleria-flax.vercel.app" : "")
        const res = await fetch(`${apiBase.replace(/\/$/, "")}/api/assistant`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, sessionId }),
        })

        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error(data?.error || "Respuesta inválida")
        const reply: Message = { id: nextId(), from: "assistant", text: String(data.reply ?? ""), createdAt: new Date().toISOString() }
        setMessages((prev) => [...prev, reply])

        // Historial opcional en Supabase (best-effort).
        try {
          await supabaseSaveHistoryIfPossible({ sessionId, userMessage: text, assistantReply: reply.text })
        } catch (e) {
          console.debug("Supabase save skipped or failed", e)
        }
      } catch {
        const fallback: Message = {
          id: nextId(),
          from: "assistant",
          text: "Perdón, tuve un problema al procesar tu solicitud. Intenta de nuevo.",
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, fallback])
      }
    },
    [sessionId],
  )

  const resetSession = useCallback(() => {
    setMessages([])
    setSessionId(`${Date.now()}`)
    writeStorage(MESSAGES_KEY, null)
  }, [])

  const value = useMemo(
    () => ({ messages, sendMessage, resetSession, sessionId }),
    [messages, sendMessage, resetSession, sessionId],
  )

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistant() {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider")
  return ctx
}

async function supabaseSaveHistoryIfPossible(payload: { sessionId: string; userMessage: string; assistantReply: string }) {
  if (!supabase) return
  // El historial es opcional: nunca debe bloquear al asistente si Supabase no está configurado.
  try {
    await supabase.from("historial").insert({
      nota: JSON.stringify({ user: payload.userMessage, assistant: payload.assistantReply, session: payload.sessionId }),
    })
  } catch (e) {
    console.debug("supabase insert failed", e)
  }
}
