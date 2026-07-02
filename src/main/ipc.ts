import { dialog, ipcMain } from "electron";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { htmlToPdf, type HtmlToPdfOptions } from "./htmlToPdf";

/** Estado compartido con la ventana: ¿hay cambios sin guardar? (alimenta el aviso al cerrar) */
export const appState = { dirty: false };

export function registerIpc(): void {
  ipcMain.on("station:setDirty", (_e, value: boolean) => {
    appState.dirty = Boolean(value);
  });

  // Un solo diálogo para todo lo importable: PDFs y documentos MD/HTML
  ipcMain.handle("station:importFilesDialog", async () => {
    const res = await dialog.showOpenDialog({
      title: "Agregar a la estación",
      filters: [
        { name: "PDF / Markdown / HTML", extensions: ["pdf", "md", "markdown", "html", "htm"] },
        { name: "Todos los archivos", extensions: ["*"] }
      ],
      properties: ["openFile", "multiSelections"]
    });
    if (res.canceled) return [];
    return Promise.all(
      res.filePaths.map(async (fp) => {
        const name = path.basename(fp);
        if (/\.pdf$/i.test(fp)) {
          return { name, kind: "pdf" as const, bytesB64: (await readFile(fp)).toString("base64") };
        }
        const kind = /\.(html?|htm)$/i.test(fp) ? ("html" as const) : ("md" as const);
        return { name, kind, content: await readFile(fp, "utf-8") };
      })
    );
  });

  // Elegir imágenes → URLs file:// canónicas (pathToFileURL codifica espacios, unicode, #…)
  // listas para incrustar. Las rutas relativas NO sobreviven la compilación: el HTML se
  // imprime desde un archivo temporal, así que la ruta absoluta es la única segura.
  ipcMain.handle("station:pickImagesDialog", async () => {
    const res = await dialog.showOpenDialog({
      title: "Insertar imágenes",
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
      properties: ["openFile", "multiSelections"]
    });
    if (res.canceled) return [];
    return res.filePaths.map((fp) => ({ name: path.basename(fp), url: pathToFileURL(fp).href }));
  });

  ipcMain.handle("station:exportPdfDialog", async (_e, defaultName: string, bytesB64: string) => {
    const res = await dialog.showSaveDialog({
      title: "Exportar PDF",
      defaultPath: defaultName,
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (res.canceled || !res.filePath) return false;
    await writeFile(res.filePath, Buffer.from(bytesB64, "base64"));
    return true;
  });

  ipcMain.handle("station:htmlToPdf", async (_e, html: string, opts: HtmlToPdfOptions) => {
    const buf = await htmlToPdf(html, opts);
    return buf.toString("base64");
  });

  ipcMain.handle(
    "station:saveProjectDialog",
    async (_e, json: string, currentPath: string | null, suggestedName?: string) => {
    let target = currentPath;
    if (!target) {
      const res = await dialog.showSaveDialog({
        title: "Guardar proyecto",
        defaultPath: `${suggestedName || "proyecto"}.sbstation`,
        filters: [{ name: "sanblueᵈᵒᵗ Station", extensions: ["sbstation"] }]
      });
      if (res.canceled || !res.filePath) return null;
      target = res.filePath;
    }
    await writeFile(target, json, "utf-8");
    return target;
    }
  );

  ipcMain.handle("station:openProjectDialog", async () => {
    const res = await dialog.showOpenDialog({
      title: "Abrir proyecto",
      // macOS a veces no reconoce extensiones custom → el segundo filtro garantiza poder elegir
      filters: [
        { name: "sanblueᵈᵒᵗ Station", extensions: ["sbstation"] },
        { name: "Todos los archivos", extensions: ["*"] }
      ],
      properties: ["openFile"]
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const p = res.filePaths[0];
    return { path: p, json: await readFile(p, "utf-8") };
  });
}
