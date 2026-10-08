import { PDFDocument } from 'pdf-lib';
import cvReadyPromise from '@techstark/opencv-js';

export type LocalArtifact = { filename: string; mimeType: string; dataUrl: string; size: number };

function bytesToDataUrl(bytes: Uint8Array, mimeType: string) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = await readAsDataUrl(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo abrir la fotografía.'));
    image.src = url;
  });
}

function orderCorners(points: Array<{ x: number; y: number }>) {
  const sums = points.map((p) => p.x + p.y);
  const diffs = points.map((p) => p.x - p.y);
  return [
    points[sums.indexOf(Math.min(...sums))],
    points[diffs.indexOf(Math.max(...diffs))],
    points[sums.indexOf(Math.max(...sums))],
    points[diffs.indexOf(Math.min(...diffs))],
  ];
}

async function detectAndWarp(file: File): Promise<Blob> {
  const cv = await cvReadyPromise;
  const image = await loadImage(file);
  const maxSide = 1500;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = width;
  inputCanvas.height = height;
  const inputContext = inputCanvas.getContext('2d');
  if (!inputContext) throw new Error('Canvas no disponible.');
  inputContext.drawImage(image, 0, 0, width, height);

  const src = cv.imread(inputCanvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const dilated = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 60, 180);
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, dilated, kernel);
    kernel.delete();

    cv.findContours(dilated, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const imageArea = width * height;
    let best: Array<{ x: number; y: number }> | null = null;
    let bestScore = 0;

    for (let i = 0; i < contours.size(); i += 1) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < imageArea * 0.12) {
        contour.delete();
        continue;
      }
      const perimeter = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, Math.max(2, perimeter * 0.025), true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const points: Array<{ x: number; y: number }> = [];
        for (let p = 0; p < 4; p += 1) {
          points.push({ x: approx.intAt(p, 0), y: approx.intAt(p, 1) });
        }
        const ordered = orderCorners(points);
        const top = Math.hypot(ordered[1].x - ordered[0].x, ordered[1].y - ordered[0].y);
        const bottom = Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y);
        const left = Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y);
        const right = Math.hypot(ordered[2].x - ordered[1].x, ordered[2].y - ordered[1].y);
        const ratio = ((top + bottom) / 2) / Math.max(1, (left + right) / 2);
        const ratioPenalty = Math.abs(ratio - 1.586);
        const score = area / imageArea / (1 + ratioPenalty * 3);
        if (ratio > 1.15 && ratio < 2.05 && score > bestScore) {
          best = ordered;
          bestScore = score;
        }
      }
      approx.delete();
      contour.delete();
    }

    if (!best) {
      const marginX = width * 0.08;
      const marginY = height * 0.08;
      best = [
        { x: marginX, y: marginY },
        { x: width - marginX, y: marginY },
        { x: width - marginX, y: height - marginY },
        { x: marginX, y: height - marginY },
      ];
    }

    const targetWidth = 1200;
    const targetHeight = Math.round(targetWidth / 1.586);
    const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, best.flatMap((p) => [p.x, p.y]));
    const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, targetWidth, 0, targetWidth, targetHeight, 0, targetHeight]);
    const matrix = cv.getPerspectiveTransform(srcPoints, dstPoints);
    const warped = new cv.Mat();
    cv.warpPerspective(src, warped, matrix, new cv.Size(targetWidth, targetHeight), cv.INTER_LANCZOS4, cv.BORDER_REPLICATE);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = targetWidth;
    outputCanvas.height = targetHeight;
    cv.imshow(outputCanvas, warped);

    srcPoints.delete();
    dstPoints.delete();
    matrix.delete();
    warped.delete();

    return new Promise((resolve, reject) => {
      outputCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo generar el escaneo.')), 'image/jpeg', 0.94);
    });
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    dilated.delete();
    contours.delete();
    hierarchy.delete();
  }
}

export async function scanIneToPdf(front: File, back: File): Promise<LocalArtifact> {
  if (!front || !back) throw new Error('Necesitas una foto del frente y otra del reverso de la INE.');
  if (!front.type.startsWith('image/') || !back.type.startsWith('image/')) throw new Error('Las dos caras de la INE deben ser fotografías.');
  const [frontBlob, backBlob] = await Promise.all([detectAndWarp(front), detectAndWarp(back)]);
  const pdf = await PDFDocument.create();
  for (const [label, blob] of [['frente', frontBlob], ['reverso', backBlob]] as const) {
    const image = await pdf.embedJpg(new Uint8Array(await blob.arrayBuffer()));
    const page = pdf.addPage([595.28, 841.89]);
    const margin = 38;
    const maxW = page.getWidth() - margin * 2;
    const maxH = page.getHeight() - margin * 2;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    page.drawImage(image, { x: (page.getWidth() - w) / 2, y: (page.getHeight() - h) / 2, width: w, height: h });
    page.drawText(label.toUpperCase(), { x: margin, y: 18, size: 8 });
  }
  const bytes = await pdf.save({ useObjectStreams: true, addDefaultPage: false });
  return { filename: 'INE-escaneada-frente-reverso.pdf', mimeType: 'application/pdf', dataUrl: bytesToDataUrl(bytes, 'application/pdf'), size: bytes.byteLength };
}
