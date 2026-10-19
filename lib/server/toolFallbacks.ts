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

// Ilustraciones de papelería (formas SVG simples) para decorar el anuncio.
function libros(x: number, y: number): string {
  return (
    '<rect x="' + x + '" y="' + (y + 70) + '" width="130" height="30" rx="4" fill="#e63946"/>' +
    '<rect x="' + (x + 10) + '" y="' + (y + 40) + '" width="110" height="30" rx="4" fill="#2a9d8f"/>' +
    '<rect x="' + (x + 18) + '" y="' + (y + 10) + '" width="96" height="30" rx="4" fill="#f4a261"/>' +
    '<rect x="' + (x + 14) + '" y="' + (y + 80) + '" width="100" height="6" rx="3" fill="#ffffff"/>' +
    '<rect x="' + (x + 24) + '" y="' + (y + 50) + '" width="80" height="6" rx="3" fill="#ffffff"/>' +
    '<rect x="' + (x + 32) + '" y="' + (y + 20) + '" width="64" height="6" rx="3" fill="#ffffff"/>'
  );
}

function lapiz(x: number, y: number, color: string, giro: number): string {
  return (
    '<g transform="rotate(' + giro + ' ' + (x + 20) + ' ' + (y + 65) + ')">' +
    '<rect x="' + x + '" y="' + (y + 12) + '" width="40" height="100" fill="' + color + '"/>' +
    '<rect x="' + (x + 13) + '" y="' + (y + 12) + '" width="6" height="100" fill="#ffffff" opacity="0.45"/>' +
    '<rect x="' + x + '" y="' + y + '" width="40" height="16" rx="5" fill="#e63946"/>' +
    '<rect x="' + x + '" y="' + (y + 20) + '" width="40" height="8" fill="#b8b8b8"/>' +
    '<polygon points="' + x + ',' + (y + 112) + ' ' + (x + 40) + ',' + (y + 112) + ' ' + (x + 20) + ',' + (y + 150) + '" fill="#f5d7a1"/>' +
    '<polygon points="' + (x + 13) + ',' + (y + 134) + ' ' + (x + 27) + ',' + (y + 134) + ' ' + (x + 20) + ',' + (y + 150) + '" fill="#252525"/>' +
    '</g>'
  );
}

function regla(x: number, y: number): string {
  let marcas = '';
  for (let i = 0; i < 11; i++) {
    marcas += '<rect x="' + (x + 10 + i * 11) + '" y="' + (y + 40) + '" width="2" height="' + (i % 5 === 0 ? 18 : 10) + '" fill="#252525"/>';
  }
  return '<rect x="' + x + '" y="' + (y + 40) + '" width="130" height="46" rx="6" fill="#f1c40f"/>' + marcas;
}

function cuaderno(x: number, y: number, color: string): string {
  let espiral = '';
  for (let i = 0; i < 5; i++) {
    espiral += '<circle cx="' + (x + 6) + '" cy="' + (y + 18 + i * 22) + '" r="7" fill="#ffffff" stroke="#252525" stroke-width="3"/>';
  }
  return (
    '<rect x="' + x + '" y="' + y + '" width="96" height="125" rx="10" fill="' + color + '"/>' +
    '<rect x="' + (x + 28) + '" y="' + (y + 30) + '" width="54" height="34" rx="5" fill="#ffffff"/>' +
    '<rect x="' + (x + 34) + '" y="' + (y + 42) + '" width="42" height="5" rx="2" fill="' + color + '"/>' +
    espiral
  );
}

export function createAdSvg(copy: AdCopy, imageDataUrl?: string): ServerArtifact {
  const validImage = !!imageDataUrl && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageDataUrl);
  const partes: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">',
    // Hoja de cuaderno: renglones azules y margen rojo.
    '<rect width="1080" height="1350" fill="#fffdf6"/>',
  ];
  for (let ry = 470; ry < 1100; ry += 58) {
    partes.push('<rect x="0" y="' + ry + '" width="1080" height="3" fill="#bfd9f2"/>');
  }
  partes.push(
    '<rect x="96" y="0" width="4" height="1350" fill="#f3a6a6"/>',
    '<rect x="14" y="14" width="1052" height="1322" rx="40" fill="none" stroke="#6c63ff" stroke-width="10"/>',
  );
  // Arcoíris en la parte superior.
  ['#e63946', '#f4a261', '#f1c40f', '#2a9d8f', '#3d74a6', '#7a5ca8'].forEach((color, i) => {
    const r = 340 - i * 26;
    partes.push('<path d="M ' + (540 - r) + ' 340 A ' + r + ' ' + r + ' 0 0 1 ' + (540 + r) + ' 340" fill="none" stroke="' + color + '" stroke-width="26"/>');
  });
  partes.push(
    '<rect x="150" y="372" width="780" height="92" rx="46" fill="#6c63ff"/>',
    '<text x="540" y="436" text-anchor="middle" font-family="' + FUENTE + '" font-size="54" font-weight="700" fill="#ffffff">PAPELERÍA ARCOÍRIS</text>',
  );

  let y = 570;
  for (const linea of envolver(copy.titulo.toUpperCase(), 20).slice(0, 3)) {
    partes.push('<text x="540" y="' + y + '" text-anchor="middle" font-family="' + FUENTE + '" font-size="74" font-weight="700" fill="#252525">' + escapeXml(linea) + '</text>');
    y += 88;
  }
  y += 6;

  if (validImage) {
    partes.push('<image href="' + imageDataUrl + '" x="190" y="' + y + '" width="700" height="250" preserveAspectRatio="xMidYMid slice"/>');
    y += 300;
  }

  for (const texto of copy.lineas) {
    const trozos = envolver(texto, 30).slice(0, 2);
    for (let i = 0; i < trozos.length; i++) {
      const linea = trozos[i];
      if (y > 1040) break;
      partes.push('<text x="' + (i === 0 ? 150 : 190) + '" y="' + y + '" font-family="' + FUENTE + '" font-size="42" fill="#252525">' + (i === 0 ? '• ' : '') + escapeXml(linea) + '</text>');
      y += 54;
    }
    y += 8;
  }

  partes.push(
    '<rect x="140" y="1070" width="800" height="100" rx="50" fill="#2a9d8f"/>',
    '<text x="540" y="1135" text-anchor="middle" font-family="' + FUENTE + '" font-size="42" font-weight="700" fill="#ffffff">' + escapeXml(copy.cta) + '</text>',
    // Fila de papelería al pie.
    libros(120, 1190),
    lapiz(290, 1180, '#3d74a6', -25),
    regla(440, 1180),
    lapiz(620, 1180, '#2a9d8f', 20),
    cuaderno(800, 1180, '#7a5ca8'),
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
