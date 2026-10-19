// Respuestas "sin IA" que SÍ traen contenido: cuando Gemini/Groq/Grok fallan, en vez de
// devolver plantillas vacías se arma el material con (1) el texto que pegó la persona o
// (2) el resumen de Wikipedia en español. Nada se inventa: todo sale de lo recuperado.

type Wiki = { title: string; text: string; url: string };
type Seccion = { titulo: string; texto: string };

const UA = 'PapeleriaArcoiris/1.0 (herramientas educativas)';
const SECCIONES_IGNORADAS = /^(v[eé]ase tambi[eé]n|referencias|enlaces externos|bibliograf[ií]a|notas|fuentes|galer[ií]a|notas y referencias)$/i;

async function fetchJson(url: string, ms: number): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function buscarWikipedia(tema: string, ms: number): Promise<Wiki | null> {
  const q = tema.replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!q || ms < 1500) return null;
  const url =
    'https://es.wikipedia.org/w/api.php?action=query&format=json&redirects=1&generator=search&gsrlimit=1&gsrsearch=' +
    encodeURIComponent(q) +
    '&prop=extracts&explaintext=1&exlimit=1';
  const data = await fetchJson(url, ms);
  const pages = data && data.query && data.query.pages;
  if (!pages) return null;
  const key = Object.keys(pages)[0];
  const page = pages[key] as { title?: string; extract?: string } | undefined;
  const text = ((page && page.extract) || '').trim();
  if (!page || !page.title || text.length < 200 || /puede referirse a/i.test(text.slice(0, 300))) return null;
  return {
    title: page.title,
    text: text.slice(0, 9000),
    url: 'https://es.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')),
  };
}

function limpiar(s: string): string {
  return s.replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim();
}

function oraciones(texto: string): string[] {
  return limpiar(texto)
    .replace(/([.!?])\s+/g, '$1\u0001')
    .split('\u0001')
    .map((s) => s.trim())
    .filter((s) => s.length > 25 && s.length < 340);
}

function dividir(text: string): { intro: string; secciones: Seccion[] } {
  const partes = text.split(/^=+\s*(.+?)\s*=+\s*$/m);
  const secciones: Seccion[] = [];
  for (let i = 1; i + 1 < partes.length; i += 2) {
    const titulo = limpiar(partes[i]);
    const cuerpo = partes[i + 1] || '';
    if (SECCIONES_IGNORADAS.test(titulo) || oraciones(cuerpo).length === 0) continue;
    secciones.push({ titulo, texto: cuerpo });
  }
  return { intro: partes[0] || '', secciones };
}

type Material = { tema: string; intro: string; secciones: Seccion[]; fuente: string };

async function reunirMaterial(mensaje: string, presupuestoMs: number): Promise<Material | null> {
  const texto = mensaje.trim();
  // Texto largo = la persona pegó su propio material: se usa tal cual.
  if (texto.length > 400) {
    const primera = texto.split('\n')[0].trim().slice(0, 60);
    const resto = dividir(texto);
    return { tema: primera || 'tu material', intro: resto.intro || texto, secciones: resto.secciones, fuente: 'Material proporcionado por el usuario.' };
  }
  const wiki = await buscarWikipedia(texto, Math.min(7000, presupuestoMs));
  if (!wiki) return null;
  const d = dividir(wiki.text);
  return { tema: wiki.title, intro: d.intro, secciones: d.secciones, fuente: 'Wikipedia (es): ' + wiki.url + ' — contrástala con una fuente oficial.' };
}

const SIN_MATERIAL =
  'No pude consultar información en este momento. Escribe el tema con más detalle o pega aquí tus apuntes (más de 400 caracteres) y armaré la hoja con tu propio material.';

