import * as pdfjsLib from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { bytesSignature } from "./bytesCache";

// Worker empaquetado por Vite — sin CDN, funciona offline
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * SOLO PREVISUALIZACIÓN. Estas miniaturas jamás tocan la ruta de exportación:
 * el PDF final se arma copiando los vectores originales con pdf-lib (Principio 1).
 *
 * Las cachés se identifican por srcId Y por contenido (firma de los bytes): una fuente
 * recompilada nunca sirve miniaturas ni documentos del PDF anterior.
 */
interface DocEntry {
  sig: string;
  promise: Promise<PDFDocumentProxy>;
  /** Operaciones en curso sobre este doc: un doc en uso no se descarta por el tope */
  active: number;
}
const docs = new Map<string, DocEntry>();
const MAX_DOCS = 16;

interface ThumbEntry {
  promise: Promise<string>;
  /** Largo del data URL (ASCII → 1 byte por carácter); 0 mientras se renderiza */
  size: number;
}
const thumbs = new Map<string, ThumbEntry>();
let thumbBytes = 0;
/** Tope de memoria de las miniaturas ya listas (suma del largo de sus data URL). */
const MAX_THUMBNAIL_BYTES = 48 * 1024 * 1024;

function thumbKey(srcId: string, sig: string, pageIndex: number, targetWidth: number, transparent: boolean): string {
  return `${srcId}|${sig}|${pageIndex}|${targetWidth}|${transparent ? "t" : "o"}`;
}

function deleteThumb(key: string): void {
  const e = thumbs.get(key);
  if (!e) return;
  thumbs.delete(key);
  thumbBytes -= e.size;
}

/** Expulsa las menos usadas hasta caber en el tope; la recién terminada (`keep`) se conserva. */
function trimThumbs(keep: string): void {
  for (const k of [...thumbs.keys()]) {
    if (thumbBytes <= MAX_THUMBNAIL_BYTES) break;
    if (k !== keep) deleteThumb(k);
  }
}

function rememberThumbnail(key: string, promise: Promise<string>): void {
  const entry: ThumbEntry = { promise, size: 0 };
  thumbs.set(key, entry);
  promise.then(
    (url) => {
      if (thumbs.get(key) !== entry) return; // ya expulsada o invalidada
      entry.size = url.length;
      thumbBytes += entry.size;
      trimThumbs(key);
    },
    () => {
      // Un fallo transitorio no debe envenenar para siempre la misma miniatura.
      if (thumbs.get(key) === entry) deleteThumb(key);
    }
  );
}

/** Quita las miniaturas de una fuente; con `exceptSig`, solo las de contenido anterior. */
function purgeThumbs(srcId: string, exceptSig?: string): void {
  const prefix = `${srcId}|`;
  const keep = exceptSig === undefined ? null : `${srcId}|${exceptSig}|`;
  for (const key of [...thumbs.keys()]) {
    if (key.startsWith(prefix) && !(keep && key.startsWith(keep))) deleteThumb(key);
  }
}

function destroyDoc(e: DocEntry): void {
  e.promise.then((doc) => doc.destroy()).catch(() => {});
}

/** Descarta los docs menos usados por encima del tope, salvo los que tienen trabajo en curso. */
function trimDocs(keep?: DocEntry): void {
  for (const [srcId, e] of [...docs]) {
    if (docs.size <= MAX_DOCS) break;
    if (e === keep || e.active > 0) continue;
    docs.delete(srcId);
    destroyDoc(e);
  }
}

function docFor(srcId: string, bytes: Uint8Array): DocEntry {
  const sig = bytesSignature(bytes);
  let e = docs.get(srcId);
  if (e && e.sig !== sig) {
    // Mismo srcId, otro contenido (recompilación): el doc y las miniaturas viejas ya no valen
    docs.delete(srcId);
    destroyDoc(e);
    purgeThumbs(srcId, sig);
    e = undefined;
  }
  if (e) {
    // Map conserva orden de inserción: reinsertar convierte el acceso en LRU real.
    docs.delete(srcId);
    docs.set(srcId, e);
    return e;
  }
  // pdfjs transfiere (y deja inutilizable) el buffer que recibe → siempre darle una copia
  const loading = pdfjsLib.getDocument({ data: bytes.slice() }).promise;
  const entry: DocEntry = { sig, promise: loading, active: 0 };
  docs.set(srcId, entry);
  // Una carga fallida no se queda en caché: el siguiente intento vuelve a abrir el PDF
  loading.catch(() => {
    if (docs.get(srcId) === entry) docs.delete(srcId);
  });
  trimDocs(entry);
  return entry;
}

async function withDoc<T>(srcId: string, bytes: Uint8Array, fn: (doc: PDFDocumentProxy) => Promise<T> | T): Promise<T> {
  const entry = docFor(srcId, bytes);
  entry.active++;
  try {
    return await fn(await entry.promise);
  } finally {
    entry.active--;
    trimDocs();
  }
}

export async function getPageCount(srcId: string, bytes: Uint8Array): Promise<number> {
  return withDoc(srcId, bytes, (doc) => doc.numPages);
}

/** Dimensiones reales de la página en puntos PDF — para escalar overlays con exactitud. */
export async function getPageSizePt(
  srcId: string,
  bytes: Uint8Array,
  pageIndex: number
): Promise<{ width: number; height: number }> {
  return withDoc(srcId, bytes, async (doc) => {
    const page = await doc.getPage(pageIndex + 1);
    const vp = page.getViewport({ scale: 1 });
    return { width: vp.width, height: vp.height };
  });
}

export function renderPageDataUrl(
  srcId: string,
  bytes: Uint8Array,
  pageIndex: number,
  targetWidth = 180,
  /** true → canvas con alpha (sin papel blanco): el color de fondo se monta DEBAJO,
      idéntico a la capa vectorial de la exportación. */
  transparent = false
): Promise<string> {
  const key = thumbKey(srcId, bytesSignature(bytes), pageIndex, targetWidth, transparent);
  const hit = thumbs.get(key);
  if (hit) {
    // Map conserva orden de inserción: reinsertar convierte el acceso en LRU real.
    thumbs.delete(key);
    thumbs.set(key, hit);
    return hit.promise;
  }
  const t = withDoc(srcId, bytes, async (doc) => {
    const page = await doc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = (targetWidth * (window.devicePixelRatio || 1)) / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo crear el canvas de miniatura");
    await page.render({
      canvasContext: ctx,
      viewport,
      ...(transparent ? { background: "rgba(0,0,0,0)" } : {})
    }).promise;
    return canvas.toDataURL("image/png");
  });
  rememberThumbnail(key, t);
  return t;
}

/** Llamar al eliminar una fuente o recompilar un doc — libera memoria y invalida miniaturas. */
export function evictSource(srcId: string): void {
  const d = docs.get(srcId);
  docs.delete(srcId);
  if (d) destroyDoc(d);
  purgeThumbs(srcId);
}

/** Tamaño actual de las cachés (diagnóstico y pruebas). */
export function thumbnailCacheStats(): { thumbnails: number; bytes: number; docs: number } {
  return { thumbnails: thumbs.size, bytes: thumbBytes, docs: docs.size };
}
