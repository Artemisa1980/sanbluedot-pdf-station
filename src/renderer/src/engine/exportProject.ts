import {
  PDFDocument,
  PDFEmbeddedPage,
  PDFFont,
  PDFPage,
  StandardFonts,
  degrees,
  rgb,
  type PageBoundingBox
} from "pdf-lib";
import { b64ToBytes } from "../../../shared/b64";
import { effectiveBackground } from "./sources";
import type { PageRef, StationProject } from "../../../shared/types";

/**
 * EL CORAZÓN DE LA ESTACIÓN — Principio 1 del framework: nunca rasterizar.
 *
 * - Página sin fondo ni parches → copyPages: transfusión pura del contenido original.
 * - Página con fondo/parches → truco de capas vectorial: rectángulo de color debajo,
 *   la página original incrustada encima (embedPdf), parches encima de todo.
 *   El contenido original jamás se reescribe ni se rasteriza.
 */

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function srcBytes(project: StationProject, ref: PageRef): Uint8Array {
  if (ref.srcKind === "pdf") {
    const pdf = project.pdfs.find((p) => p.id === ref.srcId);
    if (!pdf) throw new Error(`Fuente PDF no encontrada (${ref.srcId}).`);
    return b64ToBytes(pdf.bytesB64);
  }
  const doc = project.docs.find((d) => d.id === ref.srcId);
  if (!doc) throw new Error(`Documento no encontrado (${ref.srcId}).`);
  if (!doc.compiledB64) throw new Error(`El documento "${doc.name}" no está compilado — ábrelo y dale ⚡ Compilar.`);
  return b64ToBytes(doc.compiledB64);
}

/**
 * Caja visible de la página: CropBox recortada a la MediaBox, igual que pdf.js en las
 * miniaturas y el editor de parches. Incrustar la MediaBox completa (lo que hace embedPdf
 * por defecto) revelaba lo recortado, cambiaba el tamaño de la hoja y movía los parches.
 */
function visibleBox(page: PDFPage): PageBoundingBox {
  const toBox = ({ x, y, width, height }: { x: number; y: number; width: number; height: number }) => ({
    left: Math.min(x, x + width),
    bottom: Math.min(y, y + height),
    right: Math.max(x, x + width),
    top: Math.max(y, y + height)
  });
  const media = toBox(page.getMediaBox());
  const crop = toBox(page.getCropBox());
  const box = {
    left: Math.max(media.left, crop.left),
    bottom: Math.max(media.bottom, crop.bottom),
    right: Math.min(media.right, crop.right),
    top: Math.min(media.top, crop.top)
  };
  return box.right > box.left && box.top > box.bottom ? box : media;
}

export async function exportProject(project: StationProject): Promise<Uint8Array> {
  if (project.pages.length === 0) throw new Error("El documento está vacío.");

  const out = await PDFDocument.create();
  const srcDocs = new Map<string, PDFDocument>();
  let font: PDFFont | null = null;

  for (const ref of project.pages) {
    if (!srcDocs.has(ref.srcId)) srcDocs.set(ref.srcId, await PDFDocument.load(srcBytes(project, ref)));
  }

  // Fondo efectivo: manual o el papel de color del doc (pinta la hoja completa,
  // márgenes incluidos — printToPDF los deja blancos, verificado 2026-07-02)
  const plans = project.pages.map((ref) => {
    const background = effectiveBackground(project, ref);
    return { ref, background, layered: Boolean(background) || ref.patches.length > 0 };
  });

  // Copiar e incrustar EN LOTE por fuente: pdf-lib crea un copiador nuevo en cada llamada,
  // así que página por página duplicaba los recursos compartidos (fuentes, imágenes) una
  // vez por hoja — 40 páginas de un PDF de 300 KB salían en 12 MB. Una página repetida en
  // el camino directo va en otra tanda: cada copia conserva sus propios objetos (una
  // anotación no puede pertenecer a dos páginas).
  const batches = new Map<string, { src: PDFDocument; layered: boolean; slots: number[] }>();
  const copiesSoFar = new Map<string, number>();
  plans.forEach(({ ref, layered }, slot) => {
    let round = 0;
    if (!layered) {
      const pageKey = JSON.stringify([ref.srcId, ref.pageIndex]);
      round = copiesSoFar.get(pageKey) ?? 0;
      copiesSoFar.set(pageKey, round + 1);
    }
    const key = JSON.stringify([ref.srcId, layered, round]);
    let batch = batches.get(key);
    if (!batch) {
      batch = { src: srcDocs.get(ref.srcId)!, layered, slots: [] };
      batches.set(key, batch);
    }
    batch.slots.push(slot);
  });

  const copied = new Map<number, PDFPage>();
  const embedded = new Map<number, PDFEmbeddedPage>();
  for (const { src, layered, slots } of batches.values()) {
    if (!layered) {
      const pages = await out.copyPages(src, slots.map((slot) => plans[slot].ref.pageIndex));
      pages.forEach((page, k) => copied.set(slots[k], page));
      continue;
    }
    // Una hoja en blanco sin /Contents no se puede incrustar: lleva solo fondo y parches
    const withContent = slots.filter((slot) => src.getPage(plans[slot].ref.pageIndex).node.Contents());
    const srcPages = withContent.map((slot) => src.getPage(plans[slot].ref.pageIndex));
    const pages = await out.embedPages(srcPages, srcPages.map(visibleBox));
    pages.forEach((page, k) => embedded.set(withContent[k], page));
  }

  for (const [slot, { ref, background, layered }] of plans.entries()) {
    if (!layered) {
      // Camino directo: transfusión pura
      const page = copied.get(slot)!;
      if (ref.rotation) {
        page.setRotation(degrees((page.getRotation().angle + ref.rotation) % 360));
      }
      out.addPage(page);
      continue;
    }

    // Camino de capas: fondo → original → parches (todo vectorial)
    const box = visibleBox(srcDocs.get(ref.srcId)!.getPage(ref.pageIndex));
    const width = box.right - box.left;
    const height = box.top - box.bottom;
    const page = out.addPage([width, height]);

    if (background) {
      page.drawRectangle({ x: 0, y: 0, width, height, color: hexToRgb(background) });
    }

    const original = embedded.get(slot);
    if (original) page.drawPage(original);

    for (const p of ref.patches) {
      const x = p.x * width;
      const w = p.w * width;
      const h = p.h * height;
      const y = height - (p.y + p.h) * height; // normalizado top-left → puntos PDF bottom-left
      page.drawRectangle({ x, y, width: w, height: h, color: hexToRgb(p.color) });
      if (p.text.trim()) {
        if (!font) font = await out.embedFont(StandardFonts.Helvetica);
        const size = p.fontSize;
        const lineHeight = size * 1.3;
        const pad = size * 0.4;
        p.text.split("\n").forEach((line, i) => {
          page.drawText(line, {
            x: x + pad,
            y: y + h - pad - size - i * lineHeight,
            size,
            font: font!,
            color: hexToRgb(p.textColor)
          });
        });
      }
    }

    if (ref.rotation) page.setRotation(degrees(ref.rotation));
  }

  return out.save();
}
