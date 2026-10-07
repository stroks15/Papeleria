export type AIServicio = {
  id: string
  title: string
  emoji: string
  action: string
  description: string
  input: 'images' | 'pdf' | 'images-or-pdf' | 'text'
}

export const aiServicios: AIServicio[] = [
  { id: 'foto-a-pdf', title: 'Foto a PDF', emoji: '📄', action: 'create_pdf_from_photos', input: 'images', description: 'Selecciona una o varias fotos y conviértelas en un PDF.' },
  { id: 'escanear-a-pdf', title: 'Escaneo múltiple a PDF', emoji: '📑', action: 'scan_to_pdf', input: 'images', description: 'Selecciona fotos de documentos y únelas en un PDF.' },
  { id: 'comprimir-pdf', title: 'Comprimir PDF', emoji: '🗜️', action: 'compress_pdf', input: 'pdf', description: 'Selecciona un PDF y optimízalo para compartirlo.' },
  { id: 'restaurar-foto', title: 'Restaurar foto', emoji: '🖼️', action: 'restore_photo', input: 'images', description: 'Selecciona una foto y mejora nitidez, contraste y orientación.' },
  { id: 'resumen-visual', title: 'Hoja de resumen visual', emoji: '📚', action: 'create_cheatsheet', input: 'images-or-pdf', description: 'Selecciona un PDF o imágenes y pide a la IA un resumen de estudio.' },
  { id: 'anuncio-cartel', title: 'Anuncio / cartel', emoji: '📢', action: 'create_local_ad', input: 'images-or-pdf', description: 'Usa texto e imágenes para preparar el contenido de un anuncio.' },
  { id: 'flashcards', title: 'Flashcards', emoji: '🃏', action: 'create_flashcards', input: 'images-or-pdf', description: 'Selecciona material de estudio y crea tarjetas con IA.' },
  { id: 'pedido-impresion', title: 'Pedido de impresión', emoji: '🖨️', action: 'create_print_order', input: 'images-or-pdf', description: 'Adjunta tus archivos y prepara tu pedido de impresión.' },
  { id: 'fotos-credencial', title: 'Fotos tipo credencial', emoji: '🪪', action: 'create_id_photos', input: 'images', description: 'Selecciona una foto y prepara una hoja tipo credencial.' },
  { id: 'recordatorios', title: 'Recordatorios', emoji: '⏰', action: 'create_reminder', input: 'text', description: 'Describe el recordatorio y la IA te ayuda a organizarlo.' },
  { id: 'llenado-formatos', title: 'Llenado de formatos', emoji: '📝', action: 'fill_form', input: 'images-or-pdf', description: 'Selecciona un formato PDF o foto y la IA te guía campo por campo.' },
  { id: 'investigacion', title: 'Investigación', emoji: '🔎', action: 'research_topic', input: 'images-or-pdf', description: 'Investiga un tema o analiza el material que adjuntes.' },
  { id: 'tramites-gubernamentales', title: 'Trámites gubernamentales', emoji: '🏛️', action: 'open_government_procedure', input: 'text', description: 'Te guía paso a paso y abre el portal oficial dentro de la APK.' },
]