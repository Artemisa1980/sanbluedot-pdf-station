import type { CustomStylePreset, MarginPreset, PageSize } from "../shared/types";

/** Un archivo importable: PDF (bytes) o documento MD/HTML (texto) */
export type ImportedFile =
  | { name: string; kind: "pdf"; bytesB64: string }
  | { name: string; kind: "md" | "html"; content: string };

export interface StationApi {
  importFilesDialog(): Promise<ImportedFile[]>;
  /** Diálogo de imágenes → nombre + URL file:// canónica lista para incrustar */
  pickImagesDialog(): Promise<Array<{ name: string; url: string }>>;
  exportPdfDialog(defaultName: string, bytesB64: string): Promise<boolean>;
  htmlToPdf(
    html: string,
    opts: { pageSize: PageSize; margins: MarginPreset; pageNumbers: boolean; footerColor?: string }
  ): Promise<string>;
  saveProjectDialog(json: string, currentPath: string | null, suggestedName?: string): Promise<string | null>;
  openProjectDialog(): Promise<{ path: string; json: string } | null>;
  setDirty(value: boolean): void;
  /** Autosave de recuperación: un borrador rotativo en userData (json = .sbstation normal) */
  draftWrite(json: string, meta: { name: string; filePath: string | null }): Promise<void>;
  draftRead(): Promise<{ json: string; name: string; filePath: string | null; savedAt: number } | null>;
  draftClear(): Promise<void>;
  draftInfo(): Promise<{ name: string; savedAt: number; size: number } | null>;
  /** "Mis estilos": presets custom de Sandy, guardados en la app para todos los proyectos */
  myStylesRead(): Promise<CustomStylePreset[]>;
  myStylesWrite(list: CustomStylePreset[]): Promise<void>;
}

declare global {
  interface Window {
    station: StationApi;
  }
}
