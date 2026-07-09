export type PageSize = "letter" | "a4";
export type MarginPreset = "compact" | "apa";
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

/** Estética granular de un documento propio — CSS puro inyectado al compilar (siempre vectorial). */
export interface DocStyle {
  fontId: string; // id de FONT_CHOICES (engine/fonts.ts)
  fontSizePt: number;
  lineHeight: number;
  bgColor: string; // "#ffffff" = hoja transparente (deja pasar el fondo por página del organizador)
  textColor: string;
  thBg: string; // encabezado de tabla
  thText: string;
}

/** Preset personalizado de Sandy ("Mis estilos") — vive en la APP (userData), no en el
 *  proyecto: disponible en todos los proyectos. Al aplicarlo, el doc recibe su COPIA de
 *  los valores → borrar el preset después jamás cambia documentos existentes. */
export interface CustomStylePreset {
  id: string;
  label: string;
  /** Preset de fábrica del que partió — aporta su CSS extra (overrides) al compilar */
  baseId: string;
  style: DocStyle;
}

export interface SourceDoc {
  id: string;
  name: string;
  kind: "md" | "html";
  content: string;
  preset: string;
  /** Ausente en proyectos v1.0 viejos → se resuelve con la base del preset (misma apariencia de siempre) */
  style?: DocStyle;
  // La firma sanblueᵈᵒᵗ viaja DENTRO del contenido del documento (masthead/footer en el md/html)
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
