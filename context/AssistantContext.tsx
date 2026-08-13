"use client"

import React, { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "../lib/supabase"

type Message = { id: string; from: "user" | "assistant"; text: string; createdAt: string }

type AssistantContextValue = {
  messages: Message[]
  sendMessage: (text: string) => Promise<void>
  resetSession: () => void
  sessionId: string
}

const AssistantContext = createContext<AssistantContextValue | undefined>(undefined)

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    return localStorage.getItem("ar_session_id") || `${Date.now()}`
  })

  useEffect(() => {
    // load persisted messages
    try {
      const raw = localStorage.getItem("ar_messages")
      if (raw) setMessages(JSON.parse(raw))
    } catch (e) {
      console.error("No se pudo cargar la sesión:", e)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem("ar_messages", JSON.stringify(messages))
    localStorage.setItem("ar_session_id", sessionId)
  }, [messages, sessionId])

  const sendMessage = async (text: string) => {
    const userMsg: Message = { id: String(Date.now()), from: "user", text, createdAt: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId })
      })

      const data = await res.json()
      const reply: Message = { id: String(Date.now() + 1), from: "assistant", text: data.reply, createdAt: new Date().toISOString() }
      setMessages(prev => [...prev, reply])

      // optional: save to Supabase history table (best-effort)
      try {
        await supabaseSaveHistoryIfPossible({ sessionId, userMessage: text, assistantReply: data.reply })
      } catch (e) {
        // non-fatal
        console.debug("Supabase save skipped or failed", e)
      }

    } catch (e) {
      const fallback: Message = { id: String(Date.now() + 2), from: "assistant", text: "Perdón, tuve un problema al procesar tu solicitud. Intenta de nuevo." , createdAt: new Date().toISOString() }
      setMessages(prev => [...prev, fallback])
    }
  }

  const resetSession = () => {
    setMessages([])
    const newId = `${Date.now()}`
    setSessionId(newId)
    localStorage.removeItem("ar_messages")
  }

  return (
    <AssistantContext.Provider value={{ messages, sendMessage, resetSession, sessionId }}>
      {children}
    </AssistantContext.Provider>
  )
}

export function useAssistant() {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error("useAssistant must be used within AssistantProvider")
  return ctx
}

async function supabaseSaveHistoryIfPossible(payload: { sessionId: string; userMessage: string; assistantReply: string }){
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return
  // call a table insert via public anon key - this is example code and depends on your Supabase rules
  try {
    await supabase.from('historial').insert({ nota: JSON.stringify({ user: payload.userMessage, assistant: payload.assistantReply, session: payload.sessionId }) })
  } catch (e) {
    console.debug('supabase insert failed', e)
  }
}
