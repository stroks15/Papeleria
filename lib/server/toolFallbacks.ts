export type ServerArtifact = {
  filename: string;
  mimeType: string;
  dataBase64: string;
  size: number;
};

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

export function createAdSvg(message: string, imageDataUrl?: string): ServerArtifact {
  const safe = escapeXml(message);
  const validImage = imageDataUrl && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageDataUrl);
  const image = validImage
    ? '<image href="' + imageDataUrl + '" x="140" y="500" width="800" height="360" preserveAspectRatio="xMidYMid slice"/>'
    : '';
  const textY = image ? 930 : 540;

  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">',
    '<rect width="1080" height="1350" fill="#fff9ed"/>',
    '<rect x="50" y="50" width="980" height="1250" rx="48" fill="#fff" stroke="#6c63ff" stroke-width="10"/>',
    '<text x="540" y="250" text-anchor="middle" font-family="Arial" font-size="64" font-weight="700" fill="#252525">PAPELERÍA ARCOÍRIS</text>',
    '<text x="540" y="430" text-anchor="middle" font-family="Arial" font-size="48" fill="#252525">ANUNCIO</text>',
    image,
    '<foreignObject x="120" y="' + textY + '" width="840" height="220">',
    '<div xmlns="http://www.w3.org/1999/xhtml" style="font:36px Arial;color:#252525;line-height:1.35;text-align:center;white-space:pre-wrap">',
    safe,
    '</div></foreignObject>',
    '<text x="540" y="1190" text-anchor="middle" font-family="Arial" font-size="34" fill="#555">Fácil · claro · cerca de ti</text>',
    '</svg>',
  ].join('');

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
