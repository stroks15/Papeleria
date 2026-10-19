export type ServerArtifact = {
  filename: string;
  mimeType: string;
  dataBase64: string;
  size: number;
};

export type AdCopy = { titulo: string; lineas: string[]; cta: string };

function b64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[char] || char));
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Convierte el texto de la persona (o la respuesta de la IA) en un anuncio:
 * primera idea = título, el resto = viñetas. No depende de ningún servicio externo.
 */
export function anuncioDesdeTexto(texto: string): AdCopy {
  const limpio = texto
    .replace(/\r/g, '')
    .replace(/[*#_`>]+/g, '')
    .replace(/^\s*(t[ií]tulo|oferta|descripci[oó]n|llamada a la acci[oó]n|cta)\s*:\s*/gim, '');
  let partes = limpio
    .split('\n')
    .map((l) => l.replace(/^[\s\-•\d.)]+/, '').trim())
    .filter(Boolean);
  if (partes.length < 2) {
    partes = limpio
      .split(/[.;,]\s+|\s+y\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  let titulo = cap(partes[0] || 'Papelería Arcoíris');
  const lineas = partes.slice(1, 7).map((l) => cap(l).slice(0, 90));
  if (titulo.length > 48) {
    const palabras = titulo.split(' ');
    const resto = palabras.slice(6).join(' ');
    titulo = palabras.slice(0, 6).join(' ');
    if (resto) lineas.unshift(cap(resto).slice(0, 90));
  }
  return { titulo, lineas: lineas.slice(0, 6), cta: '¡Visítanos en Papelería Arcoíris!' };
}

function envolver(texto: string, max: number): string[] {
  const salida: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/)) {
    if ((actual + ' ' + palabra).trim().length > max && actual) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = (actual + ' ' + palabra).trim();
    }
  }
  if (actual) salida.push(actual);
  return salida;
}

const FUENTE = "Arial, 'DejaVu Sans', sans-serif";

export function createAdSvg(copy: AdCopy, imageDataUrl?: string): ServerArtifact {
  const validImage = !!imageDataUrl && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageDataUrl);
  const partes: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">',
    '<rect width="1080" height="1350" fill="#fff9ed"/>',
    '<rect x="40" y="40" width="1000" height="1270" rx="48" fill="#ffffff" stroke="#6c63ff" stroke-width="10"/>',
    '<rect x="50" y="50" width="980" height="150" rx="40" fill="#6c63ff"/>',
    '<text x="540" y="148" text-anchor="middle" font-family="' + FUENTE + '" font-size="62" font-weight="700" fill="#ffffff">PAPELERÍA ARCOÍRIS</text>',
  ];
  ['#e63946', '#f4a261', '#f1c40f', '#2a9d8f', '#3d74a6', '#7a5ca8'].forEach((color, i) => {
    partes.push('<rect x="' + (120 + i * 140) + '" y="215" width="130" height="14" rx="7" fill="' + color + '"/>');
  });

  let y = 330;
  for (const linea of envolver(copy.titulo.toUpperCase(), 20).slice(0, 3)) {
    partes.push('<text x="540" y="' + y + '" text-anchor="middle" font-family="' + FUENTE + '" font-size="76" font-weight="700" fill="#252525">' + escapeXml(linea) + '</text>');
    y += 92;
  }
  y += 10;

  if (validImage) {
    partes.push('<image href="' + imageDataUrl + '" x="140" y="' + y + '" width="800" height="330" preserveAspectRatio="xMidYMid slice"/>');
    y += 400;
  }

  for (const texto of copy.lineas) {
    const trozos = envolver(texto, 30).slice(0, 2);
    for (let i = 0; i < trozos.length; i++) {
      const linea = trozos[i];
      if (y > 1090) break;
      partes.push('<text x="' + (i === 0 ? 150 : 190) + '" y="' + y + '" font-family="' + FUENTE + '" font-size="44" fill="#252525">' + (i === 0 ? '• ' : '') + escapeXml(linea) + '</text>');
      y += 58;
    }
    y += 14;
  }

  partes.push(
    '<rect x="140" y="1150" width="800" height="110" rx="55" fill="#2a9d8f"/>',
    '<text x="540" y="1220" text-anchor="middle" font-family="' + FUENTE + '" font-size="46" font-weight="700" fill="#ffffff">' + escapeXml(copy.cta) + '</text>',
    '</svg>',
  );
  const svg = partes.join('');

  return {
    filename: 'anuncio-arcoiris.svg',
    mimeType: 'image/svg+xml',
    dataBase64: b64(svg),
    size: Buffer.byteLength(svg),
  };
}

export function createPrintOrderArtifact(
  message: string,
  files: Array<{ name: string; size: number; mimeType: string }>,
): ServerArtifact {
  const json = JSON.stringify({
    brand: 'Papelería Arcoíris',
    createdAt: new Date().toISOString(),
    status: 'pendiente_de_confirmacion',
    request: message,
    files,
    printOptions: {
      quantity: null,
      size: null,
      color: null,
      finishing: null,
    },
  }, null, 2);

  return {
    filename: 'pedido-impresion.json',
    mimeType: 'application/json',
    dataBase64: b64(json),
    size: Buffer.byteLength(json),
  };
}
