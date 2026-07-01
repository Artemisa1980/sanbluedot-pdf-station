import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";

// Worker empaquetado por Vite — sin CDN, funciona offline
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * SOLO PREVISUALIZACIÓN. Estas miniaturas jamás tocan la ruta de exportación:
 * el PDF final se arma copiando los vectores originales con pdf-lib (Principio 1).
 */
const docs = new Map<string, Promise<PDFDocumentProxy>>();
const thumbs = new Map<string, Promise<string>>();

function docFor(srcId: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  let d = docs.get(srcId);
  if (!d) {
    // pdfjs transfiere (y deja inutilizable) el buffer que recibe → siempre darle una copia
    d = pdfjsLib.getDocument({ data: bytes.slice() }).promise;
    docs.set(srcId, d);
  }
  return d;
}

export async function getPageCount(srcId: string, bytes: Uint8Array): Promise<number> {
  return (await docFor(srcId, bytes)).numPages;
}

export function renderPageDataUrl(
  srcId: string,
  bytes: Uint8Array,
  pageIndex: number,
  targetWidth = 180
): Promise<string> {
  const key = `${srcId}:${pageIndex}:${targetWidth}`;
  let t = thumbs.get(key);
  if (!t) {
    t = (async () => {
      const doc = await docFor(srcId, bytes);
      const page = await doc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = (targetWidth * (window.devicePixelRatio || 1)) / base.width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear el canvas de miniatura");
      await page.render({ canvasContext: ctx, viewport }).promise;
      return canvas.toDataURL("image/png");
    })();
    thumbs.set(key, t);
  }
  return t;
}

/** Llamar al eliminar una fuente o recompilar un doc — libera memoria y invalida miniaturas. */
export function evictSource(srcId: string): void {
  const d = docs.get(srcId);
  docs.delete(srcId);
  if (d) d.then((doc) => doc.destroy()).catch(() => {});
  for (const key of [...thumbs.keys()]) {
    if (key.startsWith(`${srcId}:`)) thumbs.delete(key);
  }
}
