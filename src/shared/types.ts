export type PageSize = "letter" | "a4";
export type MarginPreset = "compact" | "apa";
export type SignatureMode = "academic" | "professional" | "off";
export type Rotation = 0 | 90 | 180 | 270;

export interface Patch {
  id: string;
  /** Normalizados 0–1, origen arriba-izquierda (la conversión a puntos PDF vive solo en el motor de exportación) */
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  text: string;
  textColor: string;
  fontSize: number; // pt
}

export interface PageRef {
  id: string;
  srcId: string; // id de ImportedPdf o SourceDoc
  srcKind: "pdf" | "doc";
  pageIndex: number; // 0-based dentro del PDF fuente
  rotation: Rotation;
  background: string | null; // hex o null
  patches: Patch[];
}

export interface SourceDoc {
  id: string;
  name: string;
  kind: "md" | "html";
  content: string;
  preset: string;
  signature: SignatureMode;
  academicLine: string;
  compiledB64: string | null; // PDF compilado — se persiste para restaurar sin recompilar
}

export interface ImportedPdf {
  id: string;
  name: string;
  bytesB64: string; // el PDF viaja dentro del .sbstation
}

export interface StationProject {
  version: 1;
  name: string;
  pageSize: PageSize;
  margins: MarginPreset;
  docs: SourceDoc[];
  pdfs: ImportedPdf[];
  pages: PageRef[];
}
