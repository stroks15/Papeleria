export type AIServicio = {
  id: string
  title: string
  emoji: string
  action: string
  description: string
}

export const aiServicios: AIServicio[] = [
  { id: 'foto-a-pdf', title: 'Foto a PDF', emoji: '📄', action: 'create_pdf_from_photos', description: 'Convierte tus fotos en un documento PDF.' },
  { id: 'escanear-a-pdf', title: 'Escaneo múltiple a PDF', emoji: '📑', action: 'scan_to_pdf', description: 'Une varios documentos escaneados en un PDF.' },
  { id: 'comprimir-pdf', title: 'Comprimir PDF', emoji: '🗜️', action: 'compress_pdf', description: 'Reduce el tamaño de un PDF para compartirlo.' },
  { id: 'restaurar-foto', title: 'Restaurar foto', emoji: '🖼️', action: 'restore_photo', description: 'Mejora y restaura una fotografía.' },
  { id: 'resumen-visual', title: 'Hoja de resumen visual', emoji: '📚', action: 'create_cheatsheet', description: 'Crea un resumen claro y fácil de estudiar.' },
  { id: 'anuncio-cartel', title: 'Anuncio / cartel', emoji: '📢', action: 'create_local_ad', description: 'Crea un anuncio o cartel para tu negocio o evento.' },
  { id: 'flashcards', title: 'Flashcards', emoji: '🃏', action: 'create_flashcards', description: 'Crea tarjetas de estudio a partir de un tema.' },
  { id: 'pedido-impresion', title: 'Pedido de impresión', emoji: '🖨️', action: 'create_print_order', description: 'Prepara un pedido para imprimir en la papelería.' },
  { id: 'fotos-credencial', title: 'Fotos tipo credencial', emoji: '🪪', action: 'create_id_photos', description: 'Prepara fotos con formato tipo credencial.' },
  { id: 'recordatorios', title: 'Recordatorios', emoji: '⏰', action: 'create_reminder', description: 'Crea un recordatorio para no olvidar una tarea.' },
  { id: 'llenado-formatos', title: 'Llenado de formatos', emoji: '📝', action: 'fill_form', description: 'Te ayuda a completar un formato paso a paso.' },
  { id: 'investigacion', title: 'Investigación', emoji: '🔎', action: 'research_topic', description: 'Organiza una investigación sobre el tema que necesites.' },
  { id: 'tramites-gubernamentales', title: 'Trámites gubernamentales', emoji: '🏛️', action: 'open_government_procedure', description: 'Encuentra y realiza un trámite gubernamental paso a paso.' },
]
