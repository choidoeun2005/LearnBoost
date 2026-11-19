import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repairPdfText } from '../src/pdf-text.js';

export const maxDocumentMb = 50;
export const pdfAssetFolders = ['cmaps', 'standard_fonts', 'wasm', 'iccs'];
export const pdfAssetRoot = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));

export function uploadFilename(originalName) {
  let name = originalName;
  if (/^[\u0000-\u00ff]*[\u0080-\u00ff][\u0000-\u00ff]*$/u.test(name)) {
    try {
      // Multipart filenames arrive from Busboy with the legacy Latin-1 interpretation.
      name = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1'));
    } catch {
      // Retain filenames supplied in Latin-1.
    }
  }
  return path.posix.basename(name.replaceAll('\\', '/')).normalize('NFC');
}

async function openPdf(bytes) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  return getDocument({
    data: new Uint8Array(bytes),
    cMapUrl: path.join(pdfAssetRoot, 'cmaps') + '/',
    standardFontDataUrl: path.join(pdfAssetRoot, 'standard_fonts') + '/',
    wasmUrl: path.join(pdfAssetRoot, 'wasm') + '/',
    iccUrl: path.join(pdfAssetRoot, 'iccs') + '/',
    useSystemFonts: true,
    isEvalSupported: false,
  });
}

export async function extractPdfPages(bytes) {
  const task = await openPdf(bytes);
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      const content = repairPdfText(await page.getTextContent(), pdf.fingerprints[0]);
      const text = content.items.map(item => (item.str || '') + (item.hasEOL ? '\n' : '')).join('').normalize('NFC');
      pages.push({ page: number, text });
      page.cleanup();
    }
    return pages;
  } finally {
    await task.destroy();
  }
}

export async function renderPdfRegion(bytes, pageNumber, region, signal) {
  const task = await openPdf(bytes);
  let factory;
  let surface;
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width * region.width;
    const height = viewport.height * region.height;
    const scale = Math.min(3, 1024 / Math.max(width, height));
    factory = pdf.canvasFactory;
    surface = factory.create(Math.ceil(width * scale), Math.ceil(height * scale));
    const render = page.render({
      canvas: surface.canvas,
      viewport,
      transform: [scale, 0, 0, scale, -viewport.width * region.x * scale, -viewport.height * region.y * scale],
      background: '#ffffff',
    });
    const cancel = () => render.cancel();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      await render.promise;
      return surface.canvas.toDataURL('image/jpeg', 0.85);
    } finally {
      signal?.removeEventListener('abort', cancel);
    }
  } finally {
    if (surface) factory.destroy(surface);
    await task.destroy();
  }
}
