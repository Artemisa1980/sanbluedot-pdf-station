import { app, BrowserWindow, dialog } from "electron";
import path from "path";
import { appState, clearDraftSync, registerIpc, trustRenderer } from "./ipc";

let mainWindow: BrowserWindow | null = null;
let productionNetworkBlocked = false;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "sanblueᵈᵒᵗ pdf-station",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  mainWindow = win;
  trustRenderer(win.webContents);

  if (!process.env.ELECTRON_RENDERER_URL && !productionNetworkBlocked) {
    // En producción la estación es literalmente offline: ni siquiera localhost.
    win.webContents.session.webRequest.onBeforeRequest(
      { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
      (_details, callback) => callback({ cancel: true })
    );
    productionNetworkBlocked = true;
  }

  // La estación no navega: archivos importados son datos, nunca destinos del renderer.
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Protección de trabajo: cerrar con cambios sin guardar pide confirmación
  win.on("close", (e) => {
    if (!appState.dirty) {
      // Cierre limpio: el borrador de recuperación ya no protege nada
      clearDraftSync();
      return;
    }
    const choice = dialog.showMessageBoxSync(win, {
      type: "warning",
      buttons: ["Cancelar", "Cerrar sin guardar"],
      defaultId: 0,
      cancelId: 0,
      title: "Cambios sin guardar",
      message: "Hay cambios sin guardar en el proyecto.",
      detail: "Si cierras ahora se perderán. Guarda con Cmd+S antes de salir."
    });
    if (choice === 0) e.preventDefault();
    // "Cerrar sin guardar" es decisión consciente: descarta también el borrador —
    // el autosave solo debe sobrevivir a muertes que Sandy NO eligió (crash, apagón)
    else clearDraftSync();
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
