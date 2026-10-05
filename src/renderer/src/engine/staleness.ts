import { resolveStyle } from "./presets";
import type { SourceDoc, StationProject } from "../../../shared/types";

/** Firma de todo lo que cambia el PDF de un doc: texto, estilo, preset, página y márgenes. */
export function docSignature(
  doc: Pick<SourceDoc, "content" | "preset" | "style">,
  project: Pick<StationProject, "pageSize" | "margins">
): string {
  return JSON.stringify([doc.content, resolveStyle(doc), doc.preset, project.pageSize, project.margins]);
}

/**
 * Un doc compilado cuyo PDF ya no corresponde a su fuente: hay que recompilarlo antes de
 * exportar. Proyectos de antes de v1.10 no guardan la firma, así que se recompilan una vez.
 */
export function isStale(
  doc: Pick<SourceDoc, "content" | "preset" | "style" | "compiledB64" | "compiledSig">,
  project: Pick<StationProject, "pageSize" | "margins">
): boolean {
  return Boolean(doc.compiledB64) && doc.compiledSig !== docSignature(doc, project);
}
