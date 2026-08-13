import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { message, sessionId } = await req.json()

    // If OPENAI_API_KEY is configured, proxy the request to OpenAI
    if (process.env.OPENAI_API_KEY) {
      const payload = {
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Eres un asistente amable y sencillo dirigido a adultos mayores. Usa frases cortas y claras, explica pasos y recuerda el trámite durante la sesión.' },
          { role: 'user', content: message }
        ],
        max_tokens: 400,
        temperature: 0.6
      }

      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify(payload)
      })

      if (!r.ok) {
        const text = await r.text()
        return NextResponse.json({ reply: 'Lo siento, no pude obtener respuesta del servicio de IA. Intenta más tarde.' }, { status: 502 })
      }

      const json = await r.json()
      const reply = json?.choices?.[0]?.message?.content || 'Lo siento, no entendí eso.'
      return NextResponse.json({ reply })
    }

    // Fallback: simple rule-based responses (no external keys)
    const lower = String(message).toLowerCase()
    let reply = "Vamos paso a paso. ¿En qué parte te atoras?"

    if (lower.includes('no sé') || lower.includes('no se') || lower.includes('qué poner') || lower.includes('que poner')) {
      reply = 'Este campo corresponde al número de servicio. Puedes encontrarlo en tu recibo. Si no lo tienes, busca la palabra "No. de servicio" en tu recibo de luz.'
    } else if (lower.includes('captcha')) {
      reply = 'El sitio oficial solicita una verificación de seguridad. Completa el CAPTCHA para continuar. No intento resolverlo por ti.'
    } else if (lower.includes('gracias') || lower.includes('muchas')) {
      reply = 'Con gusto. Si necesitas seguir, dime qué trámite quieres hacer.'
    }

    return NextResponse.json({ reply })
  } catch (e) {
    return NextResponse.json({ reply: 'Hubo un error procesando tu mensaje. Intenta de nuevo.' }, { status: 500 })
  }
}
