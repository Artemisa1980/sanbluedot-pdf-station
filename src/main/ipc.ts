import { app, dialog, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from "electron";
import { readFile, rm, stat } from "fs/promises";
import { rmSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { htmlToPdf, type HtmlToPdfOptions } from "./htmlToPdf";
import { atomicWrite, createSerialQueue, draftFilePath, isPdfBytes, projectPath, sanitizeMyStyles } from "./guards";

/** Estado compartido con la ventana: ¿hay cambios sin guardar? (alimenta el aviso al cerrar) */
export const appState = { dirty: false };
const trustedRendererIds = new Set<number>();
const projectPaths = new Map<number, string>();

export function trustRenderer(contents: WebContents): void {
  trustedRendererIds.add(contents.id);
  contents.once("destroyed", () => {
    trustedRendererIds.delete(contents.id);
    projectPaths.delete(contents.id);
  });
}

function isTrusted(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return trustedRendererIds.has(event.sender.id) && event.senderFrame === event.sender.mainFrame;
}

function requireTrusted(event: IpcMainInvokeEvent): void {
  if (!isTrusted(event)) throw new Error("Solicitud rechazada: ventana no autorizada.");
}

/* Autosave de recuperación (v1.6): UN borrador rotativo en userData — un .sbstation
   normal + un meta chiquito (nombre/ruta/fecha) para mostrar info sin parsear el grande. */
const draftPath = () => path.join(app.getPath("userData"), "draft-recovery.sbstation");
const draftMetaPath = () => path.join(app.getPath("userData"), "draft-recovery.meta.json");
const myStylesPath = () => path.join(app.getPath("userData"), "my-styles.json");
// Escribir y borrar el borrador nunca se pisan: un autosave en vuelo no resucita un borrador ya borrado
const draftOp = createSerialQueue();
// Cada borrado al cerrar abre una generación nueva: un autosave que ya venía en camino
// (de antes del cierre) no puede resucitar el borrador que el cierre acaba de descartar
let draftGeneration = 0;
/* Topes de entradas chicas; el JSON del proyecto y del borrador no tiene tope porque lleva los PDFs */
const MAX_NAME_CHARS = 500;
const MAX_STYLES_CHARS = 1_000_000;

/** Limpieza síncrona del borrador — el evento close de la ventana no espera promesas. */
export function clearDraftSync(): void {
  draftGeneration += 1;
  try {
    rmSync(draftPath(), { force: true });
    rmSync(`${draftPath()}.tmp`, { force: true });
    rmSync(draftMetaPath(), { force: true });
  } catch {
    /* mejor esfuerzo: un borrador huérfano solo re-pregunta al abrir */
  }
}

export function registerIpc(): void {
  ipcMain.on("station:setDirty", (e, value: boolean) => {
    if (!isTrusted(e) || typeof value !== "boolean") return;
    appState.dirty = Boolean(value);
  });

  // Un solo diálogo para todo lo importable: PDFs y documentos MD/HTML
  ipcMain.handle("station:importFilesDialog", async (e) => {
    requireTrusted(e);
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
  ipcMain.handle("station:pickImagesDialog", async (e) => {
    requireTrusted(e);
    const res = await dialog.showOpenDialog({
      title: "Insertar imágenes",
      filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "webp", "gif", "svg"] }],
      properties: ["openFile", "multiSelections"]
    });
    if (res.canceled) return [];
    return res.filePaths.map((fp) => ({ name: path.basename(fp), url: pathToFileURL(fp).href }));
  });

  ipcMain.handle("station:exportPdfDialog", async (e, defaultName: string, bytesB64: string) => {
    requireTrusted(e);
    if (typeof defaultName !== "string" || typeof bytesB64 !== "string") {
      throw new Error("Datos de exportación inválidos.");
    }
    const bytes = Buffer.from(bytesB64, "base64");
    if (!isPdfBytes(bytes)) throw new Error("Datos de exportación inválidos.");
    const res = await dialog.showSaveDialog({
      title: "Exportar PDF",
      defaultPath: path.basename(defaultName),
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    });
    if (res.canceled || !res.filePath) return false;
    await atomicWrite(res.filePath, bytes);
    return true;
  });

  ipcMain.handle("station:htmlToPdf", async (e, html: string, opts: HtmlToPdfOptions) => {
    requireTrusted(e);
    if (
      typeof html !== "string" ||
      !opts ||
      !["letter", "a4"].includes(opts.pageSize) ||
      !["compact", "apa"].includes(opts.margins) ||
      typeof opts.pageNumbers !== "boolean" ||
      (opts.footerColor !== undefined && !/^#[0-9a-f]{6}$/i.test(opts.footerColor))
    ) {
      throw new Error("Opciones de compilación inválidas.");
    }
    const buf = await htmlToPdf(html, opts);
    return buf.toString("base64");
  });

  ipcMain.handle(
    "station:saveProjectDialog",
    async (e, json: string, currentPath: string | null, suggestedName?: string) => {
    requireTrusted(e);
    if (typeof json !== "string") throw new Error("Proyecto inválido.");
    const requestedPath = projectPath(currentPath);
    let target = requestedPath && projectPaths.get(e.sender.id) === requestedPath ? requestedPath : null;
    if (!target) {
      const res = await dialog.showSaveDialog({
        title: "Guardar proyecto",
        defaultPath: `${path.basename(typeof suggestedName === "string" ? suggestedName : "proyecto")}.sbstation`,
        filters: [{ name: "sanblueᵈᵒᵗ Station", extensions: ["sbstation"] }]
      });
      if (res.canceled || !res.filePath) return null;
      target = res.filePath;
    }
    await atomicWrite(target, json);
    projectPaths.set(e.sender.id, target);
    return target;
    }
  );

  // ── Borrador de recuperación: se sobrescribe mientras hay cambios sin guardar,
  //    se borra al guardar de verdad o cerrar limpio, sobrevive solo a muertes feas ──
  ipcMain.handle(
    "station:draftWrite",
    async (e, json: string, meta: { name: string; filePath: string | null }) => {
      requireTrusted(e);
      if (
        typeof json !== "string" ||
        !meta ||
        typeof meta.name !== "string" ||
        meta.name.length > MAX_NAME_CHARS ||
        (meta.filePath !== null && typeof meta.filePath !== "string")
      ) {
        throw new Error("Borrador inválido.");
      }
      // Escritura ATÓMICA (tmp + rename): si la máquina muere a mitad de una escritura,
      // el borrador anterior queda intacto — jamás un JSON a medias irrestaurable
      const filePath = draftFilePath(meta.filePath, projectPaths.get(e.sender.id));
      const generation = draftGeneration;
      await draftOp(async () => {
        if (generation !== draftGeneration) return;
        await atomicWrite(draftPath(), json);
        if (generation === draftGeneration) {
          await atomicWrite(draftMetaPath(), JSON.stringify({ name: meta.name, filePath, savedAt: Date.now() }));
        }
        // El cierre llegó a mitad de la escritura: lo recién escrito se descarta igual
        if (generation !== draftGeneration) {
          await rm(draftPath(), { force: true });
          await rm(draftMetaPath(), { force: true });
        }
      });
    }
  );

  ipcMain.handle("station:draftRead", async (e) => {
    requireTrusted(e);
    try {
      const json = await readFile(draftPath(), "utf-8");
      let meta: { name?: string; filePath?: string | null; savedAt?: number } = {};
      try {
        meta = JSON.parse(await readFile(draftMetaPath(), "utf-8"));
      } catch {
        /* sin meta: el borrador igual se puede restaurar */
      }
      const restoredPath = projectPath(meta.filePath);
      if (restoredPath) projectPaths.set(e.sender.id, restoredPath);
      return {
        json,
        name: meta.name ?? "Proyecto",
        filePath: restoredPath,
        savedAt: meta.savedAt ?? 0
      };
    } catch {
      return null;
    }
  });

  ipcMain.handle("station:draftClear", async (e) => {
    requireTrusted(e);
    await draftOp(async () => {
      await rm(draftPath(), { force: true });
      await rm(`${draftPath()}.tmp`, { force: true });
      await rm(draftMetaPath(), { force: true });
    });
  });

  ipcMain.handle("station:draftInfo", async (e) => {
    requireTrusted(e);
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
  ipcMain.handle("station:myStylesRead", async (e) => {
    requireTrusted(e);
    try {
      return sanitizeMyStyles(JSON.parse(await readFile(myStylesPath(), "utf-8")));
    } catch {
      return [];
    }
  });

  ipcMain.handle("station:myStylesWrite", async (e, list: unknown[]) => {
    requireTrusted(e);
    const json = Array.isArray(list) ? JSON.stringify(list) : "";
    if (!Array.isArray(list) || sanitizeMyStyles(list).length !== list.length || json.length > MAX_STYLES_CHARS) {
      throw new Error("Lista de estilos inválida.");
    }
    await atomicWrite(myStylesPath(), json);
  });

  ipcMain.handle("station:openProjectDialog", async (e) => {
    requireTrusted(e);
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
    // La ruta queda autorizada solo si el archivo se leyó: un fallo no deja un destino de guardado
    const json = await readFile(p, "utf-8");
    projectPaths.set(e.sender.id, p);
    return { path: p, json };
  });
}
