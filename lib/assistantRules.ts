import type { CampoTramite, Tramite } from '@/lib/tramites';
import { nombresPasos, tramites } from '@/lib/tramites';

/**
 * Asistente por reglas: responde con la información de lib/tramites.ts, sin red y sin
 * gastar cuota de IA. Sirve (1) para los botones rápidos, (2) para preguntas frecuentes
 * y (3) como respaldo cuando ArcoirisAI no está disponible.
 */

export type ContextoAsistente = {
  modo: 'inicio' | 'tramite';
  tramite?: Tramite;
  paso?: number;
  campoActivo?: CampoTramite;
};

export type TipoRespuestaRapida = 'no-se' | 'que-sigue' | 'repetir';

export type RespuestaReglas = {
  texto: string;
  /** alta = coincide con una pregunta conocida · baja = respuesta genérica de respaldo */
  confianza: 'alta' | 'baja';
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tiene(texto: string, palabras: string[]): boolean {
  return palabras.some((palabra) => texto.includes(palabra));
}

function listaCampos(tramite: Tramite): string {
  return tramite.campos.map((campo) => campo.etiqueta.toLowerCase()).join(' y ');
}

export function saludoAsistente(ctx: ContextoAsistente): string {
  if (ctx.modo === 'tramite' && ctx.tramite && ctx.paso) {
    const paso = nombresPasos[ctx.paso - 1] ?? '';
    return `Paso ${ctx.paso} de ${nombresPasos.length} · ${ctx.tramite.nombre} · ${paso}. Si tienes una duda, pregúntame aquí.`;
  }
  return 'Hola. Soy tu asistente de Papelería Arcoíris. Puedo ayudarte con trámites, documentos y herramientas. ¿Qué necesitas?';
}

export function explicarPasoActual(ctx: ContextoAsistente): string {
  const { tramite, paso } = ctx;
  if (!tramite || !paso) {
    return `Elige un trámite en la pantalla principal (${tramites.map((t) => t.nombre).join(', ')}) y te guío paso a paso.`;
  }
  switch (paso) {
    case 2:
      return `Estás en "Capturar información" de ${tramite.nombre}. Escribe ${listaCampos(tramite)}. Si no sabes qué poner en un campo, toca "No sé qué poner".`;
    case 3:
      return `Estás en "Revisar datos". Lee con calma ${listaCampos(tramite)}. Si algo está mal toca "Corregir"; si todo está bien, toca "Continuar".`;
    case 4:
      return `Estás en "Obtener documento". Toca "Abrir sitio oficial": tus datos se escriben solos cuando el portal lo permite (si no, puedes copiarlos con el botón de cada dato). Después resuelve tú la verificación de seguridad (CAPTCHA) y sigue las instrucciones del portal.`;
    default:
      return `Vas en el paso ${paso} de ${nombresPasos.length} de ${tramite.nombre}.`;
  }
}

export function respuestaRapida(tipo: TipoRespuestaRapida, ctx: ContextoAsistente): string {
  if (tipo === 'repetir') return explicarPasoActual(ctx);

  if (tipo === 'no-se') {
    if (ctx.campoActivo) {
      const campo = ctx.campoActivo;
      return `${campo.etiqueta}: ${campo.ayuda}\n\nEjemplo: ${campo.placeholder}`;
    }
    if (ctx.tramite) return `Para ${ctx.tramite.nombre} necesitas: ${listaCampos(ctx.tramite)}. Dime cuál te causa duda y te ayudo.`;
    return 'Dime qué trámite quieres hacer y te explico qué datos necesitas.';
  }

  // 'que-sigue'
  if (!ctx.tramite || !ctx.paso) {
    return 'Elige el trámite que necesitas en la pantalla principal. Yo te voy diciendo qué sigue en cada paso.';
  }
  if (ctx.paso >= 4) return 'Ya estás en el último paso: abre el sitio oficial, completa la verificación de seguridad y descarga o imprime tu documento.';
  const siguiente = nombresPasos[ctx.paso] ?? '';
  return `Lo que sigue es "${siguiente}". ${explicarPasoActual({ ...ctx, paso: ctx.paso })}`;
}

function buscarTramitePorTexto(pregunta: string): Tramite | undefined {
  if (tiene(pregunta, ['cfe', 'luz', 'electric'])) return tramites.find((t) => t.slug === 'recibo-cfe');
  if (tiene(pregunta, ['agua', 'sacmex'])) return tramites.find((t) => t.slug === 'agua-sacmex');
  const edomex = tiene(pregunta, ['edomex', 'estado de mexico', 'toluca', 'neza', 'nezahualcoyotl', 'ecatepec']);
  if (tiene(pregunta, ['tenencia'])) return tramites.find((t) => t.slug === (edomex ? 'tenencia-edomex' : 'tenencia-cdmx'));
  if (tiene(pregunta, ['multa', 'infraccion', 'adeudo'])) return tramites.find((t) => t.slug === (edomex ? 'multas-edomex' : 'multas-cdmx'));
  return undefined;
}

function describirTramite(tramite: Tramite): string {
  const datos = tramite.campos
    .map((campo) => `• ${campo.etiqueta}: ${campo.ayuda}`)
    .join('\n');
  return `${tramite.emoji} ${tramite.nombre} — ${tramite.descripcionCorta}.\n\nNecesitas:\n${datos}`;
}

/**
 * Responde preguntas frecuentes con datos de tramites.ts. Si no reconoce la pregunta,
 * devuelve una respuesta genérica con confianza "baja" (para que la IA tenga prioridad).
 */
export function responderPorReglas(pregunta: string, ctx: ContextoAsistente): RespuestaReglas {
  const q = normalizar(pregunta);

  if (tiene(q, ['captcha', 'no soy un robot', 'verificacion de seguridad', 'imagenes de semaforos'])) {
    return {
      confianza: 'alta',
      texto:
        'La verificación de seguridad (CAPTCHA) la tienes que resolver tú en el portal oficial; la app nunca la resuelve ni la evita. Cuando termines, toca el botón del portal para continuar.',
    };
  }

  if (tiene(q, ['contrasena', 'password', 'clave de acceso'])) {
    return {
      confianza: 'alta',
      texto:
        'Estos trámites no necesitan contraseña. Nunca escribas contraseñas ni datos bancarios en esta app; si el portal te pide algo así, pregunta primero en la papelería.',
    };
  }

  if (tiene(q, ['pagar', 'pago', 'cuanto cuesta', 'cuanto debo'])) {
    return {
      confianza: 'alta',
      texto:
        'La app no procesa pagos. Consulta tu adeudo en el portal oficial y paga ahí o directamente en la papelería; ahí también te ayudan a imprimir tu línea de captura o recibo.',
    };
  }

  if (tiene(q, ['no se que poner', 'no se que escribir', 'que pongo', 'que escribo', 'donde lo encuentro', 'donde lo veo', 'ayuda con este campo'])) {
    return { confianza: 'alta', texto: respuestaRapida('no-se', ctx) };
  }

  if (tiene(q, ['que sigue', 'siguiente paso', 'despues que', 'ya termine', 'y ahora'])) {
    return { confianza: 'alta', texto: respuestaRapida('que-sigue', ctx) };
  }

  if (tiene(q, ['repite', 'repetir', 'no entendi', 'donde estoy', 'en que paso'])) {
    return { confianza: 'alta', texto: respuestaRapida('repetir', ctx) };
  }

  // Preguntas sobre un campo concreto del trámite actual (p. ej. "¿qué es el número de servicio?").
  if (ctx.tramite) {
    const campo = ctx.tramite.campos.find((c) => {
      const etiqueta = normalizar(c.etiqueta);
      return q.includes(etiqueta) || c.pistasPortal.some((pista) => pista.length > 4 && q.includes(normalizar(pista)));
    });
    if (campo) return { confianza: 'alta', texto: `${campo.etiqueta}: ${campo.ayuda}\n\nEjemplo: ${campo.placeholder}` };
  }

  // Preguntas sobre un trámite (el actual o cualquiera del catálogo).
  const mencionado = buscarTramitePorTexto(q);
  if (mencionado) return { confianza: 'alta', texto: describirTramite(mencionado) };

  if (tiene(q, ['que tramites', 'que puedes hacer', 'con que me ayudas', 'tramites disponibles', 'hola', 'buenas'])) {
    return {
      confianza: 'alta',
      texto: `Puedo ayudarte con: ${tramites.map((t) => `${t.emoji} ${t.nombre}`).join(', ')}. También con las herramientas de la pantalla principal (Foto a PDF, comprimir PDF, INE, fotos credencial…).`,
    };
  }

  return {
    confianza: 'baja',
    texto: ctx.tramite ? explicarPasoActual(ctx) : respuestaRapida('que-sigue', ctx),
  };
}

/** Resumen compacto del trámite actual para enviarlo como contexto a la IA. */
export function contextoParaIA(ctx: ContextoAsistente) {
  const { tramite, paso, campoActivo } = ctx;
  return {
    currentModule: tramite?.nombre ?? ctx.modo,
    currentStep: paso ?? 'inicio',
    tramite: tramite
      ? {
          slug: tramite.slug,
          nombre: tramite.nombre,
          descripcion: tramite.descripcionCorta,
          pasoActual: paso ? nombresPasos[paso - 1] : undefined,
          campos: tramite.campos.map((campo) => ({ id: campo.id, etiqueta: campo.etiqueta, ayuda: campo.ayuda })),
          campoActivo: campoActivo?.id,
        }
      : undefined,
  };
}
