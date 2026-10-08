export type AIServicio = {
  id: string
  title: string
  emoji: string
  action: string
  description: string
  input: 'images' | 'pdf' | 'images-or-pdf' | 'optional-images' | 'text'
}

export const aiServicios: AIServicio[] = [
  { id: 'foto-a-pdf', title: 'Foto a PDF', emoji: '📄', action: 'create_pdf_from_photos', input: 'images', description: 'Selecciona una o varias fotos y conviértelas en un PDF.' },
  { id: 'escanear-a-pdf', title: 'Escaneo múltiple a PDF', emoji: '📑', action: 'scan_to_pdf', input: 'images', description: 'Selecciona fotos de documentos y únelas en un PDF.' },
  { id: 'comprimir-pdf', title: 'Comprimir PDF', emoji: '🗜️', action: 'compress_pdf', input: 'pdf', description: 'Selecciona un PDF y optimízalo para compartirlo.' },
  { id: 'restaurar-foto', title: 'Restaurar foto', emoji: '🖼️', action: 'restore_photo', input: 'images', description: 'Selecciona una foto y mejora nitidez, contraste y orientación.' },
  { id: 'resumen-visual', title: 'Hoja de resumen visual', emoji: '📚', action: 'create_cheatsheet', input: 'images-or-pdf', description: 'Selecciona un PDF o imágenes y pide a la IA un resumen de estudio.' },
  { id: 'anuncio-cartel', title: 'Anuncio / cartel', emoji: '📢', action: 'create_local_ad', input: 'optional-images', description: 'Crea un anuncio con texto y, si quieres, agrega una foto del producto desde cámara o galería.' },
  { id: 'flashcards', title: 'Flashcards', emoji: '🃏', action: 'create_flashcards', input: 'images-or-pdf', description: 'Selecciona material de estudio y crea tarjetas con IA.' },
  { id: 'escanear-ine', title: 'Escanear INE', emoji: '🪪', action: 'scan_ine', input: 'images', description: 'Toma o selecciona frente y reverso de tu INE y genera un PDF escaneado, recortado y acomodado.' },
  { id: 'fotos-credencial', title: 'Fotos tipo credencial', emoji: '🪪', action: 'create_id_photos', input: 'images', description: 'Selecciona una foto y prepara una hoja tipo credencial.' },
  { id: 'recordatorios', title: 'Recordatorios', emoji: '⏰', action: 'create_reminder', input: 'text', description: 'Describe el recordatorio y la IA te ayuda a organizarlo.' },
  { id: 'llenado-formatos', title: 'Llenado de formatos', emoji: '📝', action: 'fill_form', input: 'images-or-pdf', description: 'Selecciona un formato PDF o foto y la IA te guía campo por campo.' },
  { id: 'investigacion', title: 'Investigación', emoji: '🔎', action: 'research_topic', input: 'images-or-pdf', description: 'Investiga un tema o analiza el material que adjuntes.' },
  { id: 'tramites-gubernamentales', title: 'Trámites gubernamentales', emoji: '🏛️', action: 'open_government_procedure', input: 'text', description: 'Te guía paso a paso y abre el portal oficial dentro de la APK.' },
]