import type { StationProject } from "../../../shared/types";

export function serialize(project: StationProject): string {
  return JSON.stringify(project);
}

export function deserialize(json: string): StationProject {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("El archivo no es un proyecto .sbstation válido (JSON dañado).");
  }
  const p = data as StationProject;
  if (
    p == null ||
    p.version !== 1 ||
    !Array.isArray(p.docs) ||
    !Array.isArray(p.pdfs) ||
    !Array.isArray(p.pages)
  ) {
    throw new Error("El archivo no es un proyecto .sbstation válido (estructura desconocida).");
  }
  // Nota: proyectos guardados con el campo de firma viejo simplemente lo ignoran —
  // la firma ahora vive únicamente dentro del contenido de cada documento.
  return p;
}
