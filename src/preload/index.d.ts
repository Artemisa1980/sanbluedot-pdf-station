import type { MarginPreset, PageSize } from "../shared/types";

export interface StationApi {
  importPdfDialog(): Promise<{ name: string; bytesB64: string }[]>;
  importDocsDialog(): Promise<{ name: string; kind: "md" | "html"; content: string }[]>;
  exportPdfDialog(defaultName: string, bytesB64: string): Promise<boolean>;
  htmlToPdf(
    html: string,
    opts: { pageSize: PageSize; margins: MarginPreset; pageNumbers: boolean }
  ): Promise<string>;
  saveProjectDialog(json: string, currentPath: string | null, suggestedName?: string): Promise<string | null>;
  openProjectDialog(): Promise<{ path: string; json: string } | null>;
}

declare global {
  interface Window {
    station: StationApi;
  }
}
