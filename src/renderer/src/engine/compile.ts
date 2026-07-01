import { marked } from "marked";
import { PDFDocument } from "pdf-lib";
import sanblueCss from "../assets/sanbluedot-pdf.css?raw";
import { b64ToBytes } from "../../../shared/b64";
import { evictBytes } from "./bytesCache";
import { evictSource } from "./thumbnails";
import { PRESETS } from "./presets";
import type { SourceDoc, StationProject } from "../../../shared/types";

/* Snippets EXACTOS de ~/Documents/Clodi-workspace/sanbluedot-signature-guide.md:
   masthead con <table> (nunca flexbox — mata el <sup>) y footer lockup. */

const MASTHEAD = `<table class="masthead" width="100%"><tr>
<td class="brand-cell"><span class="brand">sanblue<sup class="dot">dot</sup></span></td>
<td class="tagline-cell">retro dev-station</td>
</tr></table>`;

function footerHtml(doc: SourceDoc): string {
  const year = new Date().getFullYear();
  const lockup = `<div class="site-footer">
<span class="brand">sanblue<sup class="dot">dot</sup></span> — retro dev-station
<span class="copyright">© ${year} Sandy E. Quintero</span>
</div>`;
  if (doc.signature === "professional") return lockup;
  // Académico (UTEL): línea académica ARRIBA del lockup (doble footer)
  const line = doc.academicLine.trim();
  const academic = line
    ? `<p style="text-align:center;margin-top:2.2rem;margin-bottom:0;">sanblue<sup class="dot">dot</sup> — retro dev-station<br><sub>© ${year} Sandy E. Quintero · ${line}</sub></p>`
    : "";
  return academic + lockup;
}

export function buildDocHtml(doc: SourceDoc): string {
  const preset = PRESETS.find((p) => p.id === doc.preset) ?? PRESETS[0];
  const body =
    doc.kind === "md" ? (marked.parse(doc.content, { async: false }) as string) : doc.content;
  const sig = doc.signature !== "off";
  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><style>
${sanblueCss}
${preset.overrides}
</style></head>
<body>
${sig ? MASTHEAD : ""}
${body}
${sig ? footerHtml(doc) : ""}
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
