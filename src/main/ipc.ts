import { app, dialog, ipcMain } from "electron";
import { readFile, rename, rm, stat, writeFile } from "fs/promises";
import { rmSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { htmlToPdf, type HtmlToPdfOptions } from "./htmlToPdf";

/** Estado compartido con la ventana: ¿hay cambios sin guardar? (alimenta el aviso al cerrar) */
export const appState = { dirty: false };

/* Autosave de recuperación (v1.6): UN borrador rotativo en userData — un .sbstation
   normal + un meta chiquito (nombre/ruta/fecha) para mostrar info sin parsear el grande. */
const draftPath = () => path.join(app.getPath("userData"), "draft-recovery.sbstation");
const draftMetaPath = () => path.join(app.getPath("userData"), "draft-recovery.meta.json");
const myStylesPath = () => path.join(app.getPath("userData"), "my-styles.json");

/** Limpieza síncrona del borrador — el evento close de la ventana no espera promesas. */
export function clearDraftSync(): void {
  try {
    rmSync(draftPath(), { force: true });
    rmSync(`${draftPath()}.tmp`, { force: true });
    rmSync(draftMetaPath(), { force: true });
  } catch {
    /* mejor esfuerzo: un borrador huérfano solo re-pregunta al abrir */
  }
}

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

  // ── Borrador de recuperación: se sobrescribe mientras hay cambios sin guardar,
  //    se borra al guardar de verdad o cerrar limpio, sobrevive solo a muertes feas ──
  ipcMain.handle(
    "station:draftWrite",
    async (_e, json: string, meta: { name: string; filePath: string | null }) => {
      // Escritura ATÓMICA (tmp + rename): si la máquina muere a mitad de una escritura,
      // el borrador anterior queda intacto — jamás un JSON a medias irrestaurable
      const tmp = `${draftPath()}.tmp`;
      await writeFile(tmp, json, "utf-8");
      await rename(tmp, draftPath());
      await writeFile(draftMetaPath(), JSON.stringify({ ...meta, savedAt: Date.now() }), "utf-8");
    }
  );

  ipcMain.handle("station:draftRead", async () => {
    try {
      const json = await readFile(draftPath(), "utf-8");
      let meta: { name?: string; filePath?: string | null; savedAt?: number } = {};
      try {
        meta = JSON.parse(await readFile(draftMetaPath(), "utf-8"));
      } catch {
        /* sin meta: el borrador igual se puede restaurar */
      }
      return {
        json,
        name: meta.name ?? "Proyecto",
        filePath: meta.filePath ?? null,
        savedAt: meta.savedAt ?? 0
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle("station:draftClear", async () => {
    await rm(draftPath(), { force: true });
    await rm(`${draftPath()}.tmp`, { force: true });
    await rm(draftMetaPath(), { force: true });
  });

  ipcMain.handle("station:draftInfo", async () => {
    try {
      const s = await stat(draftPath());
      let meta: { name?: string; savedAt?: number } = {};
      try {
        meta = JSON.parse(await readFile(draftMetaPath(), "utf-8"));
      } catch {
        /* sin meta: mtime del archivo como fecha */
      }
      return { name: meta.name ?? "Proyecto", savedAt: meta.savedAt ?? s.mtimeMs, size: s.size };
    } catch {
      return null;
    }
  });

  // ── Mis estilos: presets custom de Sandy, de la APP (todos los proyectos) ──
  ipcMain.handle("station:myStylesRead", async () => {
    try {
      const list = JSON.parse(await readFile(myStylesPath(), "utf-8"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  });

  ipcMain.handle("station:myStylesWrite", async (_e, list: unknown[]) => {
    await writeFile(myStylesPath(), JSON.stringify(list), "utf-8");
  });

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
