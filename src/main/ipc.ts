import { dialog, ipcMain } from "electron";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { htmlToPdf, type HtmlToPdfOptions } from "./htmlToPdf";

export function registerIpc(): void {
  ipcMain.handle("station:importPdfDialog", async () => {
    const res = await dialog.showOpenDialog({
      title: "Importar PDF",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: ["openFile", "multiSelections"]
    });
    if (res.canceled) return [];
    return Promise.all(
      res.filePaths.map(async (fp) => ({
        name: path.basename(fp),
        bytesB64: (await readFile(fp)).toString("base64")
      }))
    );
  });

  ipcMain.handle("station:importDocsDialog", async () => {
    const res = await dialog.showOpenDialog({
      title: "Abrir Markdown / HTML",
      filters: [{ name: "Markdown / HTML", extensions: ["md", "markdown", "html", "htm"] }],
      properties: ["openFile", "multiSelections"]
    });
    if (res.canceled) return [];
    return Promise.all(
      res.filePaths.map(async (fp) => ({
        name: path.basename(fp),
        kind: /\.(html?|htm)$/i.test(fp) ? "html" : "md",
        content: await readFile(fp, "utf-8")
      }))
    );
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
      filters: [{ name: "sanblueᵈᵒᵗ Station", extensions: ["sbstation"] }],
      properties: ["openFile"]
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const p = res.filePaths[0];
    return { path: p, json: await readFile(p, "utf-8") };
  });
}
