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
  { id: 'resumen-visual', title: 'Hoja de resumen visual', emoji: '📚', action: 'create_cheatsheet', input: 'text', description: 'Escribe el tema y, si quieres material, adjúntalo desde ArcoirisAI.' },
  { id: 'anuncio-cartel', title: 'Anuncio / cartel', emoji: '📢', action: 'create_local_ad', input: 'optional-images', description: 'Crea un anuncio con texto y, si quieres, agrega una foto del producto desde cámara o galería.' },
  { id: 'flashcards', title: 'Flashcards', emoji: '🃏', action: 'create_flashcards', input: 'text', description: 'Escribe el tema y crea tarjetas con IA; el material adjunto es opcional.' },
  { id: 'escanear-ine', title: 'Escanear INE', emoji: '🪪', action: 'scan_ine', input: 'images', description: 'Toma o selecciona frente y reverso de tu INE y genera un PDF escaneado, recortado y acomodado.' },
  { id: 'fotos-credencial', title: 'Fotos tipo credencial', emoji: '🪪', action: 'create_id_photos', input: 'images', description: 'Selecciona una foto y prepara una hoja tipo credencial.' },
  { id: 'recordatorios', title: 'Recordatorios', emoji: '⏰', action: 'create_reminder', input: 'text', description: 'Describe el recordatorio y la IA te ayuda a organizarlo.' },
  { id: 'llenado-formatos', title: 'Llenado de formatos', emoji: '📝', action: 'fill_form', input: 'text', description: 'Pide ayuda para llenar un formato; puedes describirlo o adjuntarlo opcionalmente desde ArcoirisAI.' },
  { id: 'investigacion', title: 'Investigación', emoji: '🔎', action: 'research_topic', input: 'text', description: 'Investiga un tema sin obligarte a subir archivos; el material adjunto es opcional.' },
]