function cheatsheet(m: Material): string {
  const intro = oraciones(m.intro);
  const concepto = intro.slice(0, 2).join(' ') || (m.secciones[0] ? oraciones(m.secciones[0].texto)[0] : '');
  let ideas = intro.slice(2, 5);
  if (ideas.length < 3) {
    for (const s of m.secciones) {
      const o = oraciones(s.texto)[0];
      if (o) ideas.push(s.titulo + ': ' + o);
      if (ideas.length >= 3) break;
    }
  }
  ideas = ideas.slice(0, 3);
  const todas = oraciones(m.intro + ' ' + m.secciones.map((s) => s.texto).join(' '));
  const ejemplo = todas.find((s) => /por ejemplo|como el|como la|se celebra|se utiliza|se usa/i.test(s)) || todas.find((s) => /\d{3,4}/.test(s)) || todas[todas.length - 1] || '';
  const conceptos = m.secciones.slice(0, 5).map((s) => '• ' + s.titulo + ': ' + (oraciones(s.texto)[0] || ''));
  return [
    'HOJA DE RESUMEN · ' + m.tema,
    '',
    'CONCEPTO PRINCIPAL',
    concepto,
    '',
    '3 IDEAS CLAVE',
    ...ideas.map((i) => '• ' + i),
    '',
    'EJEMPLO / DATO RELEVANTE',
    ejemplo,
    ...(conceptos.length ? ['', 'CONCEPTOS PARA RECORDAR', ...conceptos] : []),
    '',
    'REPASO',
    '• ¿Qué es ' + m.tema + '?',
    '• ¿Cuáles son sus ideas clave?',
    '• ¿Qué ejemplo puedes dar sin mirar tus apuntes?',
    '',
    'FUENTE',
    m.fuente,
  ].join('\n');
}

function flashcards(m: Material): string {
  const intro = oraciones(m.intro);
  const cartas: Array<[string, string]> = [];
  cartas.push(['¿Qué es ' + m.tema + '?', intro.slice(0, 2).join(' ') || '']);
  for (const s of m.secciones) {
    const r = oraciones(s.texto).slice(0, 2).join(' ');
    if (r) cartas.push(['¿Qué se debe saber sobre «' + s.titulo + '» en ' + m.tema + '?', r]);
    if (cartas.length >= 10) break;
  }
  for (let i = 2; i < intro.length && cartas.length < 10; i++) {
    cartas.push(['Completa la idea sobre ' + m.tema + ' (dato ' + (i - 1) + ')', intro[i]]);
  }
  return [
    'FLASHCARDS · ' + m.tema,
    '',
    ...cartas.filter((c) => c[1]).map((c, i) => 'Tarjeta ' + (i + 1) + '\nPregunta: ' + c[0] + '\nRespuesta: ' + c[1] + '\n'),
    'FUENTE',
    m.fuente,
  ].join('\n');
}

function investigacion(m: Material): string {
  const intro = oraciones(m.intro);
  const desarrollo = m.secciones.slice(0, 6).map((s) => s.titulo.toUpperCase() + '\n' + oraciones(s.texto).slice(0, 2).join(' '));
  return [
    'Investigación sobre: ' + m.tema,
    '',
    '1. Introducción',
    intro.slice(0, 3).join(' '),
    '',
    '2. Conceptos clave',
    ...(m.secciones.slice(0, 5).map((s) => '• ' + s.titulo) || []),
    '',
    '3. Desarrollo',
    ...(desarrollo.length ? desarrollo.map((d) => d + '\n') : [intro.slice(3, 7).join(' ')]),
    '4. Conclusión',
    'Resumen de lo encontrado: ' + (intro[0] || m.tema) + ' Revisa cada apartado y contrástalo con otras fuentes antes de entregarlo.',
    '',
    '5. Fuentes consultadas',
    m.fuente,
  ].join('\n');
}

/** Devuelve el texto de la herramienta sin IA, o null si esa acción no tiene versión local. */
export async function respuestaSinIA(action: string, mensaje: string, presupuestoMs: number): Promise<string | null> {
  const builders: Record<string, (m: Material) => string> = {
    create_cheatsheet: cheatsheet,
    create_flashcards: flashcards,
    research_topic: investigacion,
  };
  const build = builders[action];
  if (!build) return null;
  const material = await reunirMaterial(mensaje, presupuestoMs);
  if (!material) return SIN_MATERIAL;
  return build(material);
}
