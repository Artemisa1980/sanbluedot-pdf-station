import { marked } from "marked";
import { PDFDocument } from "pdf-lib";
import sanblueCss from "../assets/sanbluedot-pdf.css?raw";
import { b64ToBytes } from "../../../shared/b64";
import { evictBytes } from "./bytesCache";
import { evictSource } from "./thumbnails";
import { fontById } from "./fonts";
import { presetById, resolveStyle } from "./presets";
import type { DocStyle, SourceDoc, StationProject } from "../../../shared/types";

/* La firma sanblueᵈᵒᵗ NO se inyecta aquí: vive dentro del contenido del documento
   (los docs de Sandy ya traen masthead/footer; la plantilla de doc nuevo también). */

/** CSS del estilo granular — pisa al preset. Todo es CSS puro → printToPDF vectorial. */
function granularCss(style: DocStyle): string {
  const font = fontById(style.fontId);
  // Blanco = transparente: deja pasar el fondo por página (capa vectorial del organizador).
  // Con color, el body pinta el ÁREA DE CONTENIDO; los márgenes de la hoja los pinta la
  // capa vectorial automática de la exportación (verificado 2026-07-02: printToPDF nunca
  // pinta los márgenes, ni siquiera con background en el html).
  const bg = style.bgColor.toLowerCase() === "#ffffff" ? "" : `background:${style.bgColor};`;
  return `body{font-family:${font.stack};font-size:${style.fontSizePt}pt;line-height:${style.lineHeight};color:${style.textColor};${bg}}
th{background:${style.thBg};color:${style.thText}}`;
}

/** Luminancia relativa aproximada del papel — decide el color del número de página. */
export function isDarkPaper(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

export function buildDocHtml(doc: SourceDoc): string {
  const preset = presetById(doc.preset);
  const style = resolveStyle(doc);
  const font = fontById(style.fontId);
  const body =
    doc.kind === "md" ? (marked.parse(doc.content, { async: false }) as string) : doc.content;
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><style>
${font.faces ?? ""}
${sanblueCss}
/* Estación: body transparente para que el fondo por página (capa vectorial del
   organizador) llene TODA la hoja y no solo los márgenes. Sin fondo aplicado se
   ve blanco igual. El estilo del documento lo pisa justo después. */
body { background: transparent; }
${preset.overrides}
${granularCss(style)}
</style></head>
<body>
${body}
</body>
</html>`;
}

/** Compila el HTML del doc a PDF vectorial. NO toca cachés — para maquetas efímeras. */
export async function compileDocRaw(doc: SourceDoc, project: StationProject): Promise<string> {
  const style = resolveStyle(doc);
  return window.station.htmlToPdf(buildDocHtml(doc), {
    pageSize: project.pageSize,
    margins: project.margins,
    pageNumbers: true,
    footerColor: isDarkPaper(style.bgColor) ? "#9fb3c8" : "#5b6472"
  });
}

/** Compila el doc al documento maestro: bytes + conteo real de páginas, cachés invalidados. */
export async function compileDoc(
  doc: SourceDoc,
  project: StationProject
): Promise<{ compiledB64: string; pageCount: number }> {
  const compiledB64 = await compileDocRaw(doc, project);
  const pdf = await PDFDocument.load(b64ToBytes(compiledB64));
  // Invalidar miniaturas y bytes viejos del doc — la versión anterior ya no existe
  evictSource(doc.id);
  evictBytes(doc.id);
  return { compiledB64, pageCount: pdf.getPageCount() };
}
