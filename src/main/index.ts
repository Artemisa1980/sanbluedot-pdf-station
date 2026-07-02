import { app, BrowserWindow, dialog } from "electron";
import path from "path";
import { appState, registerIpc } from "./ipc";

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: "sanblueᵈᵒᵗ pdf-station",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js")
    }
  });

  // Protección de trabajo: cerrar con cambios sin guardar pide confirmación
  win.on("close", (e) => {
    if (!appState.dirty) return;
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
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
