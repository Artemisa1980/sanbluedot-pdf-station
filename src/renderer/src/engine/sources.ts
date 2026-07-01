import { bytesFor } from "./bytesCache";
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
