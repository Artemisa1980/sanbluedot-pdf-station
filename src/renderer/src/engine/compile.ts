import { marked } from "marked";
import { PDFDocument } from "pdf-lib";
import sanblueCss from "../assets/sanbluedot-pdf.css?raw";
import { b64ToBytes } from "../../../shared/b64";
import { evictBytes } from "./bytesCache";
import { evictSource } from "./thumbnails";
import { PRESETS } from "./presets";
import type { SourceDoc, StationProject } from "../../../shared/types";

/* La firma sanblueᵈᵒᵗ NO se inyecta aquí: vive dentro del contenido del documento
   (los docs de Sandy ya traen masthead/footer; la plantilla de doc nuevo también). */

export function buildDocHtml(doc: SourceDoc): string {
  const preset = PRESETS.find((p) => p.id === doc.preset) ?? PRESETS[0];
  const body =
    doc.kind === "md" ? (marked.parse(doc.content, { async: false }) as string) : doc.content;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><style>
${sanblueCss}
/* Estación: body transparente para que el fondo por página (capa vectorial del
   organizador) llene TODA la hoja y no solo los márgenes. Sin fondo aplicado se
   ve blanco igual. Los presets con color propio lo pisan justo después. */
body { background: transparent; }
${preset.overrides}
</style></head>
<body>
${body}
</body>
</html>`;
}

/** Compila el doc a PDF vectorial (printToPDF) y devuelve bytes + conteo real de páginas. */
export async function compileDoc(
  doc: SourceDoc,
  project: StationProject
): Promise<{ compiledB64: string; pageCount: number }> {
  const html = buildDocHtml(doc);
  const compiledB64 = await window.station.htmlToPdf(html, {
    pageSize: project.pageSize,
    margins: project.margins,
    pageNumbers: true
  });
  const pdf = await PDFDocument.load(b64ToBytes(compiledB64));
  // Invalidar miniaturas y bytes viejos del doc — la versión anterior ya no existe
  evictSource(doc.id);
  evictBytes(doc.id);
  return { compiledB64, pageCount: pdf.getPageCount() };
}
