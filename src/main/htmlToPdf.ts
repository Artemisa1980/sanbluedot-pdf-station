import { BrowserWindow, session, type Session } from "electron";
import { writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

/** Márgenes en pulgadas (printToPDF los exige así): compact = 18mm arriba/abajo + 20mm izq/der; APA = 1" los cuatro. */
const MARGINS = {
  compact: { top: 0.709, bottom: 0.709, left: 0.787, right: 0.787 },
  apa: { top: 1, bottom: 1, left: 1, right: 1 }
} as const;

const COMPILE_TIMEOUT_MS = 120_000;

let isolatedCompileSession: Session | null = null;

function compileSession(): Session {
  if (isolatedCompileSession) return isolatedCompileSession;
  const isolated = session.fromPartition("pdf-station-compile", { cache: false });
  // Defensa adicional a la CSP: la compilación acepta recursos file:/data: locales,
  // pero nunca necesita HTTP(S), incluso si el HTML importado intenta pedirlo.
  isolated.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*"] },
    (_details, callback) => callback({ cancel: true })
  );
  // Un documento importado no pide permisos (cámara, notificaciones…): se niegan todos
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolatedCompileSession = isolated;
  return isolated;
}

export interface HtmlToPdfOptions {
  pageSize: "letter" | "a4";
  margins: "compact" | "apa";
  pageNumbers: boolean;
  /** Color del número de página — claro sobre papeles oscuros (default gris) */
  footerColor?: string;
}

/**
 * Compila HTML a PDF VECTORIAL con el motor de impresión de Chromium.
 * Nunca rasteriza: el texto sale seleccionable, igual que la extensión yzane.
 */
export async function htmlToPdf(html: string, opts: HtmlToPdfOptions): Promise<Buffer> {
  const tmp = path.join(tmpdir(), `station-compile-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  await writeFile(tmp, html, "utf-8");
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session: compileSession(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const print = (async () => {
    await win.loadFile(tmp);
    // Esperar a que las fuentes web terminen de cargar antes de imprimir
    await win.webContents.executeJavaScript("document.fonts.ready.then(() => true)");
    return win.webContents.printToPDF({
      pageSize: opts.pageSize === "letter" ? "Letter" : "A4",
      printBackground: true,
      margins: MARGINS[opts.margins],
      displayHeaderFooter: opts.pageNumbers,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;text-align:right;font-size:8px;padding-right:12mm;color:${opts.footerColor || "#5b6472"};font-family:Menlo,Consolas,monospace;"><span class="pageNumber"></span></div>`
    });
  })();
  // Si la ventana oculta se cuelga, la compilación termina con error en vez de esperar
  // para siempre (y dejar EXPORTAR bloqueado sin explicación)
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("La compilación tardó más de 2 minutos y se canceló.")), COMPILE_TIMEOUT_MS);
  });
  print.catch(() => {}); // un rechazo tardío, tras el timeout, no queda sin manejar
  try {
    return await Promise.race([print, timeout]);
  } finally {
    clearTimeout(timer);
    win.destroy();
    rm(tmp, { force: true }).catch(() => {});
  }
}
