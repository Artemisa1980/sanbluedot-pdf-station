import { PDFDocument, PDFFont, StandardFonts, degrees, rgb } from "pdf-lib";
import { b64ToBytes } from "../../../shared/b64";
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

export async function exportProject(project: StationProject): Promise<Uint8Array> {
  if (project.pages.length === 0) throw new Error("El documento está vacío.");

  const out = await PDFDocument.create();
  const srcDocs = new Map<string, PDFDocument>();
  let font: PDFFont | null = null;

  for (const ref of project.pages) {
    let src = srcDocs.get(ref.srcId);
    if (!src) {
      src = await PDFDocument.load(srcBytes(project, ref));
      srcDocs.set(ref.srcId, src);
    }

    if (!ref.background && ref.patches.length === 0) {
      // Camino directo: transfusión pura
      const [copied] = await out.copyPages(src, [ref.pageIndex]);
      if (ref.rotation) {
        copied.setRotation(degrees((copied.getRotation().angle + ref.rotation) % 360));
      }
      out.addPage(copied);
      continue;
    }

    // Camino de capas: fondo → original → parches (todo vectorial)
    const [embedded] = await out.embedPdf(src, [ref.pageIndex]);
    const { width, height } = embedded;
    const page = out.addPage([width, height]);

    if (ref.background) {
      page.drawRectangle({ x: 0, y: 0, width, height, color: hexToRgb(ref.background) });
    }

    page.drawPage(embedded);

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
