import { bytesFor } from "./bytesCache";
import { resolveStyle } from "./presets";
import type { PageRef, StationProject } from "../../../shared/types";

/** Resuelve el nombre y los bytes del PDF fuente de una página (importado o doc compilado). */
export function sourceFor(
  project: StationProject,
  p: PageRef
): { name: string; bytes: Uint8Array } | null {
  if (p.srcKind === "pdf") {
    const pdf = project.pdfs.find((x) => x.id === p.srcId);
    return pdf ? { name: pdf.name.replace(/\.pdf$/i, ""), bytes: bytesFor(pdf.id, pdf.bytesB64) } : null;
  }
  const doc = project.docs.find((x) => x.id === p.srcId);
  return doc?.compiledB64 ? { name: doc.name, bytes: bytesFor(doc.id, doc.compiledB64) } : null;
}

/**
 * Fondo efectivo de una página: el manual manda; si no hay, un doc con papel de color
 * pinta su hoja COMPLETA (printToPDF deja los márgenes blancos — verificado 2026-07-02 —
 * así que la exportación y los previews ponen esta capa debajo).
 */
export function effectiveBackground(project: StationProject, p: PageRef): string | null {
  if (p.background) return p.background;
  if (p.srcKind === "doc") {
    const doc = project.docs.find((x) => x.id === p.srcId);
    if (doc) {
      const bg = resolveStyle(doc).bgColor;
      if (bg.toLowerCase() !== "#ffffff") return bg;
    }
  }
  return null;
}